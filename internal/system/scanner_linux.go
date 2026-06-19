//go:build linux

package system

import "time"

// Scan ist auf Linux noch nicht vollständig implementiert (Phase 8).
// Gibt eine leere Struktur mit einem Hinweis-Fehler zurück.
func Scan() (*ScanResult, error) {
	return &ScanResult{
		Timestamp: time.Now(),
		Errors: []ScanError{
			{Module: "scanner", Message: "Linux-Unterstützung ist in Phase 8 geplant."},
		},
	}, nil
}
