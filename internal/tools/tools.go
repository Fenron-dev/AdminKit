// Package tools stellt Diagnose-Werkzeuge bereit: Vault-Backup, Port-Scan
// und plattformspezifische Konsolen-Tools (ping, traceroute, netstat …).
package tools

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ─── Vault-Backup ─────────────────────────────────────────────────────────────

// BackupVault erstellt ein ZIP-Archiv der gesamten Vault und speichert es in
// vaultPath/exports/backups/. Gibt den absoluten Pfad des Archivs zurück.
func BackupVault(vaultPath string) (string, error) {
	if vaultPath == "" {
		return "", fmt.Errorf("kein Vault-Pfad angegeben")
	}

	destDir := filepath.Join(vaultPath, "exports", "backups")
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return "", fmt.Errorf("Backup-Verzeichnis konnte nicht erstellt werden: %w", err)
	}

	timestamp := time.Now().Format("20060102_150405")
	zipPath := filepath.Join(destDir, fmt.Sprintf("backup_%s.zip", timestamp))

	f, err := os.Create(zipPath)
	if err != nil {
		return "", fmt.Errorf("ZIP-Datei konnte nicht erstellt werden: %w", err)
	}
	defer f.Close()

	zw := zip.NewWriter(f)
	defer zw.Close()

	skipPrefix := filepath.Join(vaultPath, "exports", "backups")

	err = filepath.Walk(vaultPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Zugriffsrechte-Fehler überspringen
		}
		// Backups-Ordner selbst nicht ins Backup aufnehmen (kein rekursives Backup)
		if strings.HasPrefix(path, skipPrefix) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if info.IsDir() {
			return nil
		}

		rel, err := filepath.Rel(vaultPath, path)
		if err != nil {
			return nil
		}
		// ZIP-Einträge immer mit Forward-Slashes (plattformunabhängig)
		rel = filepath.ToSlash(rel)

		w, err := zw.Create(rel)
		if err != nil {
			return nil
		}

		src, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer src.Close()
		_, err = io.Copy(w, src)
		return err
	})
	if err != nil {
		return "", fmt.Errorf("Backup fehlgeschlagen: %w", err)
	}

	return zipPath, nil
}

// ─── Port-Scan ────────────────────────────────────────────────────────────────

// CommonPorts sind häufig verwendete Ports die beim Port-Scan ohne explizite
// Port-Angabe geprüft werden.
var CommonPorts = []int{
	21, 22, 23, 25, 53, 80, 110, 135, 139, 143,
	443, 445, 3306, 3389, 5985, 5986, 8080, 8443, 9100,
}

// PortResult beschreibt das Ergebnis für einen einzelnen Port.
type PortResult struct {
	Port   int
	Open   bool
	Banner string // optional, wenn der Dienst einen Banner sendet
}

// RunPortScan prüft TCP-Ports auf dem angegebenen Host.
// target-Format: "host" (CommonPorts) oder "host:80,443,3389"
func RunPortScan(target string) (string, error) {
	host, ports, err := parsePortScanTarget(target)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "Port-Scan: %s\n", host)
	fmt.Fprintf(&sb, "Ports: %s\n", formatPortList(ports))
	fmt.Fprintf(&sb, strings.Repeat("─", 40)+"\n")

	results := make([]PortResult, len(ports))
	timeout := 500 * time.Millisecond

	for i, port := range ports {
		addr := fmt.Sprintf("%s:%d", host, port)
		conn, err := net.DialTimeout("tcp", addr, timeout)
		if err == nil {
			results[i] = PortResult{Port: port, Open: true}
			conn.Close()
		} else {
			results[i] = PortResult{Port: port, Open: false}
		}
	}

	openCount := 0
	for _, r := range results {
		icon := "✗ geschlossen"
		if r.Open {
			icon = "✓ OFFEN"
			openCount++
		}
		svc := knownService(r.Port)
		if svc != "" {
			svc = " (" + svc + ")"
		}
		fmt.Fprintf(&sb, "  %-6d %s%s\n", r.Port, icon, svc)
	}

	fmt.Fprintf(&sb, strings.Repeat("─", 40)+"\n")
	fmt.Fprintf(&sb, "%d von %d Ports offen\n", openCount, len(ports))
	return sb.String(), nil
}

