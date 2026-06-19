//go:build windows

package autostart

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/sys/windows/registry"
)

// Scan sammelt alle Autostart-Einträge aus allen bekannten Quellen.
func Scan() ScanResult {
	result := ScanResult{Timestamp: time.Now()}

	scanners := []func() ([]Entry, []ScanError){
		scanRegistryRun,
		scanWinlogon,
		scanStartupFolders,
		scanScheduledTasks,
		scanAutoServices,
		scanAppInitDLLs,
	}

	for _, fn := range scanners {
		entries, errs := fn()
		result.Entries = append(result.Entries, entries...)
		result.Errors = append(result.Errors, errs...)
	}

	return result
}

// ── Registry Run / RunOnce ────────────────────────────────────────────────────

func scanRegistryRun() ([]Entry, []ScanError) {
	var entries []Entry
	var errs []ScanError

	type regSource struct {
		root     registry.Key
		subkey   string
		location Location
	}

	sources := []regSource{
		{registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`, LocRegistryHKLM},
		{registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`, LocRunOnceHKLM},
		{registry.CURRENT_USER, `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`, LocRegistryHKCU},
		{registry.CURRENT_USER, `SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`, LocRunOnceHKCU},
		// 32-bit view auf 64-bit Systemen
		{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run`, LocRegistryHKLM},
	}

	for _, src := range sources {
		k, err := registry.OpenKey(src.root, src.subkey, registry.QUERY_VALUE|registry.READ)
		if err != nil {
			continue // Key existiert nicht → kein Fehler, einfach überspringen
		}
		names, err := k.ReadValueNames(0)
		k.Close()
		if err != nil {
			errs = append(errs, ScanError{Module: string(src.location), Message: err.Error()})
			continue
		}

		k2, _ := registry.OpenKey(src.root, src.subkey, registry.QUERY_VALUE)
		for _, name := range names {
			val, _, _ := k2.GetStringValue(name)
			entries = append(entries, Entry{
				Name:      name,
				Path:      val,
				Location:  src.location,
				IsSystem:  isSystemPath(val),
				IsEnabled: true,
			})
		}
		k2.Close()
	}

	return entries, errs
}

// ── Winlogon Shell / Userinit ─────────────────────────────────────────────────

func scanWinlogon() ([]Entry, []ScanError) {
	var entries []Entry

	k, err := registry.OpenKey(registry.LOCAL_MACHINE,
		`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`, registry.QUERY_VALUE)
	if err != nil {
		return nil, nil
	}
	defer k.Close()

	defaults := map[string]string{
		"Shell":    "explorer.exe",
		"Userinit": `C:\Windows\system32\userinit.exe,`,
	}

	for name, def := range defaults {
		val, _, err := k.GetStringValue(name)
		if err != nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(val), strings.TrimSpace(def)) {
			continue // Standard-Wert → nicht melden
		}
		entries = append(entries, Entry{
			Name:      "Winlogon " + name,
			Path:      val,
			Location:  LocWinlogon,
			IsSystem:  false, // Abweichung vom Standard ist nie "System"
			IsEnabled: true,
		})
	}

	return entries, nil
}

// ── Startup-Ordner ────────────────────────────────────────────────────────────

func scanStartupFolders() ([]Entry, []ScanError) {
	var entries []Entry

	folders := map[Location]string{
		LocStartupUser: filepath.Join(os.Getenv("APPDATA"),
			`Microsoft\Windows\Start Menu\Programs\Startup`),
		LocStartupCommon: filepath.Join(os.Getenv("ProgramData"),
			`Microsoft\Windows\Start Menu\Programs\StartUp`),
	}

	for loc, dir := range folders {
		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, f := range files {
			if f.IsDir() || strings.ToLower(f.Name()) == "desktop.ini" {
				continue
			}
			entries = append(entries, Entry{
				Name:      strings.TrimSuffix(f.Name(), filepath.Ext(f.Name())),
				Path:      filepath.Join(dir, f.Name()),
				Location:  loc,
				IsSystem:  false,
				IsEnabled: true,
			})
		}
	}

	return entries, nil
}

// ── Geplante Tasks ────────────────────────────────────────────────────────────

func scanScheduledTasks() ([]Entry, []ScanError) {
	var entries []Entry
	var errs []ScanError

	out, err := exec.Command("schtasks", "/query", "/fo", "CSV", "/v").Output()
	if err != nil {
		return nil, []ScanError{{Module: "schtasks", Message: fmt.Sprintf("schtasks fehlgeschlagen: %v", err)}}
	}

	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 {
		return nil, nil
	}

	// CSV-Header parsen um Spalten-Indices zu finden
	headers := parseCSVLine(lines[0])
	idxName, idxStatus, idxNextRun, idxTaskToRun := -1, -1, -1, -1
	for i, h := range headers {
		switch strings.TrimSpace(h) {
		case "TaskName":
			idxName = i
		case "Status":
			idxStatus = i
		case "Next Run Time":
			idxNextRun = i
		case "Task To Run":
			idxTaskToRun = i
		}
	}
	_ = idxNextRun
	if idxName < 0 || idxTaskToRun < 0 {
		errs = append(errs, ScanError{Module: "schtasks", Message: "CSV-Header nicht erkannt"})
		return entries, errs
	}

	seen := map[string]bool{}
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := parseCSVLine(line)
		if len(fields) <= idxTaskToRun {
			continue
		}

		name := strings.TrimSpace(fields[idxName])
		taskPath := strings.TrimSpace(fields[idxTaskToRun])
		status := ""
		if idxStatus < len(fields) {
			status = strings.TrimSpace(fields[idxStatus])
		}

		// Nur Tasks mit echtem Ausführungspfad, keine System-Tasks
		if taskPath == "" || taskPath == "N/A" || strings.HasPrefix(name, `\Microsoft\`) {
			continue
		}
		if seen[name] {
			continue
		}
		seen[name] = true

		enabled := status != "Disabled"
		entries = append(entries, Entry{
			Name:      strings.TrimPrefix(name, `\`),
			Path:      taskPath,
			Location:  LocScheduledTask,
			IsSystem:  isSystemPath(taskPath),
			IsEnabled: enabled,
		})
	}

	return entries, errs
}

// ── Dienste mit AutoStart ─────────────────────────────────────────────────────

func scanAutoServices() ([]Entry, []ScanError) {
	var entries []Entry
	var errs []ScanError

	// PowerShell: alle Dienste mit StartType=Auto die nicht von Microsoft sind
	script := `Get-WmiObject Win32_Service | Where-Object { $_.StartMode -eq 'Auto' } | Select-Object Name,DisplayName,PathName,State | ConvertTo-Csv -NoTypeInformation`
	out, err := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script).Output()
	if err != nil {
		return nil, []ScanError{{Module: "services-autostart", Message: err.Error()}}
	}

	lines := strings.Split(string(out), "\n")
	for i, line := range lines {
		if i == 0 {
			continue // Header
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := parseCSVLine(line)
		if len(fields) < 4 {
			continue
		}
		name := unquote(fields[0])
		displayName := unquote(fields[1])
		path := unquote(fields[2])

		// Systempfade überspringen
		if isWindowsSystemService(path) {
			continue
		}

		label := displayName
		if label == "" {
			label = name
		}
		entries = append(entries, Entry{
			Name:      label,
			Path:      path,
			Location:  LocService,
			IsSystem:  false,
			IsEnabled: true,
		})
	}
	_ = errs
	return entries, nil
}

// ── AppInit_DLLs ─────────────────────────────────────────────────────────────

func scanAppInitDLLs() ([]Entry, []ScanError) {
	var entries []Entry

	for _, subkey := range []string{
		`SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows`,
		`SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Windows`,
	} {
		k, err := registry.OpenKey(registry.LOCAL_MACHINE, subkey, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		val, _, _ := k.GetStringValue("AppInit_DLLs")
		k.Close()
		if val == "" {
			continue
		}
		entries = append(entries, Entry{
			Name:      "AppInit_DLLs",
			Path:      val,
			Location:  LocAppInitDLL,
			IsSystem:  false,
			IsEnabled: true,
		})
	}

	return entries, nil
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

func isSystemPath(path string) bool {
	lower := strings.ToLower(path)
	systemDirs := []string{
		`c:\windows\`, `c:\program files\windows `, `%systemroot%`,
		`%windir%`, `%systemdir%`,
	}
	for _, d := range systemDirs {
		if strings.Contains(lower, d) {
			return true
		}
	}
	return false
}

func isWindowsSystemService(path string) bool {
	lower := strings.ToLower(path)
	return strings.HasPrefix(lower, `c:\windows\`) ||
		strings.HasPrefix(lower, `c:\windows\system32\`) ||
		strings.Contains(lower, `\microsoft\`)
}

// parseCSVLine zerlegt eine CSV-Zeile korrekt (berücksichtigt gequotete Felder).
func parseCSVLine(line string) []string {
	var fields []string
	inQuote := false
	current := &strings.Builder{}
	for i := 0; i < len(line); i++ {
		c := line[i]
		if c == '"' {
			if inQuote && i+1 < len(line) && line[i+1] == '"' {
				current.WriteByte('"')
				i++
			} else {
				inQuote = !inQuote
			}
		} else if c == ',' && !inQuote {
			fields = append(fields, current.String())
			current.Reset()
		} else {
			current.WriteByte(c)
		}
	}
	fields = append(fields, current.String())
	return fields
}

func unquote(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}
