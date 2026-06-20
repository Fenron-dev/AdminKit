package virustotal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	vtUploadURL   = "https://www.virustotal.com/api/v3/files"
	vtAnalysesURL = "https://www.virustotal.com/api/v3/analyses/"
	maxUploadMB   = 32
)

// vtAnalysisReport ist die Antwortstruktur von GET /api/v3/analyses/{id}.
type vtAnalysisReport struct {
	Data struct {
		Attributes struct {
			Status string `json:"status"` // "queued", "in-progress", "completed"
			Stats  struct {
				Malicious  int `json:"malicious"`
				Suspicious int `json:"suspicious"`
				Undetected int `json:"undetected"`
				Harmless   int `json:"harmless"`
			} `json:"stats"`
		} `json:"attributes"`
	} `json:"data"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// UploadFile lädt eine Datei zu VirusTotal hoch und wartet auf das Analyseergebnis.
// Die Datei verlässt das lokale System — Nutzer-Zustimmung muss vorher eingeholt werden.
// Max. Dateigröße: 32 MB. Wartezeit bis Analyse: bis zu 5 Minuten.
func (c *Client) UploadFile(ctx context.Context, filePath string) (CheckResult, error) {
	name := filepath.Base(filePath)
	result := CheckResult{Name: name, Path: filePath, ItemID: "upload:" + filePath}

	// Hash vorab berechnen (für SHA256-Feld + Permalink)
	hash, _ := SHA256File(filePath)
	result.SHA256 = hash

	// Dateigröße prüfen
	data, err := readFileForUpload(filePath, maxUploadMB)
	if err != nil {
		result.Status = "error"
		result.ErrorMsg = err.Error()
		return result, err
	}

	// Rate-Limiting
	c.throttle(ctx)
	if ctx.Err() != nil {
		result.Status = "error"
		result.ErrorMsg = "abgebrochen"
		return result, ctx.Err()
	}

	// Tageslimit
	c.mu.Lock()
	if time.Now().After(c.dayReset) {
		c.callsToday = 0
		c.dayReset = nextMidnight()
	}
	if c.callsToday >= dailyLimit {
		c.mu.Unlock()
		result.Status = "error"
		result.ErrorMsg = "Tageslimit erreicht (500/Tag)"
		return result, fmt.Errorf(result.ErrorMsg)
	}
	c.callsToday++
	c.mu.Unlock()

	// Multipart-Body aufbauen
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", name)
	if err != nil {
		result.Status = "error"
		result.ErrorMsg = err.Error()
		return result, err
	}
	fw.Write(data)
	mw.Close()

	// POST /api/v3/files
	uploadClient := &http.Client{Timeout: 120 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "POST", vtUploadURL, &buf)
	if err != nil {
		result.Status = "error"
		result.ErrorMsg = err.Error()
		return result, err
	}
	req.Header.Set("x-apikey", c.apiKey)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Accept", "application/json")

	resp, err := uploadClient.Do(req)
	if err != nil {
		result.Status = "error"
		result.ErrorMsg = "Upload-Fehler: " + err.Error()
		return result, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))

	var uploadResp struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
		Error *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &uploadResp); err != nil {
		result.Status = "error"
		result.ErrorMsg = fmt.Sprintf("Upload-Antwort ungültig (HTTP %d)", resp.StatusCode)
		return result, fmt.Errorf(result.ErrorMsg)
	}
	if uploadResp.Error != nil {
		result.Status = "error"
		result.ErrorMsg = uploadResp.Error.Message
		return result, fmt.Errorf(result.ErrorMsg)
	}

	analysisID := uploadResp.Data.ID

	// Auf Analyse-Abschluss warten (max. 5 Minuten, alle 15s pollen)
	deadline := time.Now().Add(5 * time.Minute)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			result.Status = "error"
			result.ErrorMsg = "abgebrochen"
			return result, ctx.Err()
		case <-time.After(15 * time.Second):
		}

		analysis, err := c.fetchAnalysis(ctx, analysisID)
		if err != nil {
			continue
		}
		if analysis.Data.Attributes.Status != "completed" {
			continue
		}

		stats := analysis.Data.Attributes.Stats
		total := stats.Malicious + stats.Suspicious + stats.Undetected + stats.Harmless
		result.Engines = total
		result.Detections = stats.Malicious + stats.Suspicious
		if hash != "" {
			result.Permalink = "https://www.virustotal.com/gui/file/" + hash
		}
		switch {
		case stats.Malicious > 0:
			result.Status = "malicious"
		case stats.Suspicious > 0:
			result.Status = "suspicious"
		default:
			result.Status = "clean"
		}
		return result, nil
	}

	result.Status = "error"
	result.ErrorMsg = "Analyse-Timeout (5 Minuten überschritten)"
	return result, fmt.Errorf(result.ErrorMsg)
}

func (c *Client) fetchAnalysis(ctx context.Context, id string) (*vtAnalysisReport, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", vtAnalysesURL+id, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-apikey", c.apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if err != nil {
		return nil, err
	}

	var report vtAnalysisReport
	if err := json.Unmarshal(body, &report); err != nil {
		return nil, err
	}
	return &report, nil
}

func readFileForUpload(path string, maxMB int) ([]byte, error) {
	const limit = int64(maxMB) * 1024 * 1024
	f, err := os.Open(cleanPath(path))
	if err != nil {
		return nil, fmt.Errorf("Datei nicht lesbar: %w", err)
	}
	defer f.Close()

	limited := io.LimitReader(f, limit+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("Lesefehler: %w", err)
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("Datei zu groß (max %d MB)", maxMB)
	}
	return data, nil
}
