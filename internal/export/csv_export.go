package export

import (
	"fmt"
	"strings"
)

// GenerateCSV erzeugt eine UTF-8-CSV-Datei mit BOM für Excel-Kompatibilität.
// Enthält Software-Programme, Laufzeiten und Browser.
func GenerateCSV(data *SessionExport) string {
	sb := &strings.Builder{}

	// UTF-8 BOM — Excel erkennt damit automatisch die Kodierung
	sb.WriteString("\xEF\xBB\xBF")

	// Metadaten-Header
	fmt.Fprintf(sb, "# AdminKit Software-Bericht\r\n")
	fmt.Fprintf(sb, "# Session: %s\r\n", csvEscape(data.SessionName))
	fmt.Fprintf(sb, "# Erstellt: %s\r\n", data.GeneratedAt.Format("02.01.2006 15:04:05"))
	if data.CompanyName != "" {
		fmt.Fprintf(sb, "# Firma: %s\r\n", csvEscape(data.CompanyName))
	}
	if data.TechnicianName != "" {
		fmt.Fprintf(sb, "# Techniker: %s\r\n", csvEscape(data.TechnicianName))
	}
	sb.WriteString("\r\n")

	// ── Installierte Programme ────────────────────────────────────────────────
	sb.WriteString("Typ,Name,Version,Hersteller,Installiert,Größe (MB)\r\n")

	if data.Software != nil {
		for _, p := range data.Software.Programs {
			date := ""
			if !p.InstallDate.IsZero() && p.InstallDate.Year() > 2000 {
				date = p.InstallDate.Format("02.01.2006")
			}
			size := ""
			if p.SizeMB > 0 {
				size = fmt.Sprintf("%.1f", p.SizeMB)
			}
			fmt.Fprintf(sb, "Programm,%s,%s,%s,%s,%s\r\n",
				csvField(p.Name),
				csvField(p.Version),
				csvField(p.Publisher),
				date,
				size,
			)
		}

		for _, b := range data.Software.Browsers {
			def := ""
			if b.IsDefault {
				def = " (Standard)"
			}
			fmt.Fprintf(sb, "Browser,%s,%s,%s,,\r\n",
				csvField(b.Name+def),
				csvField(b.Version),
				"",
			)
		}

		for _, rt := range data.Software.Runtimes {
			fmt.Fprintf(sb, "Laufzeit,%s,%s,%s,,\r\n",
				csvField(rt.Name),
				csvField(rt.Version),
				csvField(string(rt.Type)),
			)
		}
	}

	// ── Drucker ──────────────────────────────────────────────────────────────
	if data.Printers != nil && len(data.Printers.Printers) > 0 {
		sb.WriteString("\r\n")
		sb.WriteString("# Drucker\r\n")
		sb.WriteString("Drucker-Name,Treiber,Port,Status,Standard,Netzwerk,IP-Adresse,Freigabe\r\n")
		for _, p := range data.Printers.Printers {
			def := boolStr(p.IsDefault)
			net := boolStr(p.IsNetwork)
			share := ""
			if p.IsShared {
				share = p.ShareName
				if share == "" {
					share = "Ja"
				}
			}
			fmt.Fprintf(sb, "%s,%s,%s,%s,%s,%s,%s,%s\r\n",
				csvField(p.Name),
				csvField(p.Driver),
				csvField(p.Port),
				csvField(string(p.Status)),
				def,
				net,
				csvField(p.IPAddress),
				csvField(share),
			)
		}
	}

	return sb.String()
}

// csvField umschließt einen Wert in Anführungszeichen wenn nötig.
func csvField(s string) string {
	if strings.ContainsAny(s, ",\"\r\n") {
		return "\"" + strings.ReplaceAll(s, "\"", "\"\"") + "\""
	}
	return s
}

// csvEscape entfernt Zeilenumbrüche für Kommentar-Zeilen.
func csvEscape(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r", ""), "\n", " ")
}

func boolStr(b bool) string {
	if b {
		return "Ja"
	}
	return "Nein"
}
