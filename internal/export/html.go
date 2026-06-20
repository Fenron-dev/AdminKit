package export

import (
	"fmt"
	"html"
	"strings"
	"time"

	"adminkit/internal/autostart"
	"adminkit/internal/browserext"
	"adminkit/internal/events"
	"adminkit/internal/network"
	"adminkit/internal/printers"
	"adminkit/internal/services"
	"adminkit/internal/software"
	"adminkit/internal/system"
)

// h escaped HTML-Sonderzeichen.
func h(s string) string { return html.EscapeString(s) }

// GenerateHTML erzeugt einen vollständig selbst-enthaltenen HTML-Bericht.
// Kein CDN, kein externes CSS/JS — funktioniert offline.
func GenerateHTML(data *SessionExport, includePasswords bool) string {
	sb := &strings.Builder{}
	sb.Grow(384 * 1024)

	hostname := "–"
	if data.System != nil && data.System.OS.Name != "" {
		hostname = data.System.OS.Name
	}

	title := data.SessionName
	if data.CompanyName != "" {
		title = data.CompanyName + " – " + data.SessionName
	}

	fmt.Fprintf(sb, "<!DOCTYPE html>\n<html lang=\"de\">\n<head>\n"+
		"<meta charset=\"UTF-8\">\n"+
		"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"+
		"<title>AdminKit – %s</title>\n<style>%s</style>\n</head>\n<body>\n",
		h(title), reportCSS)

	// ── Kopfzeile ────────────────────────────────────────────────────────────
	sb.WriteString("<header>\n")
	if data.LogoBase64 != "" {
		fmt.Fprintf(sb, "  <img class=\"hdr-logo-img\" src=\"%s\" alt=\"Logo\">\n", data.LogoBase64)
	} else {
		sb.WriteString("  <div class=\"hdr-logo\">🛠 AdminKit</div>\n")
	}
	sb.WriteString("  <div class=\"hdr-body\">\n")
	if data.CompanyName != "" {
		fmt.Fprintf(sb, "    <div class=\"hdr-company\">%s</div>\n", h(data.CompanyName))
	}
	fmt.Fprintf(sb, "    <div class=\"hdr-title\">Systembericht – %s</div>\n", h(data.SessionName))
	sb.WriteString("    <div class=\"hdr-meta\">\n")
	fmt.Fprintf(sb, "      <span>Hostname: <strong>%s</strong></span>\n", h(hostname))
	fmt.Fprintf(sb, "      <span>Erstellt: <strong>%s</strong></span>\n",
		h(data.GeneratedAt.Format("02.01.2006 15:04:05")))
	if data.TechnicianName != "" {
		fmt.Fprintf(sb, "      <span>Techniker: <strong>%s</strong></span>\n", h(data.TechnicianName))
	}
	sb.WriteString("    </div>\n  </div>\n" +
		"  <div class=\"hdr-actions\"><button class=\"print-btn\" onclick=\"window.print()\">🖨 Drucken / PDF</button></div>\n" +
		"</header>\n")

	// ── Anker-Navigation ─────────────────────────────────────────────────────
	sb.WriteString("<nav class=\"report-nav\">\n")
	if data.System != nil {
		sb.WriteString("  <a href=\"#sec-system\">⚙ System</a>\n")
		if len(data.System.Smart) > 0 {
			sb.WriteString("  <a href=\"#sec-smart\">💿 SMART</a>\n")
		}
		sb.WriteString("  <a href=\"#sec-security\">🔒 Sicherheit</a>\n")
	}
	if data.Network != nil {
		sb.WriteString("  <a href=\"#sec-network\">🌐 Netzwerk</a>\n")
	}
	if data.Software != nil {
		sb.WriteString("  <a href=\"#sec-software\">📦 Software</a>\n")
	}
	if data.Printers != nil && len(data.Printers.Printers) > 0 {
		sb.WriteString("  <a href=\"#sec-printers\">🖨 Drucker</a>\n")
	}
	if data.Autostart != nil && len(data.Autostart.Entries) > 0 {
		sb.WriteString("  <a href=\"#sec-autostart\">🚀 Autostart</a>\n")
	}
	if data.Services != nil && len(data.Services.Services) > 0 {
		sb.WriteString("  <a href=\"#sec-services\">⚙ Dienste</a>\n")
	}
	if data.Events != nil && len(data.Events.Events) > 0 {
		sb.WriteString("  <a href=\"#sec-events\">📋 Ereignisse</a>\n")
	}
	if data.BrowserExt != nil && len(data.BrowserExt.Extensions) > 0 {
		sb.WriteString("  <a href=\"#sec-browserext\">🧩 Extensions</a>\n")
	}
	if len(data.Processes) > 0 {
		sb.WriteString("  <a href=\"#sec-processes\">🔄 Prozesse</a>\n")
	}
	if len(data.VTAuditLog) > 0 {
		sb.WriteString("  <a href=\"#sec-vtaudit\">🔬 VirusTotal</a>\n")
	}
	sb.WriteString("</nav>\n")

	// ── Übersichtskarten ─────────────────────────────────────────────────────
	sb.WriteString("<section class=\"overview\">\n")
	writeOverviewCards(sb, data)
	sb.WriteString("</section>\n")

	// ── System ───────────────────────────────────────────────────────────────
	if data.System != nil {
		sb.WriteString("<section id=\"sec-system\">\n<h2 class=\"sec-title\">⚙ System</h2>\n")
		writeSystemSection(sb, data.System)
		sb.WriteString("</section>\n")

		if len(data.System.Smart) > 0 {
			sb.WriteString("<section id=\"sec-smart\">\n<h2 class=\"sec-title\">💿 SMART-Status</h2>\n")
			writeSmartSection(sb, data.System.Smart)
			sb.WriteString("</section>\n")
		}

		sb.WriteString("<section id=\"sec-security\">\n<h2 class=\"sec-title\">🔒 Sicherheit & Benutzer</h2>\n")
		writeSecuritySection(sb, data.System)
		sb.WriteString("</section>\n")
	}

	// ── Netzwerk ─────────────────────────────────────────────────────────────
	if data.Network != nil {
		sb.WriteString("<section id=\"sec-network\">\n<h2 class=\"sec-title\">🌐 Netzwerk</h2>\n")
		writeNetworkSection(sb, data.Network, includePasswords)
		sb.WriteString("</section>\n")
	}

	// ── Software ─────────────────────────────────────────────────────────────
	if data.Software != nil {
		sb.WriteString("<section id=\"sec-software\">\n<h2 class=\"sec-title\">📦 Software</h2>\n")
		writeSoftwareSection(sb, data.Software)
		sb.WriteString("</section>\n")
	}

	// ── Drucker ──────────────────────────────────────────────────────────────
	if data.Printers != nil && len(data.Printers.Printers) > 0 {
		sb.WriteString("<section id=\"sec-printers\">\n<h2 class=\"sec-title\">🖨 Drucker</h2>\n")
		writePrintersSection(sb, data.Printers)
		sb.WriteString("</section>\n")
	}

	// ── Autostart ────────────────────────────────────────────────────────────
	if data.Autostart != nil && len(data.Autostart.Entries) > 0 {
		sb.WriteString("<section id=\"sec-autostart\">\n<h2 class=\"sec-title\">🚀 Autostart</h2>\n")
		writeAutostartSection(sb, data.Autostart)
		sb.WriteString("</section>\n")
	}

	// ── Dienste ──────────────────────────────────────────────────────────────
	if data.Services != nil && len(data.Services.Services) > 0 {
		sb.WriteString("<section id=\"sec-services\">\n<h2 class=\"sec-title\">⚙ Dienste</h2>\n")
		writeServicesSection(sb, data.Services)
		sb.WriteString("</section>\n")
	}

	// ── Ereignisse ───────────────────────────────────────────────────────────
	if data.Events != nil && len(data.Events.Events) > 0 {
		sb.WriteString("<section id=\"sec-events\">\n<h2 class=\"sec-title\">📋 Systemereignisse</h2>\n")
		writeEventsSection(sb, data.Events)
		sb.WriteString("</section>\n")
	}

	// ── Browser-Extensions ───────────────────────────────────────────────────
	if data.BrowserExt != nil && len(data.BrowserExt.Extensions) > 0 {
		sb.WriteString("<section id=\"sec-browserext\">\n<h2 class=\"sec-title\">🧩 Browser-Erweiterungen</h2>\n")
		writeBrowserExtSection(sb, data.BrowserExt)
		sb.WriteString("</section>\n")
	}

	// ── Prozesse ─────────────────────────────────────────────────────────────
	if len(data.Processes) > 0 {
		sb.WriteString("<section id=\"sec-processes\">\n<h2 class=\"sec-title\">🔄 Laufende Prozesse</h2>\n")
		writeProcessesSection(sb, data.Processes)
		sb.WriteString("</section>\n")
	}

	// ── VirusTotal Audit-Log ─────────────────────────────────────────────────
	if len(data.VTAuditLog) > 0 {
		sb.WriteString("<section id=\"sec-vtaudit\">\n<h2 class=\"sec-title\">🔬 VirusTotal-Ergebnisse</h2>\n")
		writeVTAuditSection(sb, data.VTAuditLog)
		sb.WriteString("</section>\n")
	}

	// ── Fußzeile ─────────────────────────────────────────────────────────────
	footerParts := []string{"Generiert von AdminKit"}
	if data.CompanyName != "" {
		footerParts = append(footerParts, h(data.CompanyName))
	}
	if data.TechnicianName != "" {
		footerParts = append(footerParts, "Techniker: "+h(data.TechnicianName))
	}
	footerParts = append(footerParts, h(data.GeneratedAt.Format("02.01.2006 15:04:05")))
	fmt.Fprintf(sb, "<footer>%s</footer>\n", strings.Join(footerParts, " • "))

	fmt.Fprintf(sb, "<script>%s</script>\n</body>\n</html>\n", reportJS)
	return sb.String()
}

