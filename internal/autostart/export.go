package autostart

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SaveToVault speichert den Autostart-Scan als Markdown.
func SaveToVault(vaultPath string, result ScanResult) (string, error) {
	dir := filepath.Join(vaultPath, "autostart")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("verzeichnis erstellen: %w", err)
	}

	ts := time.Now().Format("2006-01-02_15-04-05")
	filename := filepath.Join(dir, ts+"_autostart.md")

	var sb strings.Builder
	sb.WriteString("# Autostart-Scan\n\n")
	sb.WriteString(fmt.Sprintf("**Datum:** %s\n\n", result.Timestamp.Format("02.01.2006 15:04:05")))
	sb.WriteString(fmt.Sprintf("**Einträge gesamt:** %d\n\n", len(result.Entries)))

	// Gruppiert nach Location
	groups := map[Location][]Entry{}
	order := []Location{}
	for _, e := range result.Entries {
		if _, ok := groups[e.Location]; !ok {
			order = append(order, e.Location)
		}
		groups[e.Location] = append(groups[e.Location], e)
	}

	for _, loc := range order {
		entries := groups[loc]
		sb.WriteString(fmt.Sprintf("## %s\n\n", string(loc)))
		sb.WriteString("| Name | Pfad | System | Aktiv |\n")
		sb.WriteString("|------|------|--------|-------|\n")
		for _, e := range entries {
			sys := "–"
			if e.IsSystem {
				sys = "✓"
			}
			active := "✓"
			if !e.IsEnabled {
				active = "–"
			}
			sb.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n",
				mdEsc(e.Name), mdEsc(e.Path), sys, active))
		}
		sb.WriteString("\n")
	}

	if len(result.Errors) > 0 {
		sb.WriteString("## Scan-Warnungen\n\n")
		for _, e := range result.Errors {
			sb.WriteString(fmt.Sprintf("- **%s**: %s\n", e.Module, e.Message))
		}
	}

	if err := os.WriteFile(filename, []byte(sb.String()), 0o644); err != nil {
		return "", fmt.Errorf("datei schreiben: %w", err)
	}
	return filename, nil
}

func mdEsc(s string) string {
	return strings.ReplaceAll(s, "|", "\\|")
}
