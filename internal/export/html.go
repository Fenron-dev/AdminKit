package export

import (
	"fmt"
	"html"
	"strings"
	"time"

	"adminkit/internal/network"
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

	fmt.Fprintf(sb, "<!DOCTYPE html>\n<html lang=\"de\">\n<head>\n"+
		"<meta charset=\"UTF-8\">\n"+
		"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"+
		"<title>AdminKit – %s</title>\n<style>%s</style>\n</head>\n<body>\n",
		h(data.SessionName), reportCSS)

	// ── Kopfzeile ────────────────────────────────────────────────────────────
	fmt.Fprintf(sb,
		"<header>\n"+
			"  <div class=\"hdr-logo\">🛠 AdminKit</div>\n"+
			"  <div class=\"hdr-body\">\n"+
			"    <div class=\"hdr-title\">Systembericht – %s</div>\n"+
			"    <div class=\"hdr-meta\">\n"+
			"      <span>Hostname: <strong>%s</strong></span>\n"+
			"      <span>Erstellt: <strong>%s</strong></span>\n"+
			"    </div>\n"+
			"  </div>\n"+
			"</header>\n",
		h(data.SessionName), h(hostname),
		h(data.GeneratedAt.Format("02.01.2006 15:04:05")))

	// ── Übersichtskarten ─────────────────────────────────────────────────────
	sb.WriteString("<section class=\"overview\">\n")
	writeOverviewCards(sb, data)
	sb.WriteString("</section>\n")

	// ── System ───────────────────────────────────────────────────────────────
	if data.System != nil {
		sb.WriteString("<section>\n<h2 class=\"sec-title\">⚙ System</h2>\n")
		writeSystemSection(sb, data.System)
		sb.WriteString("</section>\n")

		if len(data.System.Smart) > 0 {
			sb.WriteString("<section>\n<h2 class=\"sec-title\">💿 SMART-Status</h2>\n")
			writeSmartSection(sb, data.System.Smart)
			sb.WriteString("</section>\n")
		}

		sb.WriteString("<section>\n<h2 class=\"sec-title\">🔒 Sicherheit & Benutzer</h2>\n")
		writeSecuritySection(sb, data.System)
		sb.WriteString("</section>\n")
	}

	// ── Netzwerk ─────────────────────────────────────────────────────────────
	if data.Network != nil {
		sb.WriteString("<section>\n<h2 class=\"sec-title\">🌐 Netzwerk</h2>\n")
		writeNetworkSection(sb, data.Network, includePasswords)
		sb.WriteString("</section>\n")
	}

	// ── Software ─────────────────────────────────────────────────────────────
	if data.Software != nil {
		sb.WriteString("<section>\n<h2 class=\"sec-title\">📦 Software</h2>\n")
		writeSoftwareSection(sb, data.Software)
		sb.WriteString("</section>\n")
	}

	// ── Fußzeile ─────────────────────────────────────────────────────────────
	fmt.Fprintf(sb, "<footer>Generiert von AdminKit • %s</footer>\n",
		h(data.GeneratedAt.Format("02.01.2006 15:04:05")))

	fmt.Fprintf(sb, "<script>%s</script>\n</body>\n</html>\n", reportJS)
	return sb.String()
}

// ─── Übersichtskarten ─────────────────────────────────────────────────────────

func writeOverviewCards(sb *strings.Builder, data *SessionExport) {
	type card struct{ icon, title, cls, detail string }
	var cards []card

	if data.System != nil {
		cpuName := "–"
		if data.System.Hardware.CPU.Name != "" {
			cpuName = data.System.Hardware.CPU.Name
		}
		cards = append(cards, card{"🖥", "Hardware", "ok", cpuName})

		osDetail := "–"
		if data.System.OS.Name != "" {
			osDetail = data.System.OS.Name + " " + data.System.OS.Version
		}
		cards = append(cards, card{"💻", "Betriebssystem", "ok", osDetail})

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
				fmt.Sprintf("%d Disk(s)", len(data.System.Smart))})
		}
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
			fmt.Sprintf("%d/%d Adapter verbunden", connected, len(data.Network.Adapters))})
	}

	if data.Software != nil {
		cards = append(cards, card{"📦", "Software", "ok",
			fmt.Sprintf("%d Programme", len(data.Software.Programs))})
	}

	for _, c := range cards {
		fmt.Fprintf(sb, "<div class=\"card card-%s\"><div class=\"card-icon\">%s</div>"+
			"<div><div class=\"card-title\">%s</div><div class=\"card-detail\">%s</div></div></div>\n",
			c.cls, c.icon, c.title, h(c.detail))
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
	sb.WriteString("</tbody></table>\n")

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
.hdr-logo{font-size:22px;font-weight:700;color:var(--primary)}
.hdr-title{font-size:18px;font-weight:600}
.hdr-meta{display:flex;gap:16px;font-size:12px;color:var(--muted);margin-top:4px}
section{padding:24px 32px;border-bottom:1px solid var(--border)}
.sec-title{font-size:16px;font-weight:700;margin-bottom:16px;color:var(--primary)}
.sub-title{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;
color:var(--muted);margin:16px 0 8px}
.overview{display:flex;flex-wrap:wrap;gap:12px;padding:20px 32px;
background:var(--surface);border-bottom:1px solid var(--border)}
.card{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;
border:1px solid var(--border);min-width:180px;background:var(--bg)}
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
  .search-bar{display:none}
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