// ─── Übersichtskarten ─────────────────────────────────────────────────────────

func writeOverviewCards(sb *strings.Builder, data *SessionExport) {
	type card struct{ icon, title, cls, detail, anchor string }
	var cards []card

	if data.System != nil {
		cpuName := "–"
		if data.System.Hardware.CPU.Name != "" {
			cpuName = data.System.Hardware.CPU.Name
		}
		cards = append(cards, card{"🖥", "Hardware", "ok", cpuName, "#sec-system"})

		osDetail := "–"
		if data.System.OS.Name != "" {
			osDetail = data.System.OS.Name + " " + data.System.OS.Version
		}
		cards = append(cards, card{"💻", "Betriebssystem", "ok", osDetail, "#sec-system"})

		if len(data.System.Smart) > 0 {
			cls := "ok"
			for _, d := range data.System.Smart {
				if d.Status == system.SmartCritical {
					cls = "error"
				} else if d.Status == system.SmartWarning && cls != "error" {
					cls = "warning"
				}
			}
			cards = append(cards, card{"💾", "SMART", cls,
				fmt.Sprintf("%d Disk(s)", len(data.System.Smart)), "#sec-smart"})
		}

		cards = append(cards, card{"🔒", "Sicherheit", "ok", "Benutzer & Firewall", "#sec-security"})
	}

	if data.Network != nil {
		connected := 0
		for _, a := range data.Network.Adapters {
			if a.IsConnected {
				connected++
			}
		}
		cls := "ok"
		if connected == 0 {
			cls = "warning"
		}
		cards = append(cards, card{"🌐", "Netzwerk", cls,
			fmt.Sprintf("%d/%d Adapter verbunden", connected, len(data.Network.Adapters)), "#sec-network"})
	}

	if data.Software != nil {
		cards = append(cards, card{"📦", "Software", "ok",
			fmt.Sprintf("%d Programme", len(data.Software.Programs)), "#sec-software"})
	}

	if data.Printers != nil && len(data.Printers.Printers) > 0 {
		networkCount := 0
		for _, p := range data.Printers.Printers {
			if p.IsNetwork {
				networkCount++
			}
		}
		detail := fmt.Sprintf("%d Drucker", len(data.Printers.Printers))
		if networkCount > 0 {
			detail += fmt.Sprintf(", %d Netzwerk", networkCount)
		}
		cards = append(cards, card{"🖨", "Drucker", "ok", detail, "#sec-printers"})
	}

	if data.Autostart != nil {
		thirdParty := 0
		for _, e := range data.Autostart.Entries {
			if !e.IsSystem {
				thirdParty++
			}
		}
		cls := "ok"
		if thirdParty > 0 {
			cls = "warning"
		}
		cards = append(cards, card{"🚀", "Autostart", cls,
			fmt.Sprintf("%d Einträge (%d Drittanbieter)", len(data.Autostart.Entries), thirdParty), "#sec-autostart"})
	}

	if data.Events != nil && len(data.Events.Events) > 0 {
		critical := 0
		for _, e := range data.Events.Events {
			if e.Level == events.LevelCritical {
				critical++
			}
		}
		cls := "warning"
		if critical > 0 {
			cls = "error"
		}
		cards = append(cards, card{"📋", "Ereignisse", cls,
			fmt.Sprintf("%d kritische Ereignisse (%d Tage)", len(data.Events.Events), data.Events.DaysBack), "#sec-events"})
	}

	for _, c := range cards {
		fmt.Fprintf(sb, "<a class=\"card card-%s\" href=\"%s\">"+
			"<div class=\"card-icon\">%s</div>"+
			"<div><div class=\"card-title\">%s</div><div class=\"card-detail\">%s</div></div>"+
			"</a>\n",
			c.cls, c.anchor, c.icon, c.title, h(c.detail))
	}
}

