//go:build windows

package events

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const daysBack = 7
const maxPerLog = 50

// Scan liest kritische Fehler aus System- und Application-Log.
func Scan() ScanResult {
	result := ScanResult{
		Timestamp: time.Now(),
		DaysBack:  daysBack,
	}

	for _, logName := range []string{"System", "Application"} {
		entries, errs := readEventLog(logName)
		result.Events = append(result.Events, entries...)
		result.Errors = append(result.Errors, errs...)
	}

	// Neueste zuerst
	sortByTime(result.Events)
	return result
}

func readEventLog(logName string) ([]EventEntry, []ScanError) {
	// PowerShell: Events der letzten N Tage, Level 1 (Critical) + 2 (Error)
	since := time.Now().AddDate(0, 0, -daysBack).Format("2006-01-02")
	script := fmt.Sprintf(`
Get-WinEvent -LogName '%s' -ErrorAction SilentlyContinue |
  Where-Object { $_.TimeCreated -ge '%s' -and $_.Level -le 2 } |
  Select-Object -First %d TimeCreated,Level,ProviderName,Id,Message |
  ConvertTo-Csv -NoTypeInformation`, logName, since, maxPerLog)

	out, err := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script).Output()
	if err != nil {
		return nil, []ScanError{{Module: logName, Message: fmt.Sprintf("Get-WinEvent: %v", err)}}
	}

	var entries []EventEntry
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
		if len(fields) < 5 {
			continue
		}
		t, _ := time.Parse("01/02/2006 15:04:05", unq(fields[0]))
		if t.IsZero() {
			t, _ = time.Parse("2006-01-02 15:04:05", unq(fields[0]))
		}

		levelNum, _ := strconv.Atoi(unq(fields[1]))
		level := LevelError
		if levelNum == 1 {
			level = LevelCritical
		}

		msg := unq(fields[4])
		// Nachricht auf erste Zeile kürzen
		if idx := strings.IndexAny(msg, "\r\n"); idx > 0 {
			msg = msg[:idx]
		}
		if len(msg) > 200 {
			msg = msg[:200] + "…"
		}

		id, _ := strconv.Atoi(unq(fields[3]))
		entries = append(entries, EventEntry{
			Time:    t,
			Level:   level,
			Source:  unq(fields[2]),
			EventID: id,
			Message: msg,
			Log:     logName,
		})
	}
	return entries, nil
}

func sortByTime(events []EventEntry) {
	for i := 1; i < len(events); i++ {
		for j := i; j > 0 && events[j].Time.After(events[j-1].Time); j-- {
			events[j], events[j-1] = events[j-1], events[j]
		}
	}
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
