package export

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"adminkit/internal/fleet"
)

// FleetReport bündelt Branding-Infos für den kombinierten Fleet-Bericht.
type FleetReport struct {
	GeneratedAt    time.Time
	CompanyName    string
	TechnicianName string
	LogoBase64     string
	Overview       fleet.Overview
}

// fleetStatusMeta liefert Symbol, Label und Farbe je Geräte-Status.
func fleetStatusMeta(status string) (icon, label, color string) {
	switch status {
	case fleet.StatusOK:
		return "●", "OK", "#16A34A"
	case fleet.StatusWarn:
		return "●", "Warnung", "#D97706"
	case fleet.StatusCritical:
		return "●", "Kritisch", "#DC2626"
	case fleet.StatusStale:
		return "●", "Scan veraltet", "#64748B"
	default:
		return "○", "Kein Score", "#94A3B8"
	}
}

// GenerateFleetHTML erzeugt einen selbst-enthaltenen HTML-Bericht über alle
// Kunden und Geräte der Flotte (kein CDN, offline nutzbar, druckbar → PDF).
func GenerateFleetHTML(r *FleetReport) string {
	sb := &strings.Builder{}
	sb.Grow(64 * 1024)

	title := "Flotten-Bericht"
	if r.CompanyName != "" {
		title = r.CompanyName + " – Flotten-Bericht"
	}

	fmt.Fprintf(sb, "<!DOCTYPE html>\n<html lang=\"de\">\n<head>\n"+
		"<meta charset=\"UTF-8\">\n"+
		"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"+
		"<title>AdminKit – %s</title>\n<style>%s%s</style>\n</head>\n<body>\n",
		h(title), reportCSS, fleetReportCSS)

	// ── Kopfzeile ────────────────────────────────────────────────────────────
	sb.WriteString("<header>\n")
	if r.LogoBase64 != "" {
		fmt.Fprintf(sb, "  <img class=\"hdr-logo-img\" src=\"%s\" alt=\"Logo\">\n", r.LogoBase64)
	} else {
		sb.WriteString("  <div class=\"hdr-logo\">🛠 AdminKit</div>\n")
	}
	sb.WriteString("  <div class=\"hdr-body\">\n")
	if r.CompanyName != "" {
		fmt.Fprintf(sb, "    <div class=\"hdr-company\">%s</div>\n", h(r.CompanyName))
	}
	sb.WriteString("    <div class=\"hdr-title\">Flotten-Übersicht</div>\n")
	sb.WriteString("    <div class=\"hdr-meta\">\n")
	fmt.Fprintf(sb, "      <span>Geräte: <strong>%d</strong></span>\n", r.Overview.TotalDevices)
	fmt.Fprintf(sb, "      <span>Sessions: <strong>%d</strong></span>\n", r.Overview.TotalSessions)
	fmt.Fprintf(sb, "      <span>Erstellt: <strong>%s</strong></span>\n",
		h(r.GeneratedAt.Format("02.01.2006 15:04:05")))
	if r.TechnicianName != "" {
		fmt.Fprintf(sb, "      <span>Techniker: <strong>%s</strong></span>\n", h(r.TechnicianName))
	}
	sb.WriteString("    </div>\n  </div>\n")
	sb.WriteString("  <div class=\"hdr-actions\">" +
		"<button class=\"print-btn\" onclick=\"window.print()\">🖨 Drucken / PDF</button>" +
		"</div>\n</header>\n")

	if len(r.Overview.Customers) == 0 {
		sb.WriteString("<p class=\"fleet-empty\">Noch keine Sessions auf dem Hub.</p>\n</body>\n</html>")
		return sb.String()
	}

	// ── Kunden-Gruppen ─────────────────────────────────────────────────────────
	for _, group := range r.Overview.Customers {
		icon, label, color := fleetStatusMeta(group.WorstStatus)
		fmt.Fprintf(sb, "<section class=\"fleet-r-group\">\n")
		fmt.Fprintf(sb,
			"  <h2 class=\"fleet-r-group-title\"><span style=\"color:%s\">%s</span> %s "+
				"<span class=\"fleet-r-count\">%d Gerät(e) · %s</span></h2>\n",
			color, icon, h(group.Name), group.DeviceCount, h(label))

		sb.WriteString("  <table class=\"fleet-r-table\">\n    <thead><tr>" +
			"<th>Gerät</th><th>Status</th><th>Health</th><th>Verlauf</th>" +
			"<th>Standort</th><th>Scans</th><th>Letzter Scan</th>" +
			"</tr></thead>\n    <tbody>\n")
		for _, dev := range group.Devices {
			dIcon, dLabel, dColor := fleetStatusMeta(dev.Status)
			health := "–"
			if dev.LatestHealth > 0 {
				health = fmt.Sprintf("%d/100", dev.LatestHealth)
			}
			nameCell := h(dev.Label)
			if dev.Hostname != "" && dev.Hostname != dev.Label {
				nameCell += fmt.Sprintf(" <span class=\"fleet-r-host\">(%s)</span>", h(dev.Hostname))
			}
			fmt.Fprintf(sb, "    <tr>\n")
			fmt.Fprintf(sb, "      <td>%s</td>\n", nameCell)
			fmt.Fprintf(sb, "      <td><span style=\"color:%s\">%s</span> %s</td>\n", dColor, dIcon, h(dLabel))
			fmt.Fprintf(sb, "      <td>%s</td>\n", health)
			fmt.Fprintf(sb, "      <td>%s</td>\n", sparklineSVG(dev.Trend))
			fmt.Fprintf(sb, "      <td>%s</td>\n", h(dev.Location))
			fmt.Fprintf(sb, "      <td>%d</td>\n", dev.SessionCount)
			fmt.Fprintf(sb, "      <td>%s</td>\n", h(formatScanDate(dev.LatestScan)))
			fmt.Fprintf(sb, "    </tr>\n")
		}
		sb.WriteString("    </tbody>\n  </table>\n</section>\n")
	}

	sb.WriteString("</body>\n</html>")
	return sb.String()
}