// ─── System ───────────────────────────────────────────────────────────────────

func writeSystemSection(sb *strings.Builder, r *system.ScanResult) {
	// Hardware
	sb.WriteString("<h3 class=\"sub-title\">Hardware</h3>\n<table class=\"info-table\"><tbody>\n")
	hw := r.Hardware
	row(sb, "CPU", hw.CPU.Name)
	if hw.CPU.Cores > 0 {
		row(sb, "Kerne / Threads", fmt.Sprintf("%d / %d", hw.CPU.Cores, hw.CPU.Threads))
	}
	if hw.CPU.SpeedMHz > 0 {
		row(sb, "Takt", fmt.Sprintf("%.1f GHz", float64(hw.CPU.SpeedMHz)/1000))
	}
	row(sb, "Architektur", hw.CPU.Architecture)
	if hw.TotalRAMGB > 0 {
		row(sb, "RAM gesamt", fmt.Sprintf("%.0f GB", hw.TotalRAMGB))
	}
	if hw.Motherboard.Manufacturer != "" {
		row(sb, "Mainboard", hw.Motherboard.Manufacturer+" "+hw.Motherboard.Product)
		row(sb, "Mainboard S/N", hw.Motherboard.SerialNumber)
	}
	for i, g := range hw.GPUs {
		vram := ""
		if g.VRAMGB > 0 {
			vram = fmt.Sprintf(" (%.0f GB VRAM)", g.VRAMGB)
		}
		row(sb, fmt.Sprintf("GPU %d", i+1), g.Name+vram)
	}
	for i, d := range hw.Disks {
		row(sb, fmt.Sprintf("Disk %d", i+1),
			fmt.Sprintf("%s — %.0f GB %s (%s)", d.Model, d.SizeGB, d.MediaType, d.InterfaceType))
	}
	sb.WriteString("</tbody></table>\n")

	// Betriebssystem
	sb.WriteString("<h3 class=\"sub-title\">Betriebssystem</h3>\n<table class=\"info-table\"><tbody>\n")
	os := r.OS
	row(sb, "Name", os.Name)
	row(sb, "Version", os.Version)
	row(sb, "Build", os.Build)
	row(sb, "Architektur", os.Architecture)
	row(sb, "Installiert", fmtDate(os.InstallDate))
	row(sb, "Letzter Neustart", fmtDate(os.LastBootTime))
	if !os.LastBootTime.IsZero() {
		row(sb, "Uptime", fmtUptime(os.LastBootTime))
	}
	row(sb, "Lizenzstatus", os.LicenseStatus)
	row(sb, "Seriennummer", os.SerialNumber)
	if !os.LastUpdateDate.IsZero() {
		row(sb, "Letztes Update", fmtDate(os.LastUpdateDate))
	}
	if os.PendingUpdates >= 0 {
		row(sb, "Ausstehende Updates", fmt.Sprintf("%d", os.PendingUpdates))
	}
	sb.WriteString("</tbody></table>\n")
}

// ─── SMART ────────────────────────────────────────────────────────────────────

