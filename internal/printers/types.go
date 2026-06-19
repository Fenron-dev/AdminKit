// Package printers listet lokale und Netzwerkdrucker auf.
package printers

import "time"

// PrinterStatus beschreibt den Betriebszustand eines Druckers.
type PrinterStatus string

const (
	StatusReady   PrinterStatus = "Bereit"
	StatusOffline PrinterStatus = "Offline"
	StatusError   PrinterStatus = "Fehler"
	StatusPaused  PrinterStatus = "Pausiert"
	StatusPrinting PrinterStatus = "Druckt"
	StatusUnknown PrinterStatus = "Unbekannt"
)

// PrinterInfo beschreibt einen installierten Drucker.
type PrinterInfo struct {
	Name       string        `json:"name"`
	Driver     string        `json:"driver"`
	Port       string        `json:"port"`        // z.B. "USB001", "IP_192.168.1.200", "LPT1"
	Status     PrinterStatus `json:"status"`
	IsDefault  bool          `json:"is_default"`
	IsNetwork  bool          `json:"is_network"`
	IPAddress  string        `json:"ip_address,omitempty"`
	IsShared   bool          `json:"is_shared"`
	ShareName  string        `json:"share_name,omitempty"`
	PaperSize  string        `json:"paper_size,omitempty"`
	Location   string        `json:"location,omitempty"`
}

// ScanResult enthält das Ergebnis eines Drucker-Scans.
type ScanResult struct {
	Timestamp time.Time     `json:"timestamp"`
	Printers  []PrinterInfo `json:"printers"`
	Errors    []ScanError   `json:"errors,omitempty"`
}

// ScanError beschreibt einen nicht-fatalen Fehler während des Scans.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
