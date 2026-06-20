//go:build darwin

package tasks

import (
	"bufio"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Scan liest cron-Jobs und at-Jobs auf macOS.
func Scan() (*ScanResult, error) {
	result := &ScanResult{}

	// Benutzer-crontab
	if out, err := exec.Command("crontab", "-l").Output(); err == nil {
		for _, task := range parseCrontab(string(out), os.Getenv("USER"), false) {
			result.Tasks = append(result.Tasks, task)
		}
	}

	// System-crontab /etc/crontab
	if data, err := os.ReadFile("/etc/crontab"); err == nil {
		for _, task := range parseCrontab(string(data), "root", true) {
			result.Tasks = append(result.Tasks, task)
		}
	}

	// /etc/cron.d/ Verzeichnis
	cronDFiles, _ := filepath.Glob("/etc/cron.d/*")
	for _, f := range cronDFiles {
		if data, err := os.ReadFile(f); err == nil {
			for _, task := range parseCrontab(string(data), "system", true) {
				task.Name = filepath.Base(f) + ": " + task.Name
				result.Tasks = append(result.Tasks, task)
			}
		}
	}

	// Periodische macOS-Skripte (/etc/periodic/)
	for _, period := range []string{"daily", "weekly", "monthly"} {
		dir := "/etc/periodic/" + period
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				result.Tasks = append(result.Tasks, ScheduledTask{
					Name:      e.Name(),
					Command:   filepath.Join(dir, e.Name()),
					Schedule:  period,
					RunAsUser: "root",
					IsSystem:  true,
					IsEnabled: true,
					Source:    "cron",
				})
			}
		}
	}

	return result, nil
}

// parseCrontab parst crontab-Zeilen in ScheduledTask-Einträge.
func parseCrontab(content, defaultUser string, isSystem bool) []ScheduledTask {
	var tasks []ScheduledTask
	scanner := bufio.NewScanner(strings.NewReader(content))
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "@") || strings.Contains(line, "=") {
			continue
		}

		fields := strings.Fields(line)
		minFields := 6
		user := defaultUser
		cmd := ""
		sched := ""

		if isSystem && len(fields) >= 7 {
			// System-cron: min hour dom mon dow user command
			sched = strings.Join(fields[:5], " ")
			user = fields[5]
			cmd = strings.Join(fields[6:], " ")
		} else if !isSystem && len(fields) >= minFields {
			// User-cron: min hour dom mon dow command
			sched = strings.Join(fields[:5], " ")
			cmd = strings.Join(fields[5:], " ")
		} else {
			continue
		}

		name := cmd
		if len(name) > 60 {
			name = name[:57] + "…"
		}

		tasks = append(tasks, ScheduledTask{
			Name:      name,
			Command:   cmd,
			Schedule:  sched,
			RunAsUser: user,
			IsSystem:  isSystem || user == "root",
			IsEnabled: true,
			Source:    "cron",
		})
	}
	return tasks
}