func writeSmartSection(sb *strings.Builder, disks []system.DiskSmart) {
	icons := map[system.SmartStatus]string{
		system.SmartOK: "🟢", system.SmartWarning: "🟡",
		system.SmartCritical: "🔴", system.SmartUnknown: "⚪",
	}
	classes := map[system.SmartStatus]string{
		system.SmartOK: "ok", system.SmartWarning: "warning",
		system.SmartCritical: "error", system.SmartUnknown: "unknown",
	}

	for _, d := range disks {
		icon := icons[d.Status]
		cls := classes[d.Status]
		if icon == "" {
			icon = "⚪"
			cls = "unknown"
		}
		fmt.Fprintf(sb, "<div class=\"smart-card smart-%s\">\n"+
			"<div class=\"smart-title\">%s %s</div>\n"+
			"<table class=\"info-table\"><tbody>\n",
			cls, icon, h(d.Model))
		row(sb, "Status", string(d.Status))
		row(sb, "Seriennummer", d.SerialNumber)
		if d.TemperatureC > 0 {
			row(sb, "Temperatur", fmt.Sprintf("%d °C", d.TemperatureC))
		}
		if d.PowerOnHours > 0 {
			row(sb, "Betriebsstunden",
				fmt.Sprintf("%d h (%d Tage)", d.PowerOnHours, d.PowerOnHours/24))
		}
		row(sb, "Reallocated Sectors", fmt.Sprintf("%d", d.ReallocatedSectors))
		if d.LifeLeftPercent >= 0 {
			row(sb, "SSD-Restlebensdauer", fmt.Sprintf("%d%%", d.LifeLeftPercent))
		}
		sb.WriteString("</tbody></table></div>\n")
	}
}

// ─── Sicherheit & Benutzer ────────────────────────────────────────────────────

func writeSecuritySection(sb *strings.Builder, r *system.ScanResult) {
	sec := r.Security
	sb.WriteString("<h3 class=\"sub-title\">Sicherheit</h3>\n<table class=\"info-table\"><tbody>\n")

	fw := "❌ Deaktiviert"
	if sec.FirewallEnabled {
		fw = "✅ Aktiviert"
	}
	row(sb, "Firewall", fw)

	def := "❌ Deaktiviert"
	if sec.DefenderEnabled {
		def = "✅ Aktiviert"
		if !sec.DefenderSignatureDate.IsZero() {
			def += " (Signaturen: " + fmtDate(sec.DefenderSignatureDate) + ")"
		}
	}
	row(sb, "Defender / AV", def)

	for _, v := range sec.BitLockerVolumes {
		status := v.Status
		if v.Encrypted {
			status = "🔒 Verschlüsselt — " + status
		} else {
			status = "🔓 Unverschlüsselt — " + status
		}
		row(sb, "BitLocker "+v.Drive, status)
	}

	// RDP
	rdpStatus := "❌ Deaktiviert"
	if sec.RDPEnabled {
		rdpStatus = fmt.Sprintf("✅ Aktiviert (Port %d", sec.RDPPort)
		if sec.NLAEnabled {
			rdpStatus += ", NLA aktiv"
		}
		rdpStatus += ")"
	}
	row(sb, "Remote Desktop (RDP)", rdpStatus)

	sb.WriteString("</tbody></table>\n")

	// Lokale Freigaben
	if len(sec.LocalShares) > 0 {
		sb.WriteString("<h3 class=\"sub-title\">Lokale Netzwerkfreigaben</h3>\n" +
			"<table class=\"info-table data-table\"><thead><tr>" +
			"<th>Name</th><th>Pfad</th><th>Beschreibung</th><th>Typ</th>" +
			"</tr></thead><tbody>\n")
		for _, s := range sec.LocalShares {
			typ := "Freigabe"
			if s.IsSystem {
				typ = "System"
			}
			fmt.Fprintf(sb, "<tr><td><strong>%s</strong></td><td><code>%s</code></td><td>%s</td><td>%s</td></tr>\n",
				h(s.Name), h(s.Path), h(s.Description), typ)
		}
		sb.WriteString("</tbody></table>\n")
	}

	if len(r.Users) > 0 {
		sb.WriteString("<h3 class=\"sub-title\">Lokale Benutzer</h3>\n" +
			"<table class=\"info-table data-table\">\n" +
			"<thead><tr><th>Benutzername</th><th>Vollständiger Name</th><th>Admin</th><th>Aktiv</th></tr></thead>\n" +
			"<tbody>\n")
		for _, u := range r.Users {
			admin := "–"
			if u.IsAdmin {
				admin = "✅"
			}
			active := "–"
			if u.IsEnabled {
				active = "✅"
			}
			fmt.Fprintf(sb, "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>\n",
				h(u.Name), h(u.FullName), admin, active)
		}
		sb.WriteString("</tbody></table>\n")
	}
}

// ─── Netzwerk ─────────────────────────────────────────────────────────────────

