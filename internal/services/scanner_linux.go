//go:build linux

package services

import (
	"os/exec"
	"strings"
	"time"
)

// Scan listet systemd-Services auf Linux auf.
func Scan() ScanResult {
	result := ScanResult{Timestamp: time.Now()}

	out, err := exec.Command("systemctl", "list-units", "--type=service",
		"--no-pager", "--plain", "--no-legend").Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{Module: "systemctl", Message: err.Error()})
		return result
	}

	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		name := strings.TrimSuffix(fields[0], ".service")
		active := fields[2] // active/inactive
		sub := fields[3]    // running/dead/etc.

		state := StateStopped
		if sub == "running" {
			state = StateRunning
		} else if active == "inactive" {
			state = StateStopped
		}

		result.Services = append(result.Services, ServiceInfo{
			Name:        name,
			DisplayName: name,
			State:       state,
			StartType:   StartAuto,
			IsSystem:    isLinuxSystemSvc(name),
		})
	}

	return result
}

func isLinuxSystemSvc(name string) bool {
	sysPrefixes := []string{"systemd-", "dbus", "udev", "network", "ssh", "cron", "rsyslog", "snapd"}
	lower := strings.ToLower(name)
	for _, p := range sysPrefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	return false
}
