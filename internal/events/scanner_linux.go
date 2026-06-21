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
	return ScanRange("", "", "")
}

// ScanRange liest journald-Einträge für einen bestimmten Zeitraum.
func ScanRange(from, to, processFilter string) ScanResult {
	result := ScanResult{
		Timestamp: time.Now(),
		DaysBack:  daysBack,
	}

	args := []string{"--priority=err", "--no-pager", "--output=short"}
	if from != "" {
		args = append(args, "--since", from)
	} else {
		args = append(args, "--since", "-7d")
	}
	if to != "" {
		args = append(args, "--until", to)
	}
	if processFilter != "" {
		args = append(args, "--identifier="+processFilter)
	}

	out, err := exec.Command("journalctl", args...).Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{Module: "journalctl", Message: err.Error()})
		return result
	}

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		msg := line
		if len(msg) > 500 {
			msg = msg[:500] + "…"
		}
		result.Events = append(result.Events, EventEntry{
			Time:    time.Now(),
			Level:   LevelError,
			Source:  "journald",
			Message: msg,
			Log:     "System Journal",
		})
	}

	return result
}
