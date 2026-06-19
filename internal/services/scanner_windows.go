//go:build windows

package services

import (
	"os/exec"
	"strings"
	"time"
)

// Scan listet alle Dienste auf (Fokus: Auto-Start + Drittanbieter).
func Scan() ScanResult {
	result := ScanResult{Timestamp: time.Now()}

	script := `Get-WmiObject Win32_Service | Select-Object Name,DisplayName,PathName,State,StartMode,ProcessId | ConvertTo-Csv -NoTypeInformation`
	out, err := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script).Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{Module: "Win32_Service", Message: err.Error()})
		return result
	}

	lines := strings.Split(string(out), "\n")
	for i, line := range lines {
		if i == 0 {
			continue
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := parseCSV(line)
		if len(fields) < 6 {
			continue
		}
		name := unq(fields[0])
		display := unq(fields[1])
		path := unq(fields[2])
		state := mapState(unq(fields[3]))
		start := mapStart(unq(fields[4]))

		label := display
		if label == "" {
			label = name
		}

		result.Services = append(result.Services, ServiceInfo{
			Name:        name,
			DisplayName: label,
			Path:        path,
			State:       state,
			StartType:   start,
			IsSystem:    isSystemSvc(path),
		})
	}

	return result
}

func mapState(s string) ServiceState {
	switch strings.ToLower(s) {
	case "running":
		return StateRunning
	case "stopped":
		return StateStopped
	case "paused":
		return StatePaused
	default:
		return StateUnknown
	}
}

func mapStart(s string) StartType {
	switch strings.ToLower(s) {
	case "auto":
		return StartAuto
	case "manual":
		return StartManual
	case "disabled":
		return StartDisabled
	case "boot":
		return StartBoot
	case "system":
		return StartSystem
	default:
		return StartManual
	}
}

func isSystemSvc(path string) bool {
	lower := strings.ToLower(path)
	return strings.Contains(lower, `\windows\`) ||
		strings.Contains(lower, `\microsoft\`)
}

func parseCSV(line string) []string {
	var fields []string
	inQ := false
	cur := &strings.Builder{}
	for i := 0; i < len(line); i++ {
		c := line[i]
		if c == '"' {
			if inQ && i+1 < len(line) && line[i+1] == '"' {
				cur.WriteByte('"')
				i++
			} else {
				inQ = !inQ
			}
		} else if c == ',' && !inQ {
			fields = append(fields, cur.String())
			cur.Reset()
		} else {
			cur.WriteByte(c)
		}
	}
	fields = append(fields, cur.String())
	return fields
}

func unq(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}
