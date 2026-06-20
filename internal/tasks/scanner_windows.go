//go:build windows

package tasks

import (
	"encoding/csv"
	"os/exec"
	"strings"
	"time"
)

// Scan liest alle geplanten Aufgaben aus dem Windows Task Scheduler.
func Scan() (*ScanResult, error) {
	result := &ScanResult{}

	// schtasks /query /fo CSV /v gibt alle Tasks als CSV aus
	out, err := exec.Command("schtasks", "/query", "/fo", "CSV", "/v").Output()
	if err != nil && len(out) == 0 {
		result.Errors = append(result.Errors, ScanError{Module: "tasks", Message: err.Error()})
		return result, nil
	}

	tasks, parseErr := parseSchtasksCSV(string(out))
	if parseErr != nil {
		result.Errors = append(result.Errors, ScanError{Module: "tasks", Message: parseErr.Error()})
	}
	result.Tasks = tasks
	return result, nil
}

func parseSchtasksCSV(content string) ([]ScheduledTask, error) {
	r := csv.NewReader(strings.NewReader(content))
	r.LazyQuotes = true
	r.FieldsPerRecord = -1

	records, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) < 2 {
		return nil, nil
	}

	// Header-Index suchen
	header := records[0]
	idx := func(name string) int {
		for i, h := range header {
			if strings.EqualFold(strings.TrimSpace(h), name) {
				return i
			}
		}
		return -1
	}

	nameIdx     := idx("TaskName")
	statusIdx   := idx("Status")
	nextRunIdx  := idx("Next Run Time")
	lastRunIdx  := idx("Last Run Time")
	lastResIdx  := idx("Last Result")
	cmdIdx      := idx("Task To Run")
	userIdx     := idx("Run As User")
	schedIdx    := idx("Schedule Type")
	triggerIdx  := idx("Scheduled Task State")

	var tasks []ScheduledTask
	for _, row := range records[1:] {
		get := func(i int) string {
			if i < 0 || i >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[i])
		}
		name := get(nameIdx)
		if name == "" || name == "TaskName" {
			continue
		}
		// Pfad vereinfachen: nur letzten Teil nach letztem "\"
		displayName := name
		if i := strings.LastIndex(name, `\`); i >= 0 {
			displayName = name[i+1:]
		}

		enabled := strings.EqualFold(get(triggerIdx), "Enabled")
		isSystem := strings.HasPrefix(name, `\Microsoft\`) || strings.HasPrefix(name, `\Microsoft Windows\`)

		task := ScheduledTask{
			Name:      displayName,
			Command:   get(cmdIdx),
			Schedule:  get(schedIdx),
			RunAsUser: get(userIdx),
			IsSystem:  isSystem,
			IsEnabled: enabled,
			Source:    "taskscheduler",
		}

		if s := get(statusIdx); s != "" {
			task.LastStatus = s
		}
		if s := get(lastResIdx); s != "" && task.LastStatus == "" {
			task.LastStatus = s
		}
		if ts := parseWinTime(get(nextRunIdx)); !ts.IsZero() {
			task.NextRun = ts
		}
		if ts := parseWinTime(get(lastRunIdx)); !ts.IsZero() {
			task.LastRun = ts
		}
		tasks = append(tasks, task)
	}
	return tasks, nil
}

// parseWinTime versucht ein Windows-Datum zu parsen ("DD.MM.YYYY HH:MM:SS" oder "M/D/YYYY H:MM:SS AM/PM").
func parseWinTime(s string) time.Time {
	if s == "" || s == "N/A" || s == "Nie" || strings.EqualFold(s, "never") || strings.EqualFold(s, "never") {
		return time.Time{}
	}
	for _, layout := range []string{
		"02.01.2006 15:04:05",
		"1/2/2006 3:04:05 PM",
		"1/2/2006 15:04:05",
		"2006-01-02 15:04:05",
	} {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t
		}
	}
	return time.Time{}
}