func writeNetworkSection(sb *strings.Builder, r *network.ScanResult, includePasswords bool) {
	if len(r.Adapters) > 0 {
		sb.WriteString("<h3 class=\"sub-title\">Netzwerkadapter</h3>\n")
		for _, a := range r.Adapters {
			connIcon := "⚫"
			if a.IsConnected {
				connIcon = "🟢"
			} else if a.IsEnabled {
				connIcon = "🟡"
			}
			fmt.Fprintf(sb, "<div class=\"adapter-card\">\n<div class=\"adapter-title\">%s %s</div>\n"+
				"<table class=\"info-table\"><tbody>\n", connIcon, h(a.Name))
			row(sb, "Typ", string(a.Type))
			row(sb, "MAC", a.MACAddress)
			if len(a.IPv4) > 0 {
				row(sb, "IPv4", strings.Join(a.IPv4, ", "))
			}
			if a.Gateway != "" {
				row(sb, "Gateway", a.Gateway)
			}
			if len(a.DNSServers) > 0 {
				row(sb, "DNS", strings.Join(a.DNSServers, ", "))
			}
			if a.Speed != "" {
				row(sb, "Geschwindigkeit", a.Speed)
			}
			sb.WriteString("</tbody></table></div>\n")
		}
	}

	if len(r.Shares) > 0 {
		sb.WriteString("<h3 class=\"sub-title\">Netzlaufwerke</h3>\n" +
			"<table class=\"info-table data-table\">\n" +
			"<thead><tr><th>Laufwerk</th><th>Netzwerkpfad</th><th>Status</th></tr></thead>\n<tbody>\n")
		for _, s := range r.Shares {
			status := "🔴 Getrennt"
			if s.Status == "Connected" {
				status = "🟢 Verbunden"
			}
			fmt.Fprintf(sb, "<tr><td>%s</td><td><code>%s</code></td><td>%s</td></tr>\n",
				h(s.DriveLetter), h(s.UNCPath), status)
		}
		sb.WriteString("</tbody></table>\n")
	}

	if len(r.WiFi) > 0 {
		sb.WriteString("<h3 class=\"sub-title\">WiFi-Profile</h3>\n" +
			"<table class=\"info-table data-table\">\n" +
			"<thead><tr><th>SSID</th><th>Sicherheit</th><th>Verbunden</th><th>Passwort</th></tr></thead>\n<tbody>\n")
		for _, w := range r.WiFi {
			conn := "–"
			if w.IsConnected {
				conn = "✅ Aktiv"
			}
			pw := "–"
			if w.HasPassword {
				if includePasswords && w.Password != "" {
					pw = "<code>" + h(w.Password) + "</code>"
				} else {
					pw = "••••••••"
				}
			}
			fmt.Fprintf(sb, "<tr><td><strong>%s</strong></td><td>%s</td><td>%s</td><td>%s</td></tr>\n",
				h(w.SSID), h(string(w.Security)), conn, pw)
		}
		sb.WriteString("</tbody></table>\n")
	}
}

// ─── Software ─────────────────────────────────────────────────────────────────

func writeSoftwareSection(sb *strings.Builder, r *software.ScanResult) {
	if len(r.Browsers) > 0 || len(r.Runtimes) > 0 {
		sb.WriteString("<h3 class=\"sub-title\">Laufzeiten & Browser</h3>\n" +
			"<table class=\"info-table data-table\">\n" +
			"<thead><tr><th>Name</th><th>Version</th><th>Typ</th></tr></thead>\n<tbody>\n")
		for _, b := range r.Browsers {
			star := ""
			if b.IsDefault {
				star = " ★"
			}
			fmt.Fprintf(sb, "<tr><td>%s%s</td><td><code>%s</code></td><td>Browser</td></tr>\n",
				h(b.Name), star, h(b.Version))
		}
		for _, rt := range r.Runtimes {
			fmt.Fprintf(sb, "<tr><td>%s</td><td><code>%s</code></td><td>%s</td></tr>\n",
				h(rt.Name), h(rt.Version), h(string(rt.Type)))
		}
		sb.WriteString("</tbody></table>\n")
	}

	if len(r.Programs) > 0 {
		fmt.Fprintf(sb,
			"<h3 class=\"sub-title\">Installierte Programme <span class=\"count\">(%d)</span></h3>\n"+
				"<div class=\"search-bar\">"+
				"<input type=\"search\" id=\"sw-search\" placeholder=\"Name oder Hersteller suchen…\" oninput=\"filterSW(this.value)\">"+
				"</div>\n"+
				"<table class=\"info-table data-table\" id=\"sw-table\">\n"+
				"<thead><tr>"+
				"<th class=\"sortable\" onclick=\"sortSW(0)\">Name</th>"+
				"<th class=\"sortable\" onclick=\"sortSW(1)\">Version</th>"+
				"<th class=\"sortable\" onclick=\"sortSW(2)\">Hersteller</th>"+
				"<th class=\"sortable\" onclick=\"sortSW(3)\">Installiert</th>"+
				"<th class=\"sortable\" onclick=\"sortSW(4)\">Größe</th>"+
				"</tr></thead>\n<tbody id=\"sw-tbody\">\n",
			len(r.Programs))

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
			fmt.Fprintf(sb, "<tr><td>%s</td><td><code>%s</code></td><td>%s</td><td>%s</td><td class=\"num\">%s</td></tr>\n",
				h(p.Name), h(p.Version), h(p.Publisher), date, size)
		}
		sb.WriteString("</tbody></table>\n")
	}
}

// ─── Drucker ──────────────────────────────────────────────────────────────────

