// export.go speichert Netzwerk-Scan-Ergebnisse als Markdown in der Vault-Session.
// WiFi-Passwörter werden nur geschrieben wenn includePasswords=true.
package network

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SaveToVault schreibt den Netzwerk-Scan als Markdown-Dateien in die Session.
// includePasswords steuert, ob WiFi-Passwörter in die Datei geschrieben werden.
func SaveToVault(result *ScanResult, sessionPath string, includePasswords bool) error {
	dir := filepath.Join(sessionPath, "network")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	if err := writeFile(dir, "interfaces.md", renderAdapters(result)); err != nil {
		return fmt.Errorf("interfaces.md: %w", err)
	}
	if err := writeFile(dir, "shares.md", renderShares(result)); err != nil {
		return fmt.Errorf("shares.md: %w", err)
	}
	if err := writeFile(dir, "wifi.md", renderWiFi(result, includePasswords)); err != nil {
		return fmt.Errorf("wifi.md: %w", err)
	}

	return nil
}

func renderAdapters(r *ScanResult) string {
	sb := &strings.Builder{}
	fmt.Fprintf(sb, "# Netzwerkadapter\n\n")
	fmt.Fprintf(sb, "> Scan: %s\n\n", r.Timestamp.Format("02.01.2006 15:04:05"))

	if len(r.Adapters) == 0 {
		fmt.Fprintln(sb, "_Keine Adapter gefunden._")
		return sb.String()
	}

	for _, a := range r.Adapters {
		connIcon := "⚫"
		if a.IsConnected {
			connIcon = "🟢"
		} else if a.IsEnabled {
			connIcon = "🟡"
		}
		fmt.Fprintf(sb, "## %s %s (%s)\n\n", connIcon, a.Name, a.Type)
		fmt.Fprintf(sb, "| Eigenschaft | Wert |\n|---|---|\n")
		fmt.Fprintf(sb, "| Beschreibung | %s |\n", a.Description)
		fmt.Fprintf(sb, "| MAC-Adresse | %s |\n", a.MACAddress)
		fmt.Fprintf(sb, "| Status | %s |\n", statusText(a.IsConnected, a.IsEnabled))
		if len(a.IPv4) > 0 {
			fmt.Fprintf(sb, "| IPv4 | %s |\n", strings.Join(a.IPv4, ", "))
		}
		if len(a.SubnetMasks) > 0 {
			fmt.Fprintf(sb, "| Subnetzmaske | %s |\n", strings.Join(a.SubnetMasks, ", "))
		}
		if a.Gateway != "" {
			fmt.Fprintf(sb, "| Gateway | %s |\n", a.Gateway)
		}
		if len(a.IPv6) > 0 {
			fmt.Fprintf(sb, "| IPv6 | %s |\n", strings.Join(a.IPv6, ", "))
		}
		if len(a.DNSServers) > 0 {
			fmt.Fprintf(sb, "| DNS-Server | %s |\n", strings.Join(a.DNSServers, ", "))
		}
		if a.Speed != "" {
			fmt.Fprintf(sb, "| Geschwindigkeit | %s |\n", a.Speed)
		}
		fmt.Fprintln(sb)
	}
	return sb.String()
}

func renderShares(r *ScanResult) string {
	sb := &strings.Builder{}
	fmt.Fprintf(sb, "# Netzlaufwerke\n\n")
	fmt.Fprintf(sb, "> Scan: %s\n\n", r.Timestamp.Format("02.01.2006 15:04:05"))

	if len(r.Shares) == 0 {
		fmt.Fprintln(sb, "_Keine Netzlaufwerke verbunden._")
		return sb.String()
	}

	fmt.Fprintf(sb, "| Laufwerk | Netzwerkpfad | Status |\n|---|---|---|\n")
	for _, s := range r.Shares {
		fmt.Fprintf(sb, "| %s | %s | %s |\n", s.DriveLetter, s.UNCPath, s.Status)
	}
	return sb.String()
}

func renderWiFi(r *ScanResult, includePasswords bool) string {
	sb := &strings.Builder{}
	fmt.Fprintf(sb, "# WiFi-Profile\n\n")
	fmt.Fprintf(sb, "> Scan: %s\n\n", r.Timestamp.Format("02.01.2006 15:04:05"))

	if !includePasswords {
		fmt.Fprintf(sb, "> ⚠️ Passwörter wurden nicht exportiert (`include_wifi_passwords: false`).\n\n")
	}

	if len(r.WiFi) == 0 {
		fmt.Fprintln(sb, "_Keine WiFi-Profile gefunden._")
		return sb.String()
	}

	fmt.Fprintf(sb, "| SSID | Sicherheit | Verbunden | Passwort |\n|---|---|---|---|\n")
	for _, w := range r.WiFi {
		conn := "–"
		if w.IsConnected {
			conn = "✓"
		}
		pw := "–"
		if w.HasPassword && includePasswords && w.Password != "" {
			pw = "`" + w.Password + "`"
		} else if w.HasPassword {
			pw = "••••••••"
		}
		fmt.Fprintf(sb, "| %s | %s | %s | %s |\n", w.SSID, w.Security, conn, pw)
	}
	return sb.String()
}

func statusText(connected, enabled bool) string {
	switch {
	case connected:
		return "Verbunden"
	case enabled:
		return "Aktiviert (nicht verbunden)"
	default:
		return "Deaktiviert"
	}
}

func writeFile(dir, name, content string) error {
	return os.WriteFile(filepath.Join(dir, name), []byte(content), 0644)
}

// Sicherstellen dass time-Import genutzt wird (für Timestamp-Format)
var _ = time.Now
