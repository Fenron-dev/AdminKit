// export.go speichert Software-Scan-Ergebnisse als Markdown und CSV in der Vault-Session.
package software

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// SaveToVault schreibt den Software-Scan als Markdown und CSV in die Session.
func SaveToVault(result *ScanResult, sessionPath string) error {
	dir := filepath.Join(sessionPath, "software")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "installed.md"), []byte(renderMarkdown(result)), 0644); err != nil {
		return fmt.Errorf("installed.md: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "installed.csv"), []byte(renderCSV(result)), 0644); err != nil {
		return fmt.Errorf("installed.csv: %w", err)
	}
	return nil
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

func renderMarkdown(r *ScanResult) string {
	sb := &strings.Builder{}
	fmt.Fprintf(sb, "# Software-Inventarisierung\n\n")
	fmt.Fprintf(sb, "> Scan: %s — %d Programme\n\n", r.Timestamp.Format("02.01.2006 15:04:05"), len(r.Programs))

	// Browser
	if len(r.Browsers) > 0 {
		fmt.Fprintf(sb, "## Browser\n\n")
		fmt.Fprintf(sb, "| Name | Version | Standard |\n|---|---|---|\n")
		for _, b := range r.Browsers {
			def := ""
			if b.IsDefault {
				def = "✓"
			}
			fmt.Fprintf(sb, "| %s | %s | %s |\n", b.Name, b.Version, def)
		}
		fmt.Fprintln(sb)
	}

	// Laufzeiten
	if len(r.Runtimes) > 0 {
		fmt.Fprintf(sb, "## Laufzeiten & Frameworks\n\n")
		fmt.Fprintf(sb, "| Name | Version | Typ | Architektur |\n|---|---|---|---|\n")
		for _, rt := range r.Runtimes {
			fmt.Fprintf(sb, "| %s | %s | %s | %s |\n", rt.Name, rt.Version, rt.Type, rt.Architecture)
		}
		fmt.Fprintln(sb)
	}

	// Programme
	fmt.Fprintf(sb, "## Installierte Programme (%d)\n\n", len(r.Programs))
	fmt.Fprintf(sb, "| Name | Version | Hersteller | Installiert | Größe | Bereich |\n|---|---|---|---|---|---|\n")
	for _, p := range r.Programs {
		date := "–"
		if !p.InstallDate.IsZero() {
			date = p.InstallDate.Format("02.01.2006")
		}
		size := "–"
		if p.SizeMB > 0 {
			if p.SizeMB >= 1000 {
				size = fmt.Sprintf("%.1f GB", p.SizeMB/1024)
			} else {
				size = fmt.Sprintf("%.0f MB", p.SizeMB)
			}
		}
		fmt.Fprintf(sb, "| %s | %s | %s | %s | %s | %s |\n",
			p.Name, p.Version, p.Publisher, date, size, p.Scope)
	}

	return sb.String()
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

// renderCSV erzeugt eine UTF-8 BOM CSV für Excel-Kompatibilität.
func renderCSV(r *ScanResult) string {
	sb := &strings.Builder{}
	// UTF-8 BOM für Excel
	sb.WriteString("\xEF\xBB\xBF")
	sb.WriteString("Name,Version,Hersteller,Installiert,Größe (MB),Bereich,Architektur,Uninstall-String\n")

	for _, p := range r.Programs {
		date := ""
		if !p.InstallDate.IsZero() {
			date = p.InstallDate.Format("02.01.2006")
		}
		size := ""
		if p.SizeMB > 0 {
			size = fmt.Sprintf("%.1f", p.SizeMB)
		}
		fields := []string{
			csvEscape(p.Name),
			csvEscape(p.Version),
			csvEscape(p.Publisher),
			date,
			size,
			string(p.Scope),
			p.Architecture,
			csvEscape(p.UninstallString),
		}
		fmt.Fprintln(sb, strings.Join(fields, ","))
	}
	return sb.String()
}

// csvEscape umschließt Felder mit Anführungszeichen wenn nötig.
func csvEscape(s string) string {
	if strings.ContainsAny(s, `",` + "\n\r") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

