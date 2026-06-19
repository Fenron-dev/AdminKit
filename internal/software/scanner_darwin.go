//go:build darwin

package software

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Scan liest alle installierten Programme, Laufzeiten und Browser auf macOS.
func Scan() (*ScanResult, error) {
	result := &ScanResult{Timestamp: time.Now()}

	programs, errs := scanPrograms()
	result.Programs = programs
	result.Errors = append(result.Errors, errs...)

	runtimes, errs := scanRuntimes()
	result.Runtimes = runtimes
	result.Errors = append(result.Errors, errs...)

	browsers, errs := scanBrowsers()
	result.Browsers = browsers
	result.Errors = append(result.Errors, errs...)

	return result, nil
}

// ─── Installierte Programme ───────────────────────────────────────────────────

func scanPrograms() ([]Program, []ScanError) {
	var programs []Program
	var errs []ScanError

	// 1. Apps aus /Applications (System + Benutzer)
	appDirs := []struct {
		path  string
		scope InstallScope
	}{
		{"/Applications", ScopeSystem},
		{filepath.Join(os.Getenv("HOME"), "Applications"), ScopeUser},
	}

	for _, d := range appDirs {
		entries, err := os.ReadDir(d.path)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !strings.HasSuffix(entry.Name(), ".app") {
				continue
			}
			appPath := filepath.Join(d.path, entry.Name())
			prog, ok := readAppBundle(appPath, d.scope)
			if ok {
				programs = append(programs, prog)
			}
		}
	}

	// 2. Homebrew-Pakete (falls installiert)
	programs = append(programs, scanBrew(&errs)...)

	// 3. Mac App Store via mas (falls installiert)
	programs = append(programs, scanMAS(&errs)...)

	return programs, errs
}

// readAppBundle liest Name, Version und Größe aus einem .app-Bundle.
func readAppBundle(appPath string, scope InstallScope) (Program, bool) {
	plistPath := filepath.Join(appPath, "Contents", "Info.plist")
	out, err := exec.Command("defaults", "read", plistPath).Output()
	if err != nil {
		return Program{}, false
	}

	content := string(out)
	name := plistValue(content, "CFBundleDisplayName")
	if name == "" {
		name = plistValue(content, "CFBundleName")
	}
	if name == "" {
		name = strings.TrimSuffix(filepath.Base(appPath), ".app")
	}

	version := plistValue(content, "CFBundleShortVersionString")
	if version == "" {
		version = plistValue(content, "CFBundleVersion")
	}

	// Größe via du schätzen (kann etwas dauern bei großen Apps)
	sizeMB := 0.0
	if duOut, err := exec.Command("du", "-sk", appPath).Output(); err == nil {
		var sizeKB float64
		fmt.Sscanf(string(duOut), "%f", &sizeKB)
		sizeMB = sizeKB / 1024
	}

	// Install-Datum via Dateisystem
	installDate := time.Time{}
	if info, err := os.Stat(appPath); err == nil {
		installDate = info.ModTime()
	}

	return Program{
		Name:            name,
		Version:         version,
		Publisher:       plistValue(content, "CFBundleIdentifier"),
		InstallDate:     installDate,
		SizeMB:          sizeMB,
		Scope:           scope,
		Architecture:    "Universal",
		InstallLocation: appPath,
	}, true
}

// plistValue extrahiert einen Wert aus der defaults-read-Ausgabe.
func plistValue(content, key string) string {
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, key+" =") || strings.HasPrefix(line, key+"=") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				val := strings.TrimSpace(parts[1])
				val = strings.TrimSuffix(strings.TrimPrefix(val, `"`), `"`)
				val = strings.TrimSuffix(val, ";")
				return strings.TrimSpace(val)
			}
		}
		// Mehrzeilige Strings (selten)
		if strings.TrimSpace(line) == key && i+1 < len(lines) {
			next := strings.TrimSpace(lines[i+1])
			if next != "=" && next != "{" && next != "(" {
				return strings.TrimRight(next, ";")
			}
		}
	}
	return ""
}

// scanBrew listet Homebrew-Pakete auf.
func scanBrew(errs *[]ScanError) []Program {
	var programs []Program
	out, err := exec.Command("brew", "list", "--versions").Output()
	if err != nil {
		return programs // Homebrew nicht installiert
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		name := fields[0]
		version := ""
		if len(fields) > 1 {
			version = fields[len(fields)-1] // letzte Version wenn mehrere
		}
		programs = append(programs, Program{
			Name:        name,
			Version:     version,
			Publisher:   "Homebrew",
			Scope:       ScopeUser,
			Architecture: "Universal",
		})
	}
	return programs
}

// scanMAS listet Mac-App-Store-Apps via mas-CLI auf.
func scanMAS(errs *[]ScanError) []Program {
	var programs []Program
	out, err := exec.Command("mas", "list").Output()
	if err != nil {
		return programs // mas nicht installiert
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Format: "1234567890  App Name                 (1.2.3)"
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		// App-ID und Name trennen
		appIDStr := fields[0]
		_ = appIDStr
		rest := strings.Join(fields[1:], " ")
		// Version in Klammern am Ende
		version := ""
		if idx := strings.LastIndex(rest, "("); idx >= 0 {
			version = strings.TrimSuffix(rest[idx+1:], ")")
			rest = strings.TrimSpace(rest[:idx])
		}
		programs = append(programs, Program{
			Name:        rest,
			Version:     version,
			Publisher:   "Mac App Store",
			Scope:       ScopeUser,
			Architecture: "Universal",
		})
	}
	return programs
}

// ─── Laufzeiten ───────────────────────────────────────────────────────────────

