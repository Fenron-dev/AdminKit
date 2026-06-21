//go:build darwin

package events

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GetCrashReports sucht macOS Crash-Reports im DiagnosticReports-Ordner.
func GetCrashReports(from, to time.Time) []CrashReport {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	dirs := []string{
		filepath.Join(home, "Library", "Logs", "DiagnosticReports"),
		"/Library/Logs/DiagnosticReports",
	}

	var reports []CrashReport
	for _, dir := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := e.Name()
			if !strings.HasSuffix(name, ".crash") && !strings.HasSuffix(name, ".ips") {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			modTime := info.ModTime()
			if modTime.Before(from) || modTime.After(to) {
				continue
			}

			appName := strings.TrimSuffix(name, ".crash")
			appName = strings.TrimSuffix(appName, ".ips")
			// macOS-Format: "AppName_2024-01-15-143022_hostname.crash" → App-Name extrahieren
			if idx := strings.Index(appName, "_"); idx > 0 {
				appName = appName[:idx]
			}

			fullPath := filepath.Join(dir, name)
			summary := readCrashSummary(fullPath)

			reports = append(reports, CrashReport{
				AppName:   appName,
				Path:      fullPath,
				Timestamp: modTime,
				Summary:   summary,
			})
		}
	}
	return reports
}

// readCrashSummary liest die ersten relevanten Zeilen eines Crash-Reports.
func readCrashSummary(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	lines := strings.Split(string(data), "\n")
	var relevant []string
	for _, line := range lines {
		if len(relevant) >= 30 {
			break
		}
		l := strings.TrimSpace(line)
		if l == "" {
			continue
		}
		// Interessante Zeilen: Exception, Signal, Crashed Thread, Reason, etc.
		for _, keyword := range []string{
			"Exception Type", "Exception Subtype", "Exception Codes",
			"Termination Reason", "Termination Signal",
			"Crashed Thread", "Process:", "Identifier:",
			"Version:", "OS Version:",
		} {
			if strings.HasPrefix(l, keyword) {
				relevant = append(relevant, l)
				break
			}
		}
	}
	return strings.Join(relevant, "\n")
}
