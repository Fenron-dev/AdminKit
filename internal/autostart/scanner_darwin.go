//go:build darwin

package autostart

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Scan sammelt LaunchAgents, LaunchDaemons und Login-Items auf macOS.
func Scan() ScanResult {
	result := ScanResult{Timestamp: time.Now()}

	scanners := []func() ([]Entry, []ScanError){
		scanLaunchAgents,
		scanLaunchDaemons,
		scanLoginItems,
	}

	for _, fn := range scanners {
		entries, errs := fn()
		result.Entries = append(result.Entries, entries...)
		result.Errors = append(result.Errors, errs...)
	}

	return result
}

// ── LaunchAgents / LaunchDaemons ──────────────────────────────────────────────

func scanLaunchAgents() ([]Entry, []ScanError) {
	home, _ := os.UserHomeDir()
	dirs := []struct {
		path string
		loc  Location
		sys  bool
	}{
		{filepath.Join(home, "Library/LaunchAgents"), LocLaunchAgent, false},
		{"/Library/LaunchAgents", LocLaunchAgent, false},
	}
	var all []Entry
	var errs []ScanError
	for _, d := range dirs {
		e, err := scanPlistDir(d.path, d.loc, d.sys)
		all = append(all, e...)
		errs = append(errs, err...)
	}
	return all, errs
}

func scanLaunchDaemons() ([]Entry, []ScanError) {
	return scanPlistDir("/Library/LaunchDaemons", LocLaunchDaemon, false)
}

func scanPlistDir(dir string, loc Location, isSystem bool) ([]Entry, []ScanError) {
	var entries []Entry
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil // Ordner existiert nicht → kein Fehler
	}
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".plist") {
			continue
		}
		path := filepath.Join(dir, f.Name())
		label, program := parseLaunchPlist(path)
		if label == "" {
			label = strings.TrimSuffix(f.Name(), ".plist")
		}
		entries = append(entries, Entry{
			Name:      label,
			Path:      program,
			Location:  loc,
			IsSystem:  isSystemLabel(label),
			IsEnabled: true,
		})
	}
	return entries, nil
}

type plistTop struct {
	Label   string `json:"Label"`
	Program string `json:"Program"`
}

func parseLaunchPlist(path string) (label, program string) {
	// Versuch: plutil -convert json
	out, err := exec.Command("plutil", "-convert", "json", "-o", "-", path).Output()
	if err != nil {
		return "", ""
	}
	var p plistTop
	if err := json.Unmarshal(out, &p); err != nil {
		return "", ""
	}
	return p.Label, p.Program
}

// ── Login Items ───────────────────────────────────────────────────────────────

func scanLoginItems() ([]Entry, []ScanError) {
	// osascript: Login Items aus System Preferences
	out, err := exec.Command("osascript", "-e",
		`tell application "System Events" to get the name of every login item`).Output()
	if err != nil {
		return nil, []ScanError{{Module: "LoginItems", Message: "osascript fehlgeschlagen: " + err.Error()}}
	}

	var entries []Entry
	for _, name := range strings.Split(strings.TrimSpace(string(out)), ", ") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		entries = append(entries, Entry{
			Name:      name,
			Path:      "",
			Location:  LocLoginItem,
			IsSystem:  false,
			IsEnabled: true,
		})
	}
	return entries, nil
}

func isSystemLabel(label string) bool {
	return strings.HasPrefix(label, "com.apple.") ||
		strings.HasPrefix(label, "com.microsoft.") ||
		strings.HasPrefix(label, "org.cups.")
}
