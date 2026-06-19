//go:build windows

package tools

import (
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// RunCommand führt ein Konsolen-Tool aus und gibt die Ausgabe als String zurück.
// tool: "ping", "traceroute", "dns", "netstat", "arp", "portscan", "drivers"
// target: Hostname, IP oder Port-Liste (je nach Tool)
func RunCommand(tool, target string) (string, error) {
	start := time.Now()
	var out string
	var err error

	switch tool {
	case "ping":
		out, err = runPing(target)
	case "traceroute":
		out, err = runTracert(target)
	case "dns":
		out, err = runDNS(target)
	case "netstat":
		out, err = runNetstat()
	case "arp":
		out, err = runARP()
	case "portscan":
		out, err = RunPortScan(target)
	case "drivers":
		out, err = runDrivers()
	default:
		return "", fmt.Errorf("unbekanntes Tool: %s", tool)
	}

	if err != nil {
		return "", err
	}

	elapsed := time.Since(start).Round(time.Millisecond)
	return out + fmt.Sprintf("\n[%s in %v]", time.Now().Format("15:04:05"), elapsed), nil
}

// GetClipboard liest den aktuellen Text aus der Windows-Zwischenablage.
func GetClipboard() (string, error) {
	out, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive",
		"-command", "Get-Clipboard").Output()
	if err != nil {
		return "", fmt.Errorf("Zwischenablage konnte nicht gelesen werden: %w", err)
	}
	return strings.TrimRight(string(out), "\r\n"), nil
}

// GetUptime gibt die Zeit seit dem letzten Systemstart als formatierten String zurück.
func GetUptime() (string, error) {
	// Win32_OperatingSystem.LastBootUpTime via PowerShell (schneller als WMI-Go-Binding hier)
	out, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-command",
		`(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime | `+
			`Select-Object -ExpandProperty TotalSeconds`).Output()
	if err != nil {
		return "", fmt.Errorf("Uptime konnte nicht ermittelt werden: %w", err)
	}
	var totalSec float64
	fmt.Sscanf(strings.TrimSpace(string(out)), "%f", &totalSec)
	return formatUptime(int64(totalSec)), nil
}

// ─── Interne Implementierungen ────────────────────────────────────────────────

func runPing(target string) (string, error) {
	if target == "" {
		return "", fmt.Errorf("kein Ziel angegeben")
	}
	// -n 4: 4 Pakete, -w 2000: 2s Timeout pro Paket
	out, err := exec.Command("ping", "-n", "4", "-w", "2000", target).CombinedOutput()
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("ping fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

func runTracert(target string) (string, error) {
	if target == "" {
		return "", fmt.Errorf("kein Ziel angegeben")
	}
	// -d: keine DNS-Auflösung pro Hop (schneller), -h 20: max. 20 Hops, -w 2000: 2s Timeout
	out, err := exec.Command("tracert", "-d", "-h", "20", "-w", "2000", target).CombinedOutput()
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("tracert fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

func runDNS(target string) (string, error) {
	if target == "" {
		return "", fmt.Errorf("kein Hostname angegeben")
	}
	// Resolve-DnsName gibt strukturiertere Ausgabe als nslookup
	out, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-command",
		fmt.Sprintf("Resolve-DnsName '%s' -ErrorAction SilentlyContinue | Format-List", target)).CombinedOutput()
	if err != nil || len(strings.TrimSpace(string(out))) == 0 {
		// Fallback auf nslookup
		out, err = exec.Command("nslookup", target).CombinedOutput()
		if err != nil && len(out) == 0 {
			return "", fmt.Errorf("DNS-Lookup fehlgeschlagen: %w", err)
		}
	}
	return string(out), nil
}

func runNetstat() (string, error) {
	// -a: alle Verbindungen, -n: numerisch, -o: ProzessID
	out, err := exec.Command("netstat", "-ano").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("netstat fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

func runARP() (string, error) {
	out, err := exec.Command("arp", "-a").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("arp fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

func runDrivers() (string, error) {
	// driverquery /fo csv gibt CSV-Format, leichter zu parsen
	out, err := exec.Command("driverquery", "/fo", "list", "/v").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("driverquery fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

func formatUptime(totalSec int64) string {
	days := totalSec / 86400
	hours := (totalSec % 86400) / 3600
	mins := (totalSec % 3600) / 60
	if days > 0 {
		return fmt.Sprintf("%d Tag(e), %d Std., %d Min.", days, hours, mins)
	}
	if hours > 0 {
		return fmt.Sprintf("%d Std., %d Min.", hours, mins)
	}
	return fmt.Sprintf("%d Min.", mins)
}
