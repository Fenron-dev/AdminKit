//go:build windows

package events

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GetCrashReports sucht Windows Crash-Dumps im CrashDumps-Ordner.
func GetCrashReports(from, to time.Time) []CrashReport {
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		return nil
	}
	dirs := []string{
		filepath.Join(localAppData, "CrashDumps"),
		filepath.Join(os.Getenv("WINDIR"), "Minidump"),
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
			if !strings.HasSuffix(strings.ToLower(name), ".dmp") {
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

			appName := strings.TrimSuffix(name, ".dmp")
			appName = strings.TrimSuffix(appName, ".DMP")
			// Windows-Format: "AppName.exe.12345.dmp" → bereinigen
			if idx := strings.LastIndex(appName, ".exe."); idx > 0 {
				appName = appName[:idx]
			}

			fullPath := filepath.Join(dir, name)
			reports = append(reports, CrashReport{
				AppName:   appName,
				Path:      fullPath,
				Timestamp: modTime,
				Summary:   "",
			})
		}
	}
	return reports
}
