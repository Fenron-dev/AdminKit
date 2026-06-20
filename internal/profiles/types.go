// Package profiles listet macOS Konfigurationsprofile auf.
package profiles

import "time"

// ConfigProfile beschreibt ein installiertes Konfigurationsprofil.
type ConfigProfile struct {
	Name         string    `json:"name"`
	Identifier   string    `json:"identifier,omitempty"`
	Organization string    `json:"organization,omitempty"`
	Description  string    `json:"description,omitempty"`
	InstallDate  time.Time `json:"install_date,omitempty"`
	IsSystem     bool      `json:"is_system"` // Machine-level vs. User-level
	Verified     bool      `json:"verified"`
	PayloadTypes []string  `json:"payload_types,omitempty"`
}

// ScanResult enthält alle gefundenen Konfigurationsprofile.
type ScanResult struct {
	Profiles []ConfigProfile `json:"profiles"`
	Errors   []ScanError     `json:"errors,omitempty"`
}

// ScanError beschreibt einen nicht-fatalen Fehler.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
