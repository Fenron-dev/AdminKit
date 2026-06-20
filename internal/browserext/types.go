// Package browserext scannt installierte Browser-Erweiterungen für Chrome, Brave, Edge und Firefox.
package browserext

// Extension beschreibt eine installierte Browser-Erweiterung.
type Extension struct {
	Browser     string `json:"browser"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	ID          string `json:"id"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
}

// ScanResult enthält alle gefundenen Browser-Erweiterungen.
type ScanResult struct {
	Extensions []Extension `json:"extensions"`
	Errors     []ScanError `json:"errors,omitempty"`
}

// ScanError beschreibt einen nicht-fatalen Fehler während des Scans.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