func scanRuntimes() ([]Runtime, []ScanError) {
	var runtimes []Runtime
	var errs []ScanError

	// .NET Core via dotnet CLI
	if out, err := exec.Command("dotnet", "--list-runtimes").Output(); err == nil {
		seen := make(map[string]bool)
		for _, line := range strings.Split(string(out), "\n") {
			fields := strings.Fields(strings.TrimSpace(line))
			if len(fields) < 2 {
				continue
			}
			key := fields[0] + fields[1]
			if seen[key] {
				continue
			}
			seen[key] = true
			runtimes = append(runtimes, Runtime{
				Name: fields[0], Version: fields[1],
				Type: RuntimeDotNet, IsInstalled: true,
			})
		}
	}

	// Java
	if out, err := exec.Command("java", "-version").CombinedOutput(); err == nil {
		version := parseJavaVersion(string(out))
		if version != "" {
			runtimes = append(runtimes, Runtime{
				Name: "Java", Version: version,
				Type: RuntimeJava, IsInstalled: true,
			})
		}
	}

	// Python 3
	if out, err := exec.Command("python3", "--version").Output(); err == nil {
		v := strings.TrimPrefix(strings.TrimSpace(string(out)), "Python ")
		runtimes = append(runtimes, Runtime{
			Name: "Python 3", Version: v,
			Type: RuntimePython, IsInstalled: true,
		})
	}

	// Node.js
	if out, err := exec.Command("node", "--version").Output(); err == nil {
		v := strings.TrimPrefix(strings.TrimSpace(string(out)), "v")
		runtimes = append(runtimes, Runtime{
			Name: "Node.js", Version: v,
			Type: RuntimeNodeJS, IsInstalled: true,
		})
	}

	return runtimes, errs
}

// parseJavaVersion extrahiert die Version aus der java -version Ausgabe.
func parseJavaVersion(output string) string {
	for _, line := range strings.Split(output, "\n") {
		if strings.Contains(line, "version") {
			// Format: openjdk version "21.0.2" 2024-01-16
			start := strings.Index(line, `"`)
			end := strings.LastIndex(line, `"`)
			if start >= 0 && end > start {
				return line[start+1 : end]
			}
		}
	}
	return ""
}

// ─── Browser ─────────────────────────────────────────────────────────────────

// browserInfo wird für das system_profiler JSON-Parsing genutzt.
type spBrowsers struct {
	SPApplicationsDataType []struct {
		Name    string `json:"_name"`
		Version string `json:"version"`
		Path    string `json:"path"`
	} `json:"SPApplicationsDataType"`
}

func scanBrowsers() ([]Browser, []ScanError) {
	var browsers []Browser
	var errs []ScanError

	known := map[string]string{
		"Google Chrome": "/Applications/Google Chrome.app",
		"Firefox":       "/Applications/Firefox.app",
		"Safari":        "/Applications/Safari.app",
		"Microsoft Edge": "/Applications/Microsoft Edge.app",
		"Opera":         "/Applications/Opera.app",
		"Brave Browser": "/Applications/Brave Browser.app",
		"Vivaldi":       "/Applications/Vivaldi.app",
	}

	// Standard-Browser via LaunchServices
	defaultBrowser := getDefaultBrowser()

	for name, appPath := range known {
		if _, err := os.Stat(appPath); err != nil {
			continue // nicht installiert
		}
		version := readAppVersion(appPath)
		isDefault := strings.Contains(strings.ToLower(defaultBrowser), strings.ToLower(name))

		// Chrome-Profile zählen
		profileCount := 0
		if name == "Google Chrome" {
			profileCount = countChromeProfiles()
		}

		browsers = append(browsers, Browser{
			Name:         name,
			Version:      version,
			IsDefault:    isDefault,
			ProfileCount: profileCount,
		})
	}
	return browsers, errs
}

// readAppVersion liest CFBundleShortVersionString aus einem .app-Bundle.
func readAppVersion(appPath string) string {
	plist := filepath.Join(appPath, "Contents", "Info.plist")
	// plutil -convert json gibt strukturierten JSON-Output
	out, err := exec.Command("plutil", "-convert", "json", "-o", "-", plist).Output()
	if err != nil {
		return ""
	}
	var data map[string]any
	if json.Unmarshal(out, &data) != nil {
		return ""
	}
	if v, ok := data["CFBundleShortVersionString"].(string); ok {
		return v
	}
	if v, ok := data["CFBundleVersion"].(string); ok {
		return v
	}
	return ""
}

// getDefaultBrowser liest den Standard-Browser auf macOS.
func getDefaultBrowser() string {
	out, err := exec.Command("defaults", "read",
		"com.apple.LaunchServices/com.apple.launchservices.secure",
		"LSHandlers").Output()
	if err != nil {
		return ""
	}
	// Suche nach http-Handler
	lines := strings.Split(string(out), "\n")
	for i, line := range lines {
		if strings.Contains(line, `"http"`) || strings.Contains(line, "LSHandlerURLScheme = http") {
			// Nächste Zeilen nach Handler-Bundleid suchen
			for j := i; j < min(i+5, len(lines)); j++ {
				if strings.Contains(lines[j], "LSHandlerRoleAll") || strings.Contains(lines[j], "bundleid") {
					return lines[j]
				}
			}
		}
	}
	return ""
}

// countChromeProfiles zählt Google-Chrome-Profile im User-Verzeichnis.
func countChromeProfiles() int {
	profileDir := filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "Google", "Chrome")
	entries, err := os.ReadDir(profileDir)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if e.IsDir() && (e.Name() == "Default" || strings.HasPrefix(e.Name(), "Profile ")) {
			count++
		}
	}
	return count
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