// ExportFleetHTML schreibt den Fleet-Bericht als HTML-Datei in outDir.
func ExportFleetHTML(r *FleetReport, outDir string) (string, error) {
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return "", fmt.Errorf("export-verzeichnis: %w", err)
	}
	ts := r.GeneratedAt.Format("20060102_150405")
	path := filepath.Join(outDir, fmt.Sprintf("flotten-bericht_%s.html", ts))
	if err := os.WriteFile(path, []byte(GenerateFleetHTML(r)), 0644); err != nil {
		return "", fmt.Errorf("HTML-Datei schreiben: %w", err)
	}
	return path, nil
}

// sparklineSVG rendert den Health-Trend als kleine SVG-Linie (inline, offline).
func sparklineSVG(trend []fleet.HealthPoint) string {
	if len(trend) < 2 {
		return "<span class=\"fleet-r-notrend\">–</span>"
	}
	const w, hgt, pad = 120.0, 28.0, 3.0
	n := len(trend)
	coords := make([]string, n)
	for i, p := range trend {
		x := pad + float64(i)*(w-2*pad)/float64(n-1)
		score := p.HealthScore
		if score < 0 {
			score = 0
		} else if score > 100 {
			score = 100
		}
		y := pad + (hgt-2*pad)*(1-float64(score)/100)
		coords[i] = fmt.Sprintf("%.1f,%.1f", x, y)
	}
	last := trend[n-1].HealthScore
	stroke := "#16A34A"
	if last < 60 {
		stroke = "#DC2626"
	} else if last < 85 {
		stroke = "#D97706"
	}
	return fmt.Sprintf(
		"<svg class=\"fleet-r-spark\" viewBox=\"0 0 %.0f %.0f\" preserveAspectRatio=\"none\">"+
			"<polyline fill=\"none\" stroke=\"%s\" stroke-width=\"2\" points=\"%s\"/></svg>",
		w, hgt, stroke, strings.Join(coords, " "))
}

func formatScanDate(t time.Time) string {
	if t.IsZero() {
		return "–"
	}
	return t.Format("02.01.2006")
}

// fleetReportCSS ergänzt reportCSS um fleet-spezifische Stile.
const fleetReportCSS = `
.fleet-r-group { margin: 24px 0; }
.fleet-r-group-title { font-size: 17px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
.fleet-r-count { font-size: 12px; font-weight: normal; color: #64748b; margin-left: 8px; }
.fleet-r-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
.fleet-r-table th, .fleet-r-table td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
.fleet-r-table th { background: #f8fafc; }
.fleet-r-host { color: #94a3b8; font-size: 11px; }
.fleet-r-spark { width: 120px; height: 28px; display: block; }
.fleet-r-notrend { color: #cbd5e1; }
.fleet-empty { padding: 40px; text-align: center; color: #64748b; }
`
