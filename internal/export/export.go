// Package export erzeugt Systemberichte aus Scan-Ergebnissen.
// Unterstützte Formate: HTML (interaktiv, selbst-enthalten), JSON (Rohdaten).
package export

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"adminkit/internal/network"
	"adminkit/internal/software"
	"adminkit/internal/system"
)

// SessionExport bündelt alle Scan-Ergebnisse einer Session für den Export.
type SessionExport struct {
	GeneratedAt time.Time
	SessionName string
	SessionPath string
	System      *system.ScanResult
	Network     *network.ScanResult
	Software    *software.ScanResult
}

// ExportHTML erzeugt einen selbst-enthaltenen HTML-Bericht und speichert ihn
// in outDir. Gibt den absoluten Pfad der erzeugten Datei zurück.
func ExportHTML(data *SessionExport, outDir string, includePasswords bool) (string, error) {
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return "", fmt.Errorf("export-verzeichnis: %w", err)
	}

	name := sanitizeFilename(data.SessionName)
	ts := data.GeneratedAt.Format("20060102_150405")
	path := filepath.Join(outDir, fmt.Sprintf("bericht_%s_%s.html", name, ts))

	html := GenerateHTML(data, includePasswords)
	if err := os.WriteFile(path, []byte(html), 0644); err != nil {
		return "", fmt.Errorf("HTML-Datei schreiben: %w", err)
	}
	return path, nil
}

// ExportJSON serialisiert alle Scan-Ergebnisse als kompaktes JSON-Dokument.
func ExportJSON(data *SessionExport, outDir string) (string, error) {
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return "", fmt.Errorf("export-verzeichnis: %w", err)
	}

	name := sanitizeFilename(data.SessionName)
	ts := data.GeneratedAt.Format("20060102_150405")
	path := filepath.Join(outDir, fmt.Sprintf("bericht_%s_%s.json", name, ts))

	js, err := GenerateJSON(data)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(path, js, 0644); err != nil {
		return "", fmt.Errorf("JSON-Datei schreiben: %w", err)
	}
	return path, nil
}

func sanitizeFilename(name string) string {
	if name == "" {
		return "session"
	}
	out := make([]byte, 0, len(name))
	for _, c := range []byte(name) {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-':
			out = append(out, c)
		case c == ' ', c == '_':
			out = append(out, '_')
		}
	}
	if len(out) == 0 {
		return "session"
	}
	return string(out)
}
