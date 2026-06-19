//go:build darwin

package events

import (
	"bufio"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const daysBack = 7

// Scan liest kritische Einträge aus dem macOS Unified Log.
func Scan() ScanResult {
	result := ScanResult{
		Timestamp: time.Now(),
		DaysBack:  daysBack,
	}

	since := time.Now().AddDate(0, 0, -daysBack).Format("2006-01-02 15:04:05")
	out, err := exec.Command("log", "show",
		"--style", "syslog",
		"--start", since,
		"--predicate", `messageType == 16 OR messageType == 17`, // fault + error
		"--last", fmt.Sprintf("%dd", daysBack),
	).Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "log",
			Message: fmt.Sprintf("log show: %v", err),
		})
		return result
	}

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	count := 0
	for scanner.Scan() && count < 100 {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "Filtering") {
			continue
		}
		// Syslog format: "Jan  1 00:00:00 hostname process[pid]: message"
		parts := strings.SplitN(line, ": ", 2)
		msg := ""
		if len(parts) == 2 {
			msg = parts[1]
		} else {
			msg = line
		}
		if len(msg) > 200 {
			msg = msg[:200] + "…"
		}
		result.Events = append(result.Events, EventEntry{
			Time:    time.Now(), // Vereinfacht — Parsing des Timestamps komplex
			Level:   LevelError,
			Source:  "system",
			Message: msg,
			Log:     "Unified Log",
		})
		count++
	}

	return result
}
