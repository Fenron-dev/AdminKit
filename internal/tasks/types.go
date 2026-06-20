// Package tasks listet geplante Aufgaben auf (Windows Task Scheduler, macOS cron).
package tasks

import "time"

// ScheduledTask beschreibt eine geplante Aufgabe.
type ScheduledTask struct {
	Name       string    `json:"name"`
	Command    string    `json:"command"`
	Schedule   string    `json:"schedule"`   // cron-Ausdruck oder Windows-Trigger
	NextRun    time.Time `json:"next_run,omitempty"`
	LastRun    time.Time `json:"last_run,omitempty"`
	LastStatus string    `json:"last_status,omitempty"`
	RunAsUser  string    `json:"run_as_user,omitempty"`
	IsSystem   bool      `json:"is_system"`
	IsEnabled  bool      `json:"is_enabled"`
	Source     string    `json:"source"` // "cron", "at", "launchd", "taskscheduler"
}

// ScanResult enthält alle gefundenen geplanten Aufgaben.
type ScanResult struct {
	Tasks  []ScheduledTask `json:"tasks"`
	Errors []ScanError     `json:"errors,omitempty"`
}

// ScanError beschreibt einen nicht-fatalen Fehler.
type ScanError struct {
	Module  string `json:"module"`
	Message string `json:"message"`
}