func writePrintersSection(sb *strings.Builder, r *printers.ScanResult) {
	sb.WriteString("<table class=\"info-table data-table\">\n" +
		"<thead><tr>" +
		"<th>Name</th><th>Treiber</th><th>Port</th><th>Status</th><th>Typ</th><th>Freigabe</th>" +
		"</tr></thead>\n<tbody>\n")

	for _, p := range r.Printers {
		nameCell := h(p.Name)
		if p.IsDefault {
			nameCell = "<strong>" + nameCell + "</strong> ⭐"
		}
		netCell := "🖥 Lokal"
		if p.IsNetwork {
			if p.IPAddress != "" {
				netCell = "🌐 Netzwerk (" + h(p.IPAddress) + ")"
			} else {
				netCell = "🌐 Netzwerk"
			}
		}
		share := "–"
		if p.IsShared {
			share = "✅"
			if p.ShareName != "" {
				share = "✅ " + h(p.ShareName)
			}
		}
		statusIcon := map[printers.PrinterStatus]string{
			printers.StatusReady:    "🟢",
			printers.StatusPrinting: "🔵",
			printers.StatusOffline:  "🔴",
			printers.StatusError:    "🔴",
			printers.StatusPaused:   "🟡",
			printers.StatusUnknown:  "⚪",
		}[p.Status]
		if statusIcon == "" {
			statusIcon = "⚪"
		}
		fmt.Fprintf(sb, "<tr><td>%s</td><td><code>%s</code></td><td><code>%s</code></td><td>%s %s</td><td>%s</td><td>%s</td></tr>\n",
			nameCell,
			h(p.Driver),
			h(p.Port),
			statusIcon, h(string(p.Status)),
			netCell,
			share,
		)
	}
	sb.WriteString("</tbody></table>\n")

	if len(r.Errors) > 0 {
		sb.WriteString("<p class=\"scan-warn\">⚠ Scan-Warnungen: ")
		for i, e := range r.Errors {
			if i > 0 {
				sb.WriteString(" · ")
			}
			fmt.Fprintf(sb, "[%s] %s", h(e.Module), h(e.Message))
		}
		sb.WriteString("</p>\n")
	}
}

// ─── Autostart ────────────────────────────────────────────────────────────────

func writeAutostartSection(sb *strings.Builder, r *autostart.ScanResult) {
	// Drittanbieter zuerst, dann System
	thirdParty := []autostart.Entry{}
	system := []autostart.Entry{}
	for _, e := range r.Entries {
		if e.IsSystem {
			system = append(system, e)
		} else {
			thirdParty = append(thirdParty, e)
		}
	}

	writeAutostartTable(sb, thirdParty, "⚠ Drittanbieter-Einträge", "smart-warning")
	writeAutostartTable(sb, system, "✓ System-Einträge", "")
}

func writeAutostartTable(sb *strings.Builder, entries []autostart.Entry, title, cls string) {
	if len(entries) == 0 {
		return
	}
	if cls != "" {
		fmt.Fprintf(sb, "<div class=\"smart-card %s\">\n<div class=\"smart-title\">%s (%d)</div>\n", cls, h(title), len(entries))
	} else {
		fmt.Fprintf(sb, "<h3 class=\"sub-title\">%s (%d)</h3>\n", h(title), len(entries))
	}
	sb.WriteString("<table class=\"info-table data-table\"><thead><tr>" +
		"<th>Name</th><th>Quelle</th><th>Pfad</th><th>Aktiv</th>" +
		"</tr></thead><tbody>\n")
	for _, e := range entries {
		active := "✅"
		if !e.IsEnabled {
			active = "–"
		}
		fmt.Fprintf(sb, "<tr><td><strong>%s</strong></td><td>%s</td><td><code>%s</code></td><td>%s</td></tr>\n",
			h(e.Name), h(string(e.Location)), h(e.Path), active)
	}
	sb.WriteString("</tbody></table>\n")
	if cls != "" {
		sb.WriteString("</div>\n")
	}
}

// ─── Dienste ──────────────────────────────────────────────────────────────────

func writeServicesSection(sb *strings.Builder, r *services.ScanResult) {
	autoThird := []services.ServiceInfo{}
	autoSys := []services.ServiceInfo{}
	for _, s := range r.Services {
		if s.StartType != services.StartAuto {
			continue
		}
		if s.IsSystem {
			autoSys = append(autoSys, s)
		} else {
			autoThird = append(autoThird, s)
		}
	}

	running := r.Services
	totalRunning := 0
	for _, s := range running {
		if s.State == services.StateRunning {
			totalRunning++
		}
	}

	fmt.Fprintf(sb, "<p style=\"color:var(--muted);font-size:12px;margin-bottom:12px\">"+
		"%d Dienste gesamt · %d laufen · %d Drittanbieter-Autostart</p>",
		len(r.Services), totalRunning, len(autoThird))

	if len(autoThird) > 0 {
		sb.WriteString("<div class=\"smart-card smart-warning\">\n<div class=\"smart-title\">⚠ Drittanbieter – Automatisch</div>\n")
		writeServicesTable(sb, autoThird)
		sb.WriteString("</div>\n")
	}
	if len(autoSys) > 0 {
		sb.WriteString("<h3 class=\"sub-title\">System – Automatisch</h3>\n")
		writeServicesTable(sb, autoSys)
	}
}

func writeServicesTable(sb *strings.Builder, list []services.ServiceInfo) {
	sb.WriteString("<table class=\"info-table data-table\"><thead><tr>" +
		"<th>Anzeigename</th><th>Dienstname</th><th>Status</th>" +
		"</tr></thead><tbody>\n")
	icons := map[services.ServiceState]string{
		services.StateRunning: "🟢", services.StateStopped: "🔴",
		services.StatePaused: "🟡", services.StateUnknown: "⚪",
	}
	for _, s := range list {
		icon := icons[s.State]
		if icon == "" {
			icon = "⚪"
		}
		fmt.Fprintf(sb, "<tr><td><strong>%s</strong></td><td><code>%s</code></td><td>%s %s</td></tr>\n",
			h(s.DisplayName), h(s.Name), icon, h(string(s.State)))
	}
	sb.WriteString("</tbody></table>\n")
}

// ─── Ereignisse ───────────────────────────────────────────────────────────────

