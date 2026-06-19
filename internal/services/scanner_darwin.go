//go:build darwin

package services

import (
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Scan listet launchd-Services auf macOS auf.
func Scan() ScanResult {
	result := ScanResult{Timestamp: time.Now()}

	out, err := exec.Command("launchctl", "list").Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "launchctl",
			Message: fmt.Sprintf("launchctl list: %v", err),
		})
		return result
	}

	for i, line := range strings.Split(string(out), "\n") {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		pid := fields[0]
		name := fields[2]

		state := StateStopped
		if pid != "-" {
			state = StateRunning
		}

		result.Services = append(result.Services, ServiceInfo{
			Name:        name,
			DisplayName: name,
			State:       state,
			StartType:   StartAuto,
			IsSystem:    strings.HasPrefix(name, "com.apple.") || strings.HasPrefix(name, "com.microsoft."),
		})
	}

	return result
}
