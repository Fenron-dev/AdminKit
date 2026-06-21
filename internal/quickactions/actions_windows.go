//go:build windows

package quickactions

import (
	"os/exec"
	"strings"
)

// GetCleanupSizes gibt die aktuellen Größen der bereinigbaren Temp-Ordner zurück.
func GetCleanupSizes() map[string]string {
	sizes := map[string]string{}
	cmds := []struct{ key, shell string }{
		{"tmp", `powershell -NoProfile -Command "(Get-ChildItem $env:TEMP -Recurse -ErrorAction SilentlyContinue | Measure-Object -Sum Length).Sum / 1MB | ForEach-Object { '{0:N1} MB' -f $_ }"`},
		{"trash", `powershell -NoProfile -Command "try { (New-Object -ComObject Shell.Application).NameSpace(0xA).Items() | Measure-Object -Sum Size | ForEach-Object { '{0:N1} MB' -f ($_.Sum/1MB) } } catch { '–' }"`},
	}
	for _, c := range cmds {
		out, err := exec.Command("cmd", "/C", c.shell).Output()
		if err == nil && len(strings.TrimSpace(string(out))) > 0 {
			sizes[c.key] = strings.TrimSpace(string(out))
		} else {
			sizes[c.key] = "–"
		}
	}
	sizes["caches"] = "–"
	return sizes
}

// RunFix führt einen Fix anhand der Fix-ID aus.
func RunFix(fixID string) Result {
	switch fixID {
	case "enable_firewall":
		return runCmd("enable_firewall", "Firewall aktivieren",
			"netsh", "advfirewall", "set", "allprofiles", "state", "on")
	case "open_windows_security":
		return runCmd("open_windows_security", "Windows Sicherheit öffnen",
			"cmd", "/c", "start", "windowsdefender:")
	case "open_software_update":
		return runCmd("open_software_update", "Windows Update öffnen",
			"cmd", "/c", "start", "ms-settings:windowsupdate")
	case "open_storage":
		return runCmd("open_storage", "Speicher-Einstellungen öffnen",
			"cmd", "/c", "start", "ms-settings:storagesense")
	case "open_bitlocker":
		return runCmd("open_bitlocker", "BitLocker öffnen",
			"cmd", "/c", "start", "ms-settings:deviceencryption")
	case "open_rdp_settings":
		return runCmd("open_rdp_settings", "Remote Desktop öffnen",
			"cmd", "/c", "start", "ms-settings:remotedesktop")
	case "quick_clean":
		return runQuickClean()
	case "open_autostart":
		return Result{Action: "open_autostart", Output: "navigate:autostart", Success: true}
	case "open_events":
		return Result{Action: "open_events", Output: "navigate:events", Success: true}
	default:
		return Result{Action: fixID, Output: "Unbekannte Fix-ID: " + fixID, Success: false}
	}
}

// RunQuickAction führt eine Quick-Action-Kombo aus.
func RunQuickAction(actionID string) Result {
	switch actionID {
	case "internet_fix":
		return runInternetFix()
	case "printer_fix":
		return runPrinterFix()
	case "quick_clean":
		return runQuickClean()
	case "dns_flush":
		return runCmd("dns_flush", "DNS-Cache leeren", "ipconfig", "/flushdns")
	default:
		return Result{Action: actionID, Output: "Unbekannte Aktion: " + actionID, Success: false}
	}
}

func runInternetFix() Result {
	sb := strings.Builder{}
	sb.WriteString("=== Internet-Fix ===\n\n")

	steps := []struct{ label, cmd string; args []string }{
		{"DNS-Cache leeren",         "ipconfig", []string{"/flushdns"}},
		{"Winsock zurücksetzen",     "netsh",    []string{"winsock", "reset"}},
		{"IP-Konfiguration freigeben","ipconfig", []string{"/release"}},
		{"IP-Konfiguration erneuern","ipconfig", []string{"/renew"}},
	}
	for _, s := range steps {
		out, err := exec.Command(s.cmd, s.args...).CombinedOutput()
		sb.WriteString(s.label + ":\n")
		if err != nil {
			sb.WriteString("  FEHLER: " + err.Error() + "\n")
		} else {
			sb.WriteString("  ✓ " + strings.TrimSpace(string(out)) + "\n")
		}
	}
	sb.WriteString("\n✓ Internet-Fix abgeschlossen. Neustart empfohlen wenn Winsock zurückgesetzt wurde.")
	return Result{Action: "internet_fix", Output: sb.String(), Success: true}
}

func runPrinterFix() Result {
	sb := strings.Builder{}
	sb.WriteString("=== Drucker-Fix ===\n\n")

	steps := []struct{ label, cmd string; args []string }{
		{"Druckdienst stoppen",      "net", []string{"stop", "spooler", "/y"}},
		{"Druckwarteschlange leeren","cmd", []string{"/c", `del /Q /F /S "%SYSTEMROOT%\System32\spool\PRINTERS\*.*"`}},
		{"Druckdienst starten",      "net", []string{"start", "spooler"}},
	}
	for _, s := range steps {
		out, err := exec.Command(s.cmd, s.args...).CombinedOutput()
		sb.WriteString(s.label + ":\n")
		if err != nil {
			sb.WriteString("  FEHLER: " + err.Error() + "\n")
		} else {
			sb.WriteString("  ✓ " + strings.TrimSpace(string(out)) + "\n")
		}
	}
	sb.WriteString("\n✓ Drucker-Fix abgeschlossen.")
	return Result{Action: "printer_fix", Output: sb.String(), Success: true}
}

func runQuickClean() Result {
	sb := strings.Builder{}
	sb.WriteString("=== Schnellbereinigung ===\n\n")

	steps := []struct{ label, cmd string; args []string }{
		{"Temp-Dateien (%TEMP%)", "cmd", []string{"/c", `del /q /f /s %TEMP%\* 2>&1`}},
		{"Windows Update Cache",  "cmd", []string{"/c", `del /q /f /s %WINDIR%\SoftwareDistribution\Download\* 2>&1`}},
		{"Papierkorb leeren",     "cmd", []string{"/c", "rd /s /q %SystemDrive%\\$Recycle.Bin 2>&1"}},
	}
	for _, s := range steps {
		out, err := exec.Command(s.cmd, s.args...).CombinedOutput()
		sb.WriteString(s.label + ":\n")
		if err != nil {
			sb.WriteString("  FEHLER: " + err.Error() + "\n")
		} else {
			sb.WriteString("  ✓ " + strings.TrimSpace(string(out)) + "\n")
		}
	}
	sb.WriteString("\n✓ Schnellbereinigung abgeschlossen.")
	return Result{Action: "quick_clean", Output: sb.String(), Success: true}
}

func runCmd(id, label string, name string, args ...string) Result {
	out, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		return Result{Action: id, Output: label + ":\nFEHLER: " + err.Error() + "\n" + string(out), Success: false}
	}
	return Result{Action: id, Output: label + ":\n✓ " + strings.TrimSpace(string(out)), Success: true}
}