func writeEventsSection(sb *strings.Builder, r *events.ScanResult) {
	fmt.Fprintf(sb, "<p style=\"color:var(--muted);font-size:12px;margin-bottom:12px\">"+
		"%d kritische Ereignisse der letzten %d Tage</p>", len(r.Events), r.DaysBack)

	sb.WriteString("<table class=\"info-table data-table\"><thead><tr>" +
		"<th>Zeit</th><th>Level</th><th>Quelle</th><th>Event-ID</th><th>Meldung</th>" +
		"</tr></thead><tbody>\n")

	levelIcon := map[events.Level]string{
		events.LevelCritical: "🔴", events.LevelError: "🟠", events.LevelWarning: "🟡",
	}
	for _, e := range r.Events {
		icon := levelIcon[e.Level]
		if icon == "" {
			icon = "⚪"
		}
		t := "–"
		if !e.Time.IsZero() {
			t = e.Time.Format("02.01.2006 15:04")
		}
		fmt.Fprintf(sb, "<tr><td style=\"white-space:nowrap\">%s</td><td>%s %s</td><td>%s</td><td>%d</td><td>%s</td></tr>\n",
			t, icon, h(string(e.Level)), h(e.Source), e.EventID, h(e.Message))
	}
	sb.WriteString("</tbody></table>\n")
}

// ─── Hilfs-Funktionen ─────────────────────────────────────────────────────────

// row schreibt eine th/td-Tabellenzeile; leere Werte werden übersprungen.
func row(sb *strings.Builder, key, value string) {
	if value == "" {
		return
	}
	fmt.Fprintf(sb, "<tr><th>%s</th><td>%s</td></tr>\n", h(key), h(value))
}

func fmtDate(t time.Time) string {
	if t.IsZero() || t.Year() < 2000 {
		return "–"
	}
	return t.Format("02.01.2006")
}

func fmtUptime(boot time.Time) string {
	d := time.Since(boot)
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	mins := int(d.Minutes()) % 60
	if days > 0 {
		return fmt.Sprintf("%d Tag(e), %d Std., %d Min.", days, hours, mins)
	}
	return fmt.Sprintf("%d Std., %d Min.", hours, mins)
}

func writeBrowserExtSection(sb *strings.Builder, r *browserext.ScanResult) {
	sb.WriteString("<table class=\"data-table\">\n<thead><tr><th>Browser</th><th>Name</th><th>Version</th><th>ID</th><th>Status</th></tr></thead>\n<tbody>\n")
	for _, e := range r.Extensions {
		status := "Aktiv"
		if !e.Enabled {
			status = "Deaktiviert"
		}
		fmt.Fprintf(sb, "<tr><td>%s</td><td>%s</td><td>%s</td><td class=\"mono\">%s</td><td>%s</td></tr>\n",
			h(e.Browser), h(e.Name), h(e.Version), h(e.ID), h(status))
	}
	sb.WriteString("</tbody></table>\n")
	fmt.Fprintf(sb, "<p class=\"section-meta\">%d Erweiterungen</p>\n", len(r.Extensions))
}

func writeProcessesSection(sb *strings.Builder, procs []system.RunningProcess) {
	sb.WriteString("<table class=\"data-table\">\n<thead><tr><th>PID</th><th>Name</th><th>Benutzer</th><th>CPU%</th><th>RAM (MB)</th><th>Pfad</th></tr></thead>\n<tbody>\n")
	for _, p := range procs {
		cls := ""
		if p.CPUPct > 20 || p.MemoryMB > 500 {
			cls = " class=\"row-warn\""
		}
		fmt.Fprintf(sb, "<tr%s><td>%d</td><td>%s</td><td>%s</td><td>%.1f</td><td>%.0f</td><td class=\"mono\" style=\"font-size:11px\">%s</td></tr>\n",
			cls, p.PID, h(p.Name), h(p.User), p.CPUPct, p.MemoryMB, h(p.Path))
	}
	sb.WriteString("</tbody></table>\n")
	fmt.Fprintf(sb, "<p class=\"section-meta\">%d Prozesse</p>\n", len(procs))
}

