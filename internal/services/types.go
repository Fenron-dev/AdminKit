// Package services listet laufende und automatisch startende Dienste auf.
package services

import "time"

// StartType beschreibt den Startmodus eines Dienstes.
type StartType string

const (
	StartAuto     StartType = "Automatisch"
	StartManual   StartType = "Manuell"
	StartDisabled StartType = "Deaktiviert"
	StartBoot     StartType = "Boot"
	StartSystem   StartType = "System"
)

// ServiceState beschreibt den aktuellen Zustand.
type ServiceState string

const (
	StateRunning ServiceState = "Läuft"
	StateStopped ServiceState = "Gestoppt"
	StatePaused  ServiceState = "Pausiert"
	StateUnknown ServiceState = "Unbekannt"
)

// ServiceInfo beschreibt einen einzelnen Dienst.
type ServiceInfo struct {
	Name        string       `json:"name"`
	DisplayName string       `json:"display_name"`
	Path        string       `json:"path"`
	State       ServiceState `json:"state"`
	StartType   StartType    `json:"start_type"`
	IsSystem    bool         `json:"is_system"` // Microsoft/Apple-Systemdienst?
	PID         int          `json:"pid,omitempty"`
}

// ScanResult enthält alle gefundenen Dienste.
type ScanResult struct {
	Timestamp time.Time     `json:"timestamp"`
	Services  []ServiceInfo `json:"services"`
	Errors    []ScanError   `json:"errors,omitempty"`
}

// ScanError beschreibt einen nicht-fatalen Fehler.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
