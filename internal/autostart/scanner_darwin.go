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

	// Einmalig alle aktuell geladenen launchd-Jobs abfragen.
	// Ergebnis wird an scanPlistDir weitergegeben, um IsEnabled korrekt zu setzen.
	loaded := getLoadedLabels()

	scanners := []func(map[string]struct{}) ([]Entry, []ScanError){
		scanLaunchAgents,
		scanLaunchDaemons,
	}

	for _, fn := range scanners {
		entries, errs := fn(loaded)
		result.Entries = append(result.Entries, entries...)
		result.Errors = append(result.Errors, errs...)
	}

	// Login Items werden separat gescannt (kein launchctl-Kontext)
	entries, errs := scanLoginItems()
	result.Entries = append(result.Entries, entries...)
	result.Errors = append(result.Errors, errs...)

	return result
}

// getLoadedLabels ruft `launchctl list` ab und gibt alle aktuell geladenen
// Job-Labels als Set zurück. Fehler werden ignoriert (Fallback: nil).
func getLoadedLabels() map[string]struct{} {
	out, err := exec.Command("launchctl", "list").Output()
	if err != nil {
		return nil
	}
	labels := make(map[string]struct{})
	for i, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if i == 0 {
			continue // Header-Zeile: "PID\tStatus\tLabel"
		}
		fields := strings.Fields(line)
		if len(fields) >= 3 {
			labels[fields[2]] = struct{}{}
		}
	}
	return labels
}

// ── LaunchAgents / LaunchDaemons ──────────────────────────────────────────────

func scanLaunchAgents(loaded map[string]struct{}) ([]Entry, []ScanError) {
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
		e, err := scanPlistDir(d.path, d.loc, d.sys, loaded)
		all = append(all, e...)
		errs = append(errs, err...)
	}
	return all, errs
}

func scanLaunchDaemons(loaded map[string]struct{}) ([]Entry, []ScanError) {
	return scanPlistDir("/Library/LaunchDaemons", LocLaunchDaemon, false, loaded)
}

func scanPlistDir(dir string, loc Location, isSystem bool, loaded map[string]struct{}) ([]Entry, []ScanError) {
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

		// IsEnabled: true wenn der Job aktuell bei launchctl geladen ist.
		// Fallback true wenn launchctl list nicht verfügbar war (loaded == nil).
		isEnabled := true
		if loaded != nil {
			_, isEnabled = loaded[label]
		}

		entries = append(entries, Entry{
			Name:      label,
			Path:      program,
			PlistPath: path,
			Location:  loc,
			IsSystem:  isSystemLabel(label),
			IsEnabled: isEnabled,
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
			IsEnabled: true, // Login Items sind immer aktiv (vorhanden = aktiv)
		})
	}
	return entries, nil
}

func isSystemLabel(label string) bool {
	return strings.HasPrefix(label, "com.apple.") ||
		strings.HasPrefix(label, "com.microsoft.") ||
		strings.HasPrefix(label, "org.cups.")
}
