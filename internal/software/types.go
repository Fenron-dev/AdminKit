// Package software inventarisiert installierte Software, Laufzeiten und Browser.
// Unterstützt Windows (Registry), macOS (/Applications, brew, mas) und Linux (Phase 8).
package software

import "time"

// ScanResult ist das vollständige Ergebnis eines Software-Scans.
type ScanResult struct {
	Timestamp time.Time  `json:"timestamp"`
	Programs  []Program  `json:"programs"`
	Runtimes  []Runtime  `json:"runtimes"`
	Browsers  []Browser  `json:"browsers"`
	Errors    []ScanError `json:"errors,omitempty"`
}

// ─── Installierte Programme ───────────────────────────────────────────────────

// InstallScope zeigt ob ein Programm systemweit oder nur für den aktuellen Benutzer installiert ist.
type InstallScope string

const (
	ScopeSystem InstallScope = "System"
	ScopeUser   InstallScope = "User"
)

// Program beschreibt ein installiertes Programm.
type Program struct {
	Name             string       `json:"name"`
	Version          string       `json:"version"`
	Publisher        string       `json:"publisher"`
	InstallDate      time.Time    `json:"install_date"`
	SizeMB           float64      `json:"size_mb"`
	Scope            InstallScope `json:"scope"`
	Architecture     string       `json:"architecture"`    // "64-bit", "32-bit", "Universal"
	UninstallString  string       `json:"uninstall_string"` // für Kopieren in Zwischenablage
	InstallLocation  string       `json:"install_location"`
}

// ─── Laufzeiten ───────────────────────────────────────────────────────────────

// RuntimeType klassifiziert den Typ einer Laufzeitumgebung.
type RuntimeType string

const (
	RuntimeDotNet    RuntimeType = ".NET"
	RuntimeDotNetFx  RuntimeType = ".NET Framework"
	RuntimeVCRedist  RuntimeType = "Visual C++ Redistributable"
	RuntimeJava      RuntimeType = "Java"
	RuntimePython    RuntimeType = "Python"
	RuntimeNodeJS    RuntimeType = "Node.js"
	RuntimeOther     RuntimeType = "Other"
)

// Runtime beschreibt eine installierte Laufzeitumgebung (.NET, Java, VC++, …).
type Runtime struct {
	Name         string      `json:"name"`
	Version      string      `json:"version"`
	Type         RuntimeType `json:"type"`
	Architecture string      `json:"architecture"`
	IsInstalled  bool        `json:"is_installed"`
}

// ─── Browser ─────────────────────────────────────────────────────────────────

type Browser struct {
	Name          string `json:"name"`
	Version       string `json:"version"`
	IsDefault     bool   `json:"is_default"`
	ProfileCount  int    `json:"profile_count"`
}

// ─── Fehler-Tracking ─────────────────────────────────────────────────────────

type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
