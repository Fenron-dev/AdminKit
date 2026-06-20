// Package events liest kritische System-Ereignisse der letzten 7 Tage.
package events

import "time"

// Level beschreibt die Schwere eines Ereignisses.
type Level string

const (
	LevelCritical Level = "Kritisch"
	LevelError    Level = "Fehler"
	LevelWarning  Level = "Warnung"
)

// EventEntry beschreibt ein einzelnes Systemereignis.
type EventEntry struct {
	Time        time.Time `json:"time"`
	Level       Level     `json:"level"`
	Source      string    `json:"source"`
	EventID     int       `json:"event_id"`
	Message     string    `json:"message"`
	Log         string    `json:"log"`          // "System", "Application", "Unified Log"
	ProcessName string    `json:"process_name"` // Prozessname der auslösenden App
	PID         int       `json:"pid"`          // Prozess-ID
	Subsystem   string    `json:"subsystem"`    // macOS Subsystem (z.B. "com.apple.coredata")
}

// ScanResult enthält die gesammelten Ereignisse.
type ScanResult struct {
	Timestamp time.Time    `json:"timestamp"`
	Events    []EventEntry `json:"events"`
	DaysBack  int          `json:"days_back"`
	Errors    []ScanError  `json:"errors,omitempty"`
}

// ScanError beschreibt einen nicht-fatalen Fehler.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
