// Package autostart listet alle automatisch startenden Programme auf —
// Registry-Einträge, Startup-Ordner, Geplante Tasks, Dienste und LaunchAgents.
package autostart

import "time"

// Location beschreibt woher ein Autostart-Eintrag stammt.
type Location string

const (
	LocRegistryHKLM   Location = "Registry HKLM\\Run"
	LocRegistryHKCU   Location = "Registry HKCU\\Run"
	LocRunOnceHKLM    Location = "Registry HKLM\\RunOnce"
	LocRunOnceHKCU    Location = "Registry HKCU\\RunOnce"
	LocWinlogon       Location = "Winlogon"
	LocStartupUser    Location = "Startup-Ordner (Benutzer)"
	LocStartupCommon  Location = "Startup-Ordner (Alle Benutzer)"
	LocScheduledTask  Location = "Geplanter Task"
	LocService        Location = "Dienst (Autostart)"
	LocLaunchAgent    Location = "LaunchAgent"
	LocLaunchDaemon   Location = "LaunchDaemon"
	LocLoginItem      Location = "Login Item"
	LocAppInitDLL     Location = "AppInit_DLL"
)

// Entry beschreibt einen einzelnen Autostart-Eintrag.
type Entry struct {
	Name      string   `json:"name"`
	Path      string   `json:"path"`                 // Ausführungspfad / Befehl
	PlistPath string   `json:"plist_path,omitempty"` // Pfad zur Plist-Datei (macOS LaunchAgent/Daemon)
	Location  Location `json:"location"`             // Woher stammt der Eintrag
	IsSystem  bool     `json:"is_system"`            // Microsoft/Apple-Systemeintrag?
	IsEnabled bool     `json:"is_enabled"`           // Aktiv oder deaktiviert?
	Publisher string   `json:"publisher,omitempty"`
}

// ScanResult enthält alle gefundenen Autostart-Einträge.
type ScanResult struct {
	Timestamp time.Time   `json:"timestamp"`
	Entries   []Entry     `json:"entries"`
	Errors    []ScanError `json:"errors,omitempty"`
}

// ScanError beschreibt einen nicht-fatalen Fehler während des Scans.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
