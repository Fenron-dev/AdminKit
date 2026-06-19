//go:build linux

package software

import "time"

// Scan ist auf Linux noch nicht vollständig implementiert (Phase 8).
func Scan() (*ScanResult, error) {
	return &ScanResult{
		Timestamp: time.Now(),
		Errors: []ScanError{
			{Module: "scanner", Message: "Linux-Unterstützung ist in Phase 8 geplant."},
		},
	}, nil
}
