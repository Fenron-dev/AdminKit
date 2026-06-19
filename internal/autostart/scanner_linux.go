//go:build linux

package autostart

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Scan sammelt systemd-Units und XDG-Autostart-Einträge auf Linux.
func Scan() ScanResult {
	result := ScanResult{Timestamp: time.Now()}

	entries, errs := scanSystemdUser()
	result.Entries = append(result.Entries, entries...)
	result.Errors = append(result.Errors, errs...)

	entries, errs = scanXDGAutostart()
	result.Entries = append(result.Entries, entries...)
	result.Errors = append(result.Errors, errs...)

	return result
}

func scanSystemdUser() ([]Entry, []ScanError) {
	out, err := exec.Command("systemctl", "--user", "list-units", "--type=service",
		"--state=enabled", "--no-pager", "--plain").Output()
	if err != nil {
		return nil, []ScanError{{Module: "systemd", Message: err.Error()}}
	}

	var entries []Entry
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 1 || !strings.HasSuffix(fields[0], ".service") {
			continue
		}
		name := strings.TrimSuffix(fields[0], ".service")
		entries = append(entries, Entry{
			Name:      name,
			Location:  LocLaunchAgent, // Nächstliegende Location für user-services
			IsEnabled: true,
		})
	}
	return entries, nil
}

func scanXDGAutostart() ([]Entry, []ScanError) {
	home, _ := os.UserHomeDir()
	dirs := []string{
		filepath.Join(home, ".config/autostart"),
		"/etc/xdg/autostart",
	}

	var entries []Entry
	for _, dir := range dirs {
		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, f := range files {
			if !strings.HasSuffix(f.Name(), ".desktop") {
				continue
			}
			content, err := os.ReadFile(filepath.Join(dir, f.Name()))
			if err != nil {
				continue
			}
			name, exec_, hidden := parseDesktopFile(string(content))
			if hidden {
				continue
			}
			entries = append(entries, Entry{
				Name:      name,
				Path:      exec_,
				Location:  LocStartupCommon,
				IsSystem:  false,
				IsEnabled: true,
			})
		}
	}
	return entries, nil
}

func parseDesktopFile(content string) (name, exec_ string, hidden bool) {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Name=") {
			name = strings.TrimPrefix(line, "Name=")
		} else if strings.HasPrefix(line, "Exec=") {
			exec_ = strings.TrimPrefix(line, "Exec=")
		} else if strings.HasPrefix(line, "Hidden=true") || strings.HasPrefix(line, "X-GNOME-Autostart-enabled=false") {
			hidden = true
		}
	}
	return
}
