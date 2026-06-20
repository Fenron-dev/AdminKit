//go:build darwin

package tools

import (
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// RunCommand führt ein Konsolen-Tool aus und gibt die Ausgabe als String zurück.
func RunCommand(tool, target string) (string, error) {
	start := time.Now()
	var out string
	var err error

	switch tool {
	case "ping":
		out, err = runPing(target)
	case "traceroute":
		out, err = runTraceroute(target)
	case "dns":
		out, err = runDNS(target)
	case "netstat":
		out, err = runNetstat()
	case "arp":
		out, err = runARP()
	case "portscan":
		out, err = RunPortScan(target)
	case "drivers":
		out, err = runKexts()
	case "curl":
		out, err = RunCurl(target)
	case "ifconfig":
		out, err = runIfconfig()
	case "route":
		out, err = runRoute()
	case "dns-flush":
		out, err = runDNSFlush()
	case "hosts":
		out, err = runHosts()
	case "firewall":
		out, err = runFirewall()
	case "openports":
		out, err = runOpenPorts()
	default:
		return "", fmt.Errorf("unbekanntes Tool: %s", tool)
	}

	if err != nil {
		return "", err
	}

	elapsed := time.Since(start).Round(time.Millisecond)
	return out + fmt.Sprintf("\n[%s in %v]", time.Now().Format("15:04:05"), elapsed), nil
}

// GetClipboard liest den aktuellen Text aus der macOS-Zwischenablage.
func GetClipboard() (string, error) {
	out, err := exec.Command("pbpaste").Output()
	if err != nil {
		return "", fmt.Errorf("Zwischenablage konnte nicht gelesen werden: %w", err)
	}
	return strings.TrimRight(string(out), "\n"), nil
}

// GetUptime gibt die Zeit seit dem letzten Systemstart zurück.
func GetUptime() (string, error) {
	// sysctl kern.boottime gibt: "{ sec = 1718787223, usec = 0 } ..."
	out, err := exec.Command("sysctl", "-n", "kern.boottime").Output()
	if err != nil {
		return "", fmt.Errorf("Uptime konnte nicht ermittelt werden: %w", err)
	}
	line := string(out)
	var sec int64
	if _, err := fmt.Sscanf(extractSysctlField(line, "sec"), "%d", &sec); err != nil {
		return "", fmt.Errorf("kern.boottime konnte nicht geparst werden")
	}
	bootTime := time.Unix(sec, 0)
	return formatUptime(int64(time.Since(bootTime).Seconds())), nil
}

// extractSysctlField extrahiert den Wert eines Felds aus "{ key = value, ... }".
func extractSysctlField(s, key string) string {
	needle := key + " = "
	idx := strings.Index(s, needle)
	if idx < 0 {
		return ""
	}
	rest := s[idx+len(needle):]
	end := strings.IndexAny(rest, ", }")
	if end < 0 {
		return strings.TrimSpace(rest)
	}
	return strings.TrimSpace(rest[:end])
}

// ─── Interne Implementierungen ────────────────────────────────────────────────

func runPing(target string) (string, error) {
	if target == "" {
		return "", fmt.Errorf("kein Ziel angegeben")
	}
	// -c 4: 4 Pakete, -W 2000: 2000ms Timeout pro Paket
	out, err := exec.Command("ping", "-c", "4", "-W", "2000", target).CombinedOutput()
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("ping fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

func runTraceroute(target string) (string, error) {
	if target == "" {
		return "", fmt.Errorf("kein Ziel angegeben")
	}
	// -m 20: max. 20 Hops, -n: keine DNS-Auflösung, -w 2: 2s Timeout
	out, err := exec.Command("traceroute", "-m", "20", "-n", "-w", "2", target).CombinedOutput()
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("traceroute fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

func runDNS(target string) (string, error) {
	if target == "" {
		return "", fmt.Errorf("kein Hostname angegeben")
	}
	out, err := exec.Command("nslookup", target).CombinedOutput()
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("DNS-Lookup fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

func runNetstat() (string, error) {
	// -a: alle, -n: numerisch, -v: verbose
	out, err := exec.Command("netstat", "-an").CombinedOutput()
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

func runIfconfig() (string, error) {
	out, err := exec.Command("ifconfig").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("ifconfig fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

func runRoute() (string, error) {
	out, err := exec.Command("netstat", "-rn").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("Route konnte nicht abgerufen werden: %w", err)
	}
	return string(out), nil
}

func runDNSFlush() (string, error) {
	// mDNSResponder-Neustart erfordert Admin-Rechte; osascript zeigt nativen Auth-Dialog.
	script := `do shell script "dscacheutil -flushcache; killall -HUP mDNSResponder" with administrator privileges`
	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err != nil {
		// Ohne Admin-Rechte zumindest den user-Cache leeren
		out2, _ := exec.Command("dscacheutil", "-flushcache").CombinedOutput()
		return "DNS-User-Cache geleert (mDNSResponder-Neustart erfordert Admin-Rechte).\n" + string(out2), nil
	}
	return "DNS-Cache erfolgreich geleert (dscacheutil + mDNSResponder-Neustart).\n" + string(out), nil
}

func runHosts() (string, error) {
	out, err := exec.Command("cat", "/etc/hosts").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("Hosts-Datei konnte nicht gelesen werden: %w", err)
	}
	return string(out), nil
}

func runFirewall() (string, error) {
	fwPath := "/usr/libexec/ApplicationFirewall/socketfilterfw"
	state, _ := exec.Command(fwPath, "--getglobalstate").CombinedOutput()
	stealth, _ := exec.Command(fwPath, "--getstealthmode").CombinedOutput()
	blockall, _ := exec.Command(fwPath, "--getblockall").CombinedOutput()
	result := "=== macOS Application Firewall ===\n"
	result += "Status:       " + strings.TrimSpace(string(state)) + "\n"
	result += "Stealth Mode: " + strings.TrimSpace(string(stealth)) + "\n"
	result += "Block All:    " + strings.TrimSpace(string(blockall)) + "\n"
	return result, nil
}

func runOpenPorts() (string, error) {
	// lsof ohne sudo zeigt nur Prozesse des aktuellen Benutzers
	out, err := exec.Command("lsof", "-i", "-P", "-n", "-sTCP:LISTEN").CombinedOutput()
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("lsof fehlgeschlagen: %w", err)
	}
	return string(out), nil
}

// runKexts listet geladene Kernel-Erweiterungen auf (macOS-Äquivalent zu Treibern).
func runKexts() (string, error) {
	// system_profiler SPExtensionsDataType ist sehr langsam — kextstat ist schneller
	out, err := exec.Command("kextstat", "-l").CombinedOutput()
	if err != nil {
		// kextstat fehlt auf neueren macOS-Versionen (Apple Silicon Kernel Extensions)
		out2, err2 := exec.Command("system_profiler", "SPExtensionsDataType").CombinedOutput()
		if err2 != nil {
			return "", fmt.Errorf("Treiber/Erweiterungen konnten nicht abgerufen werden")
		}
		return string(out2), nil
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

