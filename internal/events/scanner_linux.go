//go:build linux

package events

import (
	"bufio"
	"os/exec"
	"strings"
	"time"
)

const daysBack = 7

// Scan liest kritische journald-Einträge der letzten 7 Tage.
func Scan() ScanResult {
	result := ScanResult{
		Timestamp: time.Now(),
		DaysBack:  daysBack,
	}

	out, err := exec.Command("journalctl",
		"--priority=err",
		"--since", "-7d",
		"--no-pager",
		"--output=short",
	).Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{Module: "journalctl", Message: err.Error()})
		return result
	}

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	count := 0
	for scanner.Scan() && count < 100 {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		msg := line
		if len(msg) > 200 {
			msg = msg[:200] + "…"
		}
		result.Events = append(result.Events, EventEntry{
			Time:    time.Now(),
			Level:   LevelError,
			Source:  "journald",
			Message: msg,
			Log:     "System Journal",
		})
		count++
	}

	return result
}
