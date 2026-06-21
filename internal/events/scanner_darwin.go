//go:build darwin

package events

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"adminkit/internal/scoring"
)

const daysBack = 7
const maxEntries = 300 // Neueste N Einträge behalten

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
// Gibt die neuesten maxEntries Einträge zurück (neueste zuerst).
func Scan() ScanResult {
	return ScanRange("", "", "")
}

// ScanRange liest Einträge für einen bestimmten Zeitraum und optionalen Prozess-Filter.
// Leere Strings für from/to = Standard-Zeitraum (letzte daysBack Tage).
func ScanRange(from, to, processFilter string) ScanResult {
	result := ScanResult{
		Timestamp: time.Now(),
		DaysBack:  daysBack,
	}

	args := []string{"show", "--style", "ndjson"}

	if from != "" {
		args = append(args, "--start", from)
	} else {
		since := time.Now().AddDate(0, 0, -daysBack).Format("2006-01-02 15:04:05")
		args = append(args, "--start", since)
	}
	if to != "" {
		args = append(args, "--end", to)
	}

	predicate := `messageType == 16 OR messageType == 17`
	if processFilter != "" {
		predicate = fmt.Sprintf(`(messageType == 16 OR messageType == 17) AND process == "%s"`, processFilter)
	}
	args = append(args, "--predicate", predicate)

	out, err := exec.Command("log", args...).Output()
	if err != nil {
		result.Errors = append(result.Errors, ScanError{
			Module:  "log",
			Message: fmt.Sprintf("log show: %v", err),
		})
		return result
	}

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)

	for scanner.Scan() {
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
	}

	// Neueste zuerst sortieren
	sort.Slice(result.Events, func(i, j int) bool {
		return result.Events[i].Time.After(result.Events[j].Time)
	})

	// Auf maxEntries begrenzen (neueste behalten)
	if len(result.Events) > maxEntries {
		result.Events = result.Events[:maxEntries]
	}

	return result
}

// parseLogTimestamp parst das Timestamp-Format des macOS Unified Log.
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
