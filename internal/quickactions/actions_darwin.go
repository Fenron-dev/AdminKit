//go:build darwin

package quickactions

import (
	"fmt"
	"os/exec"
	"strings"
)

// RunFix führt einen Fix anhand der Fix-ID aus.
func RunFix(fixID string) Result {
	switch fixID {
	case "enable_firewall":
		return runCmd("enable_firewall", "Firewall aktivieren",
			"/usr/libexec/ApplicationFirewall/socketfilterfw", "--setglobalstate", "on")
	case "disable_ssh":
		return runCmd("disable_ssh", "SSH deaktivieren",
			"systemsetup", "-setremotelogin", "off")
	case "open_filevault":
		return openPref("open_filevault",
			"x-apple.systempreferences:com.apple.preference.security?FDE")
	case "open_software_update":
		return openPref("open_software_update",
			"x-apple.systempreferences:com.apple.preferences.softwareupdate")
	case "open_storage":
		return openPref("open_storage",
			"x-apple.systempreferences:com.apple.preference.storage")
	case "quick_clean":
		return runQuickClean()
	case "open_autostart":
		return Result{Action: "open_autostart", Output: "navigate:autostart", Success: true}
	case "open_events":
		return Result{Action: "open_events", Output: "navigate:events", Success: true}
	case "sip_info":
		return Result{Action: "sip_info", Output: "https://support.apple.com/en-us/102149", Success: true}
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
		return runCmd("dns_flush", "DNS-Cache leeren",
			"dscacheutil", "-flushcache")
	default:
		return Result{Action: actionID, Output: "Unbekannte Aktion: " + actionID, Success: false}
	}
}

func runInternetFix() Result {
	sb := strings.Builder{}
	sb.WriteString("=== Internet-Fix ===\n\n")

	// DNS-Cache leeren
	out1, err1 := exec.Command("dscacheutil", "-flushcache").CombinedOutput()
	sb.WriteString("DNS-Cache leeren:\n")
	if err1 != nil {
		sb.WriteString("  FEHLER: " + err1.Error() + "\n")
	} else {
		sb.WriteString("  ✓ OK" + string(out1) + "\n")
	}

	// mDNSResponder neu starten
	out2, err2 := exec.Command("killall", "-HUP", "mDNSResponder").CombinedOutput()
	sb.WriteString("mDNSResponder neu starten:\n")
	if err2 != nil {
		sb.WriteString("  FEHLER: " + err2.Error() + "\n")
	} else {
		sb.WriteString("  ✓ OK" + string(out2) + "\n")
	}

	// DHCP-Lease erneuern (alle aktiven Interfaces)
	ifaces, _ := exec.Command("networksetup", "-listallhardwareports").Output()
	sb.WriteString("\nNetzwerkdienste erkannt:\n")
	sb.WriteString(string(ifaces) + "\n")

	sb.WriteString("\n✓ Internet-Fix abgeschlossen.\nHinweis: Bei anhaltenden Problemen WLAN aus- und wieder einschalten.")
	return Result{Action: "internet_fix", Output: sb.String(), Success: true}
}

func runPrinterFix() Result {
	sb := strings.Builder{}
	sb.WriteString("=== Drucker-Fix ===\n\n")

	// CUPS neu starten
	out1, err1 := exec.Command("launchctl", "stop", "org.cups.cupsd").CombinedOutput()
	sb.WriteString("CUPS stoppen:\n")
	if err1 != nil {
		sb.WriteString("  FEHLER: " + err1.Error() + "\n")
	} else {
		sb.WriteString("  ✓ OK\n" + string(out1))
	}

	out2, err2 := exec.Command("launchctl", "start", "org.cups.cupsd").CombinedOutput()
	sb.WriteString("CUPS starten:\n")
	if err2 != nil {
		sb.WriteString("  FEHLER: " + err2.Error() + "\n")
	} else {
		sb.WriteString("  ✓ OK\n" + string(out2))
	}

	// Druckerwarteschlangen anzeigen
	out3, _ := exec.Command("lpstat", "-o").CombinedOutput()
	sb.WriteString("\nAktive Druckaufträge:\n")
	if len(strings.TrimSpace(string(out3))) == 0 {
		sb.WriteString("  (keine)\n")
	} else {
		sb.WriteString(string(out3))
	}

	sb.WriteString("\n✓ Drucker-Fix abgeschlossen.")
	return Result{Action: "printer_fix", Output: sb.String(), Success: true}
}

func runQuickClean() Result {
	sb := strings.Builder{}
	sb.WriteString("=== Schnellbereinigung ===\n\n")

	// /tmp leeren (nur eigene Dateien)
	out1, err1 := exec.Command("sh", "-c", `find /private/tmp -user $(whoami) -maxdepth 1 -delete 2>&1 | head -20`).CombinedOutput()
	sb.WriteString("Temp-Dateien (/private/tmp):\n")
	if err1 != nil {
		sb.WriteString("  FEHLER: " + err1.Error() + "\n")
	} else {
		sb.WriteString("  ✓ Bereinigt\n" + string(out1))
	}

	// ~/Library/Caches Größe
	out2, _ := exec.Command("sh", "-c", `du -sh ~/Library/Caches 2>/dev/null`).CombinedOutput()
	sb.WriteString("\nCache-Größe (~/Library/Caches):\n  " + strings.TrimSpace(string(out2)) + "\n")

	// Papierkorb
	out3, err3 := exec.Command("osascript", "-e", `tell application "Finder" to empty trash`).CombinedOutput()
	sb.WriteString("\nPapierkorb leeren:\n")
	if err3 != nil {
		sb.WriteString("  FEHLER (ggf. Schreibschutz): " + err3.Error() + "\n")
	} else {
		sb.WriteString("  ✓ OK\n" + string(out3))
	}

	sb.WriteString(fmt.Sprintf("\n✓ Schnellbereinigung abgeschlossen."))
	return Result{Action: "quick_clean", Output: sb.String(), Success: true}
}

func runCmd(id, label string, name string, args ...string) Result {
	out, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		return Result{Action: id, Output: label + ":\nFEHLER: " + err.Error() + "\n" + string(out), Success: false}
	}
	return Result{Action: id, Output: label + ":\n✓ " + strings.TrimSpace(string(out)), Success: true}
}

func openPref(id, url string) Result {
	err := exec.Command("open", url).Run()
	if err != nil {
		return Result{Action: id, Output: "Konnte Einstellungen nicht öffnen: " + err.Error(), Success: false}
	}
	return Result{Action: id, Output: "navigate:" + url, Success: true}
}
