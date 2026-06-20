// Package virustotal stellt einen VirusTotal-v3-Client für AdminKit bereit.
// Es werden ausschließlich Hash-Lookups durchgeführt — keine Datei-Uploads.
// Die Datei verlässt das System nie; nur der SHA256-Hash wird an VT übermittelt.
package virustotal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	vtBaseURL    = "https://www.virustotal.com/api/v3/files/"
	minInterval  = 16 * time.Second // 4 req/min Free-Tier: 60s/4 = 15s + 1s Puffer
	dailyLimit   = 500
)

// Client ist ein VirusTotal-API-Client mit eingebautem Rate-Limiting.
type Client struct {
	apiKey      string
	http        *http.Client
	mu          sync.Mutex
	lastRequest time.Time
	callsToday  int
	dayReset    time.Time
}

// NewClient erstellt einen neuen Client mit dem angegebenen API-Key.
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:   strings.TrimSpace(apiKey),
		http:     &http.Client{Timeout: 30 * time.Second},
		dayReset: nextMidnight(),
	}
}

// CheckBatch prüft alle Einträge sequentiell und emittiert Fortschritt via progressFn.
// Der ctx kann zum Abbruch verwendet werden.
func (c *Client) CheckBatch(ctx context.Context, requests []CheckRequest, progressFn func(current, total int, result CheckResult)) (*BatchResult, error) {
	batch := &BatchResult{}

	for i, req := range requests {
		if ctx.Err() != nil {
			return batch, ctx.Err()
		}

		result := c.checkOne(ctx, req, i)
		batch.Results = append(batch.Results, result)
		if result.Status == "error" {
			batch.Errors++
		}
		if progressFn != nil {
			progressFn(i+1, len(requests), result)
		}
	}
	return batch, nil
}

func (c *Client) checkOne(ctx context.Context, req CheckRequest, idx int) CheckResult {
	itemID := fmt.Sprintf("%s:%s:%s", req.ItemType, req.Name, req.Path)
	result := CheckResult{
		ItemID: itemID,
		Name:   req.Name,
		Path:   req.Path,
	}

	if req.Path == "" {
		result.Status = "no_path"
		return result
	}

	// SHA256 berechnen
	hash, err := SHA256File(req.Path)
	if err != nil {
		result.Status = "error"
		result.ErrorMsg = "Hash-Fehler: " + err.Error()
		return result
	}
	result.SHA256 = hash

	// Rate-Limiting: warten wenn nötig
	c.throttle(ctx)
	if ctx.Err() != nil {
		result.Status = "error"
		result.ErrorMsg = "abgebrochen"
		return result
	}

	// Tageslimit prüfen
	c.mu.Lock()
	if time.Now().After(c.dayReset) {
		c.callsToday = 0
		c.dayReset = nextMidnight()
	}
	if c.callsToday >= dailyLimit {
		c.mu.Unlock()
		result.Status = "error"
		result.ErrorMsg = "Tageslimit erreicht (500/Tag)"
		return result
	}
	c.callsToday++
	c.mu.Unlock()

	// API-Anfrage
	report, err := c.fetchReport(ctx, hash)
	if err != nil {
		result.Status = "error"
		result.ErrorMsg = err.Error()
		return result
	}

	if report.Error != nil {
		if report.Error.Code == "NotFoundError" {
			result.Status = "not_found"
		} else {
			result.Status = "error"
			result.ErrorMsg = report.Error.Message
		}
		return result
	}

	stats := report.Data.Attributes.LastAnalysisStats
	total := stats.Malicious + stats.Suspicious + stats.Undetected + stats.Harmless
	result.Engines = total
	result.Detections = stats.Malicious + stats.Suspicious
	result.Permalink = "https://www.virustotal.com/gui/file/" + hash

	switch {
	case stats.Malicious > 0:
		result.Status = "malicious"
	case stats.Suspicious > 0:
		result.Status = "suspicious"
	default:
		result.Status = "clean"
	}
	return result
}

func (c *Client) fetchReport(ctx context.Context, sha256 string) (*vtFileReport, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", vtBaseURL+sha256, nil)
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

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	var report vtFileReport
	if err := json.Unmarshal(body, &report); err != nil {
		return nil, fmt.Errorf("JSON-Parse: %w (HTTP %d)", err, resp.StatusCode)
	}
	return &report, nil
}

// throttle wartet bis das Rate-Limit abgelaufen ist.
func (c *Client) throttle(ctx context.Context) {
	c.mu.Lock()
	wait := minInterval - time.Since(c.lastRequest)
	c.lastRequest = time.Now()
	c.mu.Unlock()

	if wait > 0 {
		select {
		case <-ctx.Done():
		case <-time.After(wait):
		}
	}
}

// CallsToday gibt die Anzahl der heutigen Anfragen zurück.
func (c *Client) CallsToday() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.callsToday
}

func nextMidnight() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
}
