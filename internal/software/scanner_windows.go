//go:build windows

package software

import (
	"fmt"
	"math"
	"os/exec"
	"strings"
	"time"

	"golang.org/x/sys/windows/registry"
)

// Scan liest alle installierten Programme, Laufzeiten und Browser aus der Windows-Registry.
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

// Registry-Pfade für installierte Software (System 64-bit, System 32-bit, Benutzer)
var uninstallPaths = []struct {
	root  registry.Key
	path  string
	scope InstallScope
	arch  string
}{
	{registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`, ScopeSystem, "64-bit"},
	{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`, ScopeSystem, "32-bit"},
	{registry.CURRENT_USER, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`, ScopeUser, "64-bit"},
}

func scanPrograms() ([]Program, []ScanError) {
	var programs []Program
	var errs []ScanError
	seen := make(map[string]bool) // Duplikate vermeiden

	for _, p := range uninstallPaths {
		key, err := registry.OpenKey(p.root, p.path, registry.ENUMERATE_SUB_KEYS)
		if err != nil {
			continue
		}
		defer key.Close()

		subkeys, err := key.ReadSubKeyNames(-1)
		if err != nil {
			errs = append(errs, ScanError{"software.programs", fmt.Sprintf("Registry-Unterkeys lesen fehlgeschlagen: %v", err)})
			continue
		}

		for _, sub := range subkeys {
			subkey, err := registry.OpenKey(p.root,
				p.path+`\`+sub,
				registry.QUERY_VALUE)
			if err != nil {
				continue
			}

			prog, ok := readProgram(subkey, p.scope, p.arch)
			subkey.Close()
			if !ok {
				continue
			}

			// Duplikat-Check: Name + Version + Publisher
			dedupeKey := strings.ToLower(prog.Name + "|" + prog.Version + "|" + prog.Publisher)
			if seen[dedupeKey] {
				continue
			}
			seen[dedupeKey] = true
			programs = append(programs, prog)
		}
	}

	return programs, errs
}

// readProgram liest die Felder eines Uninstall-Eintrags aus der Registry.
// Gibt (program, false) zurück wenn kein DisplayName vorhanden (kein echtes Programm).
func readProgram(key registry.Key, scope InstallScope, arch string) (Program, bool) {
	name, _, _ := key.GetStringValue("DisplayName")
	name = strings.TrimSpace(name)
	if name == "" {
		return Program{}, false
	}

	// System-Komponenten überspringen (kein sinnvoller Uninstall-String)
	systemUpdate, _, _ := key.GetStringValue("SystemComponent")
	if systemUpdate == "1" {
		return Program{}, false
	}

	version, _, _ := key.GetStringValue("DisplayVersion")
	publisher, _, _ := key.GetStringValue("Publisher")
	uninstallStr, _, _ := key.GetStringValue("UninstallString")
	quietUninstall, _, _ := key.GetStringValue("QuietUninstallString")
	installLocation, _, _ := key.GetStringValue("InstallLocation")

	// Größe (EstimatedSize ist in KB)
	sizeMB := 0.0
	if sizeKB, _, err := key.GetIntegerValue("EstimatedSize"); err == nil && sizeKB > 0 {
		sizeMB = math.Round(float64(sizeKB)/1024*10) / 10
	}

	// Installationsdatum: Format YYYYMMDD
	installDate := time.Time{}
	if dateStr, _, err := key.GetStringValue("InstallDate"); err == nil && len(dateStr) == 8 {
		installDate, _ = time.Parse("20060102", dateStr)
	}

	// Bevorzuge QuietUninstallString (silent uninstall)
	uninstall := strings.TrimSpace(quietUninstall)
	if uninstall == "" {
		uninstall = strings.TrimSpace(uninstallStr)
	}

	return Program{
		Name:            name,
		Version:         strings.TrimSpace(version),
		Publisher:       strings.TrimSpace(publisher),
		InstallDate:     installDate,
		SizeMB:          sizeMB,
		Scope:           scope,
		Architecture:    arch,
		UninstallString: uninstall,
		InstallLocation: strings.TrimSpace(installLocation),
	}, true
}

// ─── Laufzeiten ───────────────────────────────────────────────────────────────

func scanRuntimes() ([]Runtime, []ScanError) {
	var runtimes []Runtime
	var errs []ScanError

	// .NET Framework (klassisch, bis 4.8)
	runtimes = append(runtimes, scanDotNetFramework(&errs)...)

	// .NET Core / .NET 5+ via dotnet CLI
	runtimes = append(runtimes, scanDotNetCore(&errs)...)

	// Visual C++ Redistributables (aus Uninstall-Registry, Publisher = Microsoft)
	runtimes = append(runtimes, scanVCRedist(&errs)...)

	// Java
	runtimes = append(runtimes, scanJava(&errs)...)

	// Python
	runtimes = append(runtimes, scanPython(&errs)...)

	// Node.js
	runtimes = append(runtimes, scanNodeJS(&errs)...)

	return runtimes, errs
}

func scanDotNetFramework(errs *[]ScanError) []Runtime {
	var runtimes []Runtime
	// Bekannte .NET-Framework-Versionen und ihre Registry-Schlüssel
	versions := []struct{ name, regPath, releaseKey string }{
		{"4.8.1", `SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`, "528449"},
		{"4.8", `SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`, "528040"},
		{"4.7.2", `SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`, "461808"},
		{"4.7.1", `SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`, "461308"},
		{"4.7", `SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`, "460798"},
		{"4.6.2", `SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`, "394802"},
		{"3.5", `SOFTWARE\Microsoft\NET Framework Setup\NDP\v3.5`, ""},
		{"2.0", `SOFTWARE\Microsoft\NET Framework Setup\NDP\v2.0.50727`, ""},
	}

	for _, v := range versions {
		key, err := registry.OpenKey(registry.LOCAL_MACHINE, v.regPath, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		defer key.Close()

		if v.releaseKey != "" {
			// .NET 4.x: über Release-DWORD prüfen
			release, _, err := key.GetIntegerValue("Release")
			if err != nil {
				continue
			}
			// Genau dieses Release oder höher
			var minRelease uint64
			fmt.Sscanf(v.releaseKey, "%d", &minRelease)
			if release < minRelease {
				continue
			}
		} else {
			// Ältere Versionen: Install=1 prüfen
			install, _, err := key.GetIntegerValue("Install")
			if err != nil || install != 1 {
				continue
			}
		}

		actualVersion, _, _ := key.GetStringValue("Version")
		if actualVersion == "" {
			actualVersion = v.name
		}

		runtimes = append(runtimes, Runtime{
			Name:        ".NET Framework " + v.name,
			Version:     actualVersion,
			Type:        RuntimeDotNetFx,
			Architecture: "64-bit",
			IsInstalled: true,
		})
		break // Nur die höchste installierte Version eintragen
	}

	return runtimes
}

func scanDotNetCore(errs *[]ScanError) []Runtime {
	var runtimes []Runtime
	out, err := exec.Command("dotnet", "--list-runtimes").Output()
	if err != nil {
		return runtimes // dotnet nicht installiert
	}
	seen := make(map[string]bool)
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Beispiel: "Microsoft.NETCore.App 8.0.1 [C:\Program Files\dotnet\...]"
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		name := fields[0]
		version := fields[1]
		key := name + version
		if seen[key] {
			continue
		}
		seen[key] = true
		runtimeType := RuntimeDotNet
		if strings.Contains(name, "AspNetCore") {
			runtimeType = RuntimeDotNet
		}
		runtimes = append(runtimes, Runtime{
			Name:        name,
			Version:     version,
			Type:        runtimeType,
			IsInstalled: true,
		})
	}
	return runtimes
}

func scanVCRedist(errs *[]ScanError) []Runtime {
	var runtimes []Runtime
	// VC++ Redistributables sind in der normalen Uninstall-Liste mit Publisher "Microsoft Corporation"
	programs, _ := scanPrograms()
	seen := make(map[string]bool)
	for _, p := range programs {
		if strings.Contains(p.Publisher, "Microsoft") &&
			strings.Contains(strings.ToLower(p.Name), "visual c++") {
			key := p.Name + p.Version + p.Architecture
			if seen[key] {
				continue
			}
			seen[key] = true
			runtimes = append(runtimes, Runtime{
				Name:         p.Name,
				Version:      p.Version,
				Type:         RuntimeVCRedist,
				Architecture: p.Architecture,
				IsInstalled:  true,
			})
		}
	}
	return runtimes
}

func scanJava(errs *[]ScanError) []Runtime {
	var runtimes []Runtime
	javaPaths := []string{
		`SOFTWARE\JavaSoft\Java Runtime Environment`,
		`SOFTWARE\JavaSoft\JDK`,
		`SOFTWARE\WOW6432Node\JavaSoft\Java Runtime Environment`,
	}
	for _, path := range javaPaths {
		key, err := registry.OpenKey(registry.LOCAL_MACHINE, path, registry.QUERY_VALUE|registry.ENUMERATE_SUB_KEYS)
		if err != nil {
			continue
		}
		defer key.Close()
		subkeys, _ := key.ReadSubKeyNames(-1)
		for _, sub := range subkeys {
			if sub == "CurrentVersion" {
				continue
			}
			subkey, err := registry.OpenKey(registry.LOCAL_MACHINE, path+`\`+sub, registry.QUERY_VALUE)
			if err != nil {
				continue
			}
			version, _, _ := subkey.GetStringValue("FullVersion")
			if version == "" {
				version = sub
			}
			subkey.Close()
			runtimes = append(runtimes, Runtime{
				Name:        "Java",
				Version:     version,
				Type:        RuntimeJava,
				IsInstalled: true,
			})
		}
	}
	return runtimes
}

func scanPython(errs *[]ScanError) []Runtime {
	out, err := exec.Command("python", "--version").CombinedOutput()
	if err != nil {
		return nil
	}
	version := strings.TrimPrefix(strings.TrimSpace(string(out)), "Python ")
	return []Runtime{{Name: "Python", Version: version, Type: RuntimePython, IsInstalled: true}}
}

func scanNodeJS(errs *[]ScanError) []Runtime {
	out, err := exec.Command("node", "--version").Output()
	if err != nil {
		return nil
	}
	version := strings.TrimPrefix(strings.TrimSpace(string(out)), "v")
	return []Runtime{{Name: "Node.js", Version: version, Type: RuntimeNodeJS, IsInstalled: true}}
}

// ─── Browser ─────────────────────────────────────────────────────────────────

func scanBrowsers()([]Browser, []ScanError) {
	var browsers []Browser
	var errs []ScanError

	// Standard-Browser via Registry ermitteln
	defaultBrowser := getDefaultBrowser()

	// Bekannte Browser in der Uninstall-Registry suchen
	known := []struct{ name, keyPattern string }{
		{"Google Chrome", "google chrome"},
		{"Mozilla Firefox", "mozilla firefox"},
		{"Microsoft Edge", "microsoft edge"},
		{"Opera", "opera"},
		{"Brave", "brave"},
		{"Vivaldi", "vivaldi"},
	}

	programs, _ := scanPrograms()
	for _, k := range known {
		for _, p := range programs {
			if strings.Contains(strings.ToLower(p.Name), k.keyPattern) {
				browsers = append(browsers, Browser{
					Name:      k.name,
					Version:   p.Version,
					IsDefault: strings.Contains(strings.ToLower(defaultBrowser), strings.ToLower(k.name)),
				})
				break
			}
		}
	}

	return browsers, errs
}

// getDefaultBrowser liest den Standard-Browser aus der Registry.
func getDefaultBrowser() string {
	key, err := registry.OpenKey(registry.CURRENT_USER,
		`SOFTWARE\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice`,
		registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer key.Close()
	progID, _, _ := key.GetStringValue("ProgId")
	return progID
}
