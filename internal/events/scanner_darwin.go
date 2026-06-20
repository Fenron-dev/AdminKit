//go:build darwin

package events

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"adminkit/internal/scoring"
)

const daysBack = 7

// logEntry spiegelt die relevanten Felder aus dem ndjson-Output von `log show`.
type logEntry struct {
	Timestamp        string `json:"timestamp"`
	EventMessage     string `json:"eventMessage"`
	MessageType      string `json:"messageType"` // "Error", "Fault"
	ProcessImagePath string `json:"processImagePath"`
	ProcessID        int    `json:"processID"`
	Subsystem        string `json:"subsystem"`
	Category         string `json:"category"`
}

// Scan liest kritische Einträge aus dem macOS Unified Log (letzte daysBack Tage).
func Scan() ScanResult {
	result := ScanResult{
		Timestamp: time.Now(),
		DaysBack:  daysBack,
	}

	since := time.Now().AddDate(0, 0, -daysBack).Format("2006-01-02 15:04:05")
	out, err := exec.Command("log", "show",
		"--style", "ndjson",
		"--start", since,
		"--predicate", `messageType == 16 OR messageType == 17`, // fault + error
	).Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "log",
			Message: fmt.Sprintf("log show: %v", err),
		})
		return result
	}

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024) // log-Zeilen können groß sein
	count := 0
	for scanner.Scan() && count < 200 {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || line[0] != '{' {
			continue
		}
		var entry logEntry
		if json.Unmarshal([]byte(line), &entry) != nil {
			continue
		}

		level := LevelError
		if entry.MessageType == "Fault" {
			level = LevelCritical
		}

		ts := parseLogTimestamp(entry.Timestamp)
		procName := filepath.Base(entry.ProcessImagePath)
		if procName == "" || procName == "." {
			procName = extractProcessFromMessage(entry.EventMessage)
		}

		subsys := entry.Subsystem
		if entry.Category != "" && subsys != "" {
			subsys = subsys + ":" + entry.Category
		}

		risk := scoring.EventRisk(procName, subsys, entry.EventMessage)

		result.Events = append(result.Events, EventEntry{
			Time:        ts,
			Level:       level,
			Source:      "system",
			Message:     entry.EventMessage,
			Log:         "Unified Log",
			ProcessName: procName,
			PID:         entry.ProcessID,
			Subsystem:   subsys,
			RiskScore:   risk,
		})
		count++
	}

	return result
}

// parseLogTimestamp parst das Timestamp-Format des macOS Unified Log.
// Format: "2026-06-20 22:56:31.123456+0200"
func parseLogTimestamp(s string) time.Time {
	formats := []string{
		"2006-01-02 15:04:05.999999-0700",
		"2006-01-02 15:04:05.999999+0000",
		"2006-01-02 15:04:05-0700",
		"2006-01-02 15:04:05",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t
		}
	}
	return time.Now()
}

// extractProcessFromMessage versucht den Prozessnamen aus dem Log-Text zu lesen.
// Viele macOS-Nachrichten beginnen mit "(ProcessName) [subsystem]..."
func extractProcessFromMessage(msg string) string {
	if len(msg) == 0 || msg[0] != '(' {
		return ""
	}
	end := strings.Index(msg, ")")
	if end < 1 || end > 60 {
		return ""
	}
	return msg[1:end]
}
