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

	// ── Autostart-Einträge ───────────────────────────────────────────────────
	if data.Autostart != nil && len(data.Autostart.Entries) > 0 {
		sb.WriteString("\r\n")
		sb.WriteString("# Autostart-Einträge\r\n")
		sb.WriteString("Name,Pfad,Quelle,System,Aktiviert\r\n")
		for _, e := range data.Autostart.Entries {
			fmt.Fprintf(sb, "%s,%s,%s,%s,%s\r\n",
				csvField(e.Name),
				csvField(e.Path),
				csvField(string(e.Location)),
				boolStr(e.IsSystem),
				boolStr(e.IsEnabled),
			)
		}
	}

	// ── Dienste ──────────────────────────────────────────────────────────────
	if data.Services != nil && len(data.Services.Services) > 0 {
		sb.WriteString("\r\n")
		sb.WriteString("# Dienste\r\n")
		sb.WriteString("Name,Anzeigename,Status,Starttyp,System\r\n")
		for _, s := range data.Services.Services {
			fmt.Fprintf(sb, "%s,%s,%s,%s,%s\r\n",
				csvField(s.Name),
				csvField(s.DisplayName),
				csvField(string(s.State)),
				csvField(string(s.StartType)),
				boolStr(s.IsSystem),
			)
		}
	}

	// ── Browser-Extensions ───────────────────────────────────────────────────
	if data.BrowserExt != nil && len(data.BrowserExt.Extensions) > 0 {
		sb.WriteString("\r\n")
		sb.WriteString("# Browser-Erweiterungen\r\n")
		sb.WriteString("Browser,Name,ID,Version,Aktiviert\r\n")
		for _, e := range data.BrowserExt.Extensions {
			fmt.Fprintf(sb, "%s,%s,%s,%s,%s\r\n",
				csvField(e.Browser),
				csvField(e.Name),
				csvField(e.ID),
				csvField(e.Version),
				boolStr(e.Enabled),
			)
		}
	}

	// ── Laufende Prozesse ─────────────────────────────────────────────────────
	if len(data.Processes) > 0 {
		sb.WriteString("\r\n")
		sb.WriteString("# Laufende Prozesse\r\n")
		sb.WriteString("PID,Name,Pfad,Benutzer,CPU (%),RAM (MB),System\r\n")
		for _, p := range data.Processes {
			fmt.Fprintf(sb, "%d,%s,%s,%s,%.1f,%.1f,%s\r\n",
				p.PID,
				csvField(p.Name),
				csvField(p.Path),
				csvField(p.User),
				p.CPUPct,
				p.MemoryMB,
				boolStr(p.IsSystem),
			)
		}
	}

	// ── VirusTotal-Audit-Log ──────────────────────────────────────────────────
	if len(data.VTAuditLog) > 0 {
		sb.WriteString("\r\n")
		sb.WriteString("# VirusTotal-Prüfergebnisse\r\n")
		sb.WriteString("Name,Pfad,Typ,Status,SHA256,Erkennungen,Engines,Geprüft am\r\n")
		for _, v := range data.VTAuditLog {
			fmt.Fprintf(sb, "%s,%s,%s,%s,%s,%d,%d,%s\r\n",
				csvField(v.Name),
				csvField(v.Path),
				csvField(v.ItemType),
				csvField(v.Status),
				csvField(v.SHA256),
				v.Detections,
				v.Engines,
				csvField(v.CheckedAt),
			)
		}
	}

	// ── Systemereignisse ──────────────────────────────────────────────────────
	if data.Events != nil && len(data.Events.Events) > 0 {
		sb.WriteString("\r\n")
		sb.WriteString("# Systemereignisse\r\n")
		sb.WriteString("Zeit,Schwere,Quelle,Ereignis-ID,Log,Meldung\r\n")
		for _, e := range data.Events.Events {
			var ts string
			if !e.Time.IsZero() {
				ts = e.Time.Format("02.01.2006 15:04:05")
			}
			fmt.Fprintf(sb, "%s,%s,%s,%d,%s,%s\r\n",
				ts,
				csvField(string(e.Level)),
				csvField(e.Source),
				e.EventID,
				csvField(e.Log),
				csvField(e.Message),
			)
		}
	}

	// ── Speichervolumes ───────────────────────────────────────────────────────
	if data.System != nil && len(data.System.Hardware.Volumes) > 0 {
		sb.WriteString("\r\n")
		sb.WriteString("# Speichervolumes\r\n")
		sb.WriteString("Bezeichnung,Einhängepunkt,Dateisystem,Gesamt (GB),Belegt (GB),Frei (GB)\r\n")
		for _, v := range data.System.Hardware.Volumes {
			fmt.Fprintf(sb, "%s,%s,%s,%.1f,%.1f,%.1f\r\n",
				csvField(v.Letter),
				csvField(v.MountPoint),
				csvField(v.FileSystem),
				v.TotalGB,
				v.UsedGB,
				v.FreeGB,
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
