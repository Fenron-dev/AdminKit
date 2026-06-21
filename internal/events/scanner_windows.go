//go:build windows

package events

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"adminkit/internal/scoring"
)

const daysBack = 7
const maxTotal = 300

// Scan liest kritische Fehler aus System- und Application-Log.
func Scan() ScanResult {
	return ScanRange("", "", "")
}

// ScanRange liest Einträge für einen bestimmten Zeitraum und optionalen Prozess-Filter.
func ScanRange(from, to, processFilter string) ScanResult {
	result := ScanResult{
		Timestamp: time.Now(),
		DaysBack:  daysBack,
	}

	for _, logName := range []string{"System", "Application"} {
		entries, errs := readEventLog(logName, from, to, processFilter)
		result.Events = append(result.Events, entries...)
		result.Errors = append(result.Errors, errs...)
	}

	sortByTime(result.Events)
	if len(result.Events) > maxTotal {
		result.Events = result.Events[:maxTotal]
	}
	return result
}

func readEventLog(logName, from, to, processFilter string) ([]EventEntry, []ScanError) {
	since := from
	if since == "" {
		since = time.Now().AddDate(0, 0, -daysBack).Format("2006-01-02")
	}
	whereClause := fmt.Sprintf("$_.TimeCreated -ge '%s' -and $_.Level -le 2", since)
	if to != "" {
		whereClause += fmt.Sprintf(" -and $_.TimeCreated -le '%s'", to)
	}
	if processFilter != "" {
		whereClause += fmt.Sprintf(" -and $_.ProviderName -like '*%s*'", processFilter)
	}
	script := fmt.Sprintf(`
Get-WinEvent -LogName '%s' -ErrorAction SilentlyContinue |
  Where-Object { %s } |
  Select-Object TimeCreated,Level,ProviderName,Id,Message |
  ConvertTo-Csv -NoTypeInformation`, logName, whereClause)

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
		// Erste Zeile als Kurznachricht
		firstLine := msg
		if idx := strings.IndexAny(firstLine, "\r\n"); idx > 0 {
			firstLine = firstLine[:idx]
		}

		id, _ := strconv.Atoi(unq(fields[3]))
		src := unq(fields[2])
		risk := scoring.EventRisk(src, "", firstLine)
		entries = append(entries, EventEntry{
			Time:        t,
			Level:       level,
			Source:      src,
			EventID:     id,
			Message:     msg,
			Log:         logName,
			ProcessName: src,
			RiskScore:   risk,
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