// parsePortScanTarget trennt Host und Port-Liste aus dem Ziel-String.
func parsePortScanTarget(target string) (string, []int, error) {
	target = strings.TrimSpace(target)
	if target == "" {
		return "", nil, fmt.Errorf("kein Ziel angegeben")
	}

	// Format: "host:p1,p2,p3" oder "host:p1-p2" oder "host"
	var host string
	var portStr string

	if idx := strings.Index(target, ":"); idx >= 0 {
		host = target[:idx]
		portStr = target[idx+1:]
	} else {
		host = target
	}

	if portStr == "" {
		return host, CommonPorts, nil
	}

	var ports []int
	seen := make(map[int]bool)

	for _, part := range strings.Split(portStr, ",") {
		part = strings.TrimSpace(part)
		if strings.Contains(part, "-") {
			// Bereich: "80-100"
			bounds := strings.SplitN(part, "-", 2)
			lo, e1 := strconv.Atoi(bounds[0])
			hi, e2 := strconv.Atoi(bounds[1])
			if e1 != nil || e2 != nil || lo > hi || lo < 1 || hi > 65535 {
				continue
			}
			for p := lo; p <= hi; p++ {
				if !seen[p] {
					ports = append(ports, p)
					seen[p] = true
				}
			}
		} else {
			p, err := strconv.Atoi(part)
			if err == nil && p >= 1 && p <= 65535 && !seen[p] {
				ports = append(ports, p)
				seen[p] = true
			}
		}
	}

	if len(ports) == 0 {
		return "", nil, fmt.Errorf("keine gültigen Ports angegeben")
	}
	sort.Ints(ports)
	return host, ports, nil
}

func formatPortList(ports []int) string {
	if len(ports) > 10 {
		return fmt.Sprintf("%d Ports (%d–%d)", len(ports), ports[0], ports[len(ports)-1])
	}
	parts := make([]string, len(ports))
	for i, p := range ports {
		parts[i] = strconv.Itoa(p)
	}
	return strings.Join(parts, ", ")
}

// RunRaw führt einen beliebigen Shell-Befehl aus (sh -c / cmd /c) und gibt
// stdout+stderr als String zurück. Für die freie Terminal-Eingabe.
func RunRaw(command string) (string, error) {
	if strings.TrimSpace(command) == "" {
		return "", fmt.Errorf("leerer Befehl")
	}
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", command)
	} else {
		cmd = exec.Command("sh", "-c", command)
	}
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	_ = cmd.Run() // Fehlercode ignorieren — Ausgabe enthält Details
	result := strings.TrimRight(buf.String(), "\n")
	if result == "" {
		result = "(keine Ausgabe)"
	}
	return result, nil
}

// RunCurl führt eine HTTP-GET-Anfrage an die URL aus und gibt Status + Body zurück.
// Wird für den "curl"-Tool-Typ in der Konsole verwendet.
func RunCurl(rawURL string) (string, error) {
	if rawURL == "" {
		return "", fmt.Errorf("keine URL angegeben")
	}
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return "", fmt.Errorf("ungültige URL: %w", err)
	}
	req.Header.Set("User-Agent", "AdminKit/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("Verbindungsfehler: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024)) // max 64 KB
	result := fmt.Sprintf("HTTP %s\n", resp.Status)
	// Relevante Header ausgeben
	for _, h := range []string{"Content-Type", "Server", "X-Powered-By", "CF-RAY"} {
		if v := resp.Header.Get(h); v != "" {
			result += fmt.Sprintf("%s: %s\n", h, v)
		}
	}
	result += "\n" + strings.TrimSpace(string(body))
	return result, nil
}

// knownService gibt den bekannten Dienstnamen für häufige Ports zurück.
func knownService(port int) string {
	services := map[int]string{
		21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP",
		53: "DNS", 80: "HTTP", 110: "POP3", 135: "MSRPC",
		139: "NetBIOS", 143: "IMAP", 443: "HTTPS", 445: "SMB",
		3306: "MySQL", 3389: "RDP", 5985: "WinRM", 5986: "WinRM-SSL",
		8080: "HTTP-Alt", 8443: "HTTPS-Alt", 9100: "Drucker",
	}
	return services[port]
}