func writeVTAuditSection(sb *strings.Builder, entries []VTAuditEntry) {
	statusColors := map[string]string{
		"malicious":  "#dc2626", "suspicious": "#ca8a04",
		"clean":      "#16a34a", "not_found":  "#64748b",
	}
	sb.WriteString("<table class=\"data-table\">\n<thead><tr><th>Status</th><th>Name</th><th>Typ</th><th>Erkennungen</th><th>SHA256</th><th>Geprüft</th></tr></thead>\n<tbody>\n")
	for _, e := range entries {
		color := statusColors[e.Status]
		detect := "–"
		if e.Engines > 0 {
			detect = fmt.Sprintf("%d / %d", e.Detections, e.Engines)
		}
		fmt.Fprintf(sb, "<tr><td><strong style=\"color:%s\">%s</strong></td><td>%s</td><td>%s</td><td>%s</td><td class=\"mono\" style=\"font-size:10px\">%s</td><td>%s</td></tr>\n",
			color, h(e.Status), h(e.Name), h(e.ItemType), detect,
			h(e.SHA256), h(e.CheckedAt))
	}
	sb.WriteString("</tbody></table>\n")
	malCount := 0
	for _, e := range entries {
		if e.Status == "malicious" || e.Status == "suspicious" {
			malCount++
		}
	}
	if malCount > 0 {
		fmt.Fprintf(sb, "<p class=\"section-meta\" style=\"color:#dc2626\">⚠ %d auffällige Einträge gefunden!</p>\n", malCount)
	} else {
		fmt.Fprintf(sb, "<p class=\"section-meta\">%d Einträge geprüft — keine Bedrohungen erkannt.</p>\n", len(entries))
	}
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const reportCSS = `
:root{--bg:#fff;--surface:#f8fafc;--border:#e2e8f0;--text:#1e293b;--muted:#64748b;
--primary:#2563eb;--ok:#16a34a;--warn:#ca8a04;--err:#dc2626;--mono:'Consolas','SF Mono',monospace}
@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--surface:#1e293b;--border:#334155;
--text:#f1f5f9;--muted:#94a3b8;--primary:#3b82f6;--ok:#22c55e;--warn:#eab308;--err:#ef4444}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;background:var(--bg);
color:var(--text);padding:0;line-height:1.5}
header{display:flex;align-items:center;gap:16px;padding:20px 32px;
background:var(--surface);border-bottom:2px solid var(--primary);print-color-adjust:exact}
.hdr-actions{margin-left:auto}
.print-btn{padding:7px 14px;background:var(--primary);color:#fff;border:none;border-radius:6px;
font-size:13px;cursor:pointer;font-weight:500}
.print-btn:hover{opacity:.85}
.scan-warn{font-size:12px;color:var(--warn);margin-top:8px}
.hdr-logo{font-size:22px;font-weight:700;color:var(--primary)}
.hdr-logo-img{max-height:48px;max-width:160px;object-fit:contain}
.hdr-company{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.hdr-title{font-size:18px;font-weight:600}
.hdr-meta{display:flex;gap:16px;font-size:12px;color:var(--muted);margin-top:4px}
nav.report-nav{display:flex;gap:0;background:var(--surface);border-bottom:1px solid var(--border);
padding:0 32px;overflow-x:auto}
nav.report-nav a{display:inline-block;padding:10px 16px;font-size:13px;font-weight:500;
color:var(--muted);text-decoration:none;border-bottom:2px solid transparent;
transition:color .15s,border-color .15s;white-space:nowrap}
nav.report-nav a:hover{color:var(--primary);border-bottom-color:var(--primary)}
section{padding:24px 32px;border-bottom:1px solid var(--border)}
.sec-title{font-size:16px;font-weight:700;margin-bottom:16px;color:var(--primary)}
.sub-title{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;
color:var(--muted);margin:16px 0 8px}
.overview{display:flex;flex-wrap:wrap;gap:12px;padding:20px 32px;
background:var(--surface);border-bottom:1px solid var(--border)}
.card{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;
border:1px solid var(--border);min-width:180px;background:var(--bg);
text-decoration:none;color:inherit;transition:box-shadow .15s,transform .1s;cursor:pointer}
.card:hover{box-shadow:0 2px 8px rgba(0,0,0,.12);transform:translateY(-1px)}
.card-ok{border-left:4px solid var(--ok)}.card-warning{border-left:4px solid var(--warn)}
.card-error{border-left:4px solid var(--err)}.card-unknown{border-left:4px solid var(--muted)}
.card-icon{font-size:24px}.card-title{font-weight:600;font-size:13px}
.card-detail{font-size:12px;color:var(--muted)}
.info-table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px}
.info-table th{text-align:left;padding:5px 12px;font-weight:500;color:var(--muted);
width:180px;white-space:nowrap}
.info-table td{padding:5px 12px}
.data-table thead th{background:var(--surface);font-weight:600;border-bottom:2px solid var(--border);
cursor:pointer}
.data-table tbody tr:nth-child(even){background:var(--surface)}
.data-table tbody tr:hover{background:rgba(37,99,235,.07)}
.info-table tr{border-bottom:1px solid var(--border)}
.sortable:hover{color:var(--primary)}
.num{text-align:right}
code{font-family:var(--mono);font-size:12px;background:var(--surface);
padding:1px 5px;border-radius:3px;border:1px solid var(--border)}
.smart-card,.adapter-card{border:1px solid var(--border);border-radius:8px;padding:12px 16px;
margin-bottom:12px}
.smart-ok{border-left:4px solid var(--ok)}.smart-warning{border-left:4px solid var(--warn)}
.smart-error{border-left:4px solid var(--err)}.smart-unknown{border-left:4px solid var(--muted)}
.smart-title,.adapter-title{font-weight:600;margin-bottom:8px}
.search-bar{margin-bottom:8px}
.search-bar input{padding:6px 12px;border:1px solid var(--border);border-radius:6px;
font-size:13px;width:300px;background:var(--bg);color:var(--text)}
.count{color:var(--muted);font-weight:400}
footer{text-align:center;padding:16px;font-size:11px;color:var(--muted);
background:var(--surface);border-top:1px solid var(--border)}
@media print{
  .search-bar,.print-btn{display:none}
  .info-table tbody tr:nth-child(even){background:#f8fafc!important}
  section{break-inside:avoid}
  header{background:#f8fafc!important}
}
`

// ─── JavaScript ──────────────────────────────────────────────────────────────

const reportJS = `
function filterSW(q){
  var rows=document.querySelectorAll('#sw-tbody tr'),s=q.toLowerCase();
  rows.forEach(function(r){
    var t=r.textContent.toLowerCase();
    r.style.display=t.includes(s)?'':'none';
  });
}
var _sortDir=1,_sortCol=-1;
function sortSW(col){
  var tbody=document.getElementById('sw-tbody');
  if(!tbody)return;
  var rows=Array.from(tbody.querySelectorAll('tr'));
  _sortDir=(_sortCol===col)?-_sortDir:1;
  _sortCol=col;
  rows.sort(function(a,b){
    var av=a.cells[col]?a.cells[col].textContent.trim():'';
    var bv=b.cells[col]?b.cells[col].textContent.trim():'';
    return av.localeCompare(bv,'de',{numeric:true})*_sortDir;
  });
  rows.forEach(function(r){tbody.appendChild(r);});
}
`
