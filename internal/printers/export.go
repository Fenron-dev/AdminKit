package printers

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SaveToVault schreibt den Scan-Bericht als Markdown in den Vault.
func SaveToVault(vaultPath string, result ScanResult) (string, error) {
	dir := filepath.Join(vaultPath, "printers")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("verzeichnis erstellen: %w", err)
	}

	ts := time.Now().Format("2006-01-02_15-04-05")
	filename := filepath.Join(dir, ts+"_printers.md")

	var sb strings.Builder
	sb.WriteString("# Drucker-Scan\n\n")
	sb.WriteString(fmt.Sprintf("**Datum:** %s\n\n", result.Timestamp.Format("02.01.2006 15:04:05")))

	if len(result.Printers) == 0 {
		sb.WriteString("*Keine Drucker gefunden.*\n")
	} else {
		sb.WriteString(fmt.Sprintf("**Gefundene Drucker:** %d\n\n", len(result.Printers)))
		sb.WriteString("| Name | Treiber | Port | Status | Standard | Netzwerk | IP-Adresse | Freigabe |\n")
		sb.WriteString("|------|---------|------|--------|----------|----------|------------|----------|\n")
		for _, p := range result.Printers {
			def := ""
			if p.IsDefault {
				def = "✓"
			}
			net := ""
			if p.IsNetwork {
				net = "✓"
			}
			share := ""
			if p.IsShared {
				share = p.ShareName
			}
			sb.WriteString(fmt.Sprintf("| %s | %s | %s | %s | %s | %s | %s | %s |\n",
				mdEscape(p.Name),
				mdEscape(p.Driver),
				mdEscape(p.Port),
				string(p.Status),
				def,
				net,
				mdEscape(p.IPAddress),
				mdEscape(share),
			))
		}
	}

	if len(result.Errors) > 0 {
		sb.WriteString("\n## Scan-Warnungen\n\n")
		for _, e := range result.Errors {
			sb.WriteString(fmt.Sprintf("- **%s**: %s\n", e.Module, e.Message))
		}
	}

	if err := os.WriteFile(filename, []byte(sb.String()), 0o644); err != nil {
		return "", fmt.Errorf("datei schreiben: %w", err)
	}
	return filename, nil
}

func mdEscape(s string) string {
	return strings.ReplaceAll(s, "|", "\\|")
}
