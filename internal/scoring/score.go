// Package scoring berechnet einen System-Health-Score (0–100) aus Scan-Ergebnissen.
package scoring

import (
	"adminkit/internal/autostart"
	"adminkit/internal/events"
	"adminkit/internal/system"
)

// Deduction beschreibt einen einzelnen Abzug im Score-Ergebnis.
type Deduction struct {
	Label  string `json:"label"`
	Points int    `json:"points"`
}

// ScoreResult enthält den berechneten Score und alle Abzüge.
type ScoreResult struct {
	Score      int         `json:"score"`
	Deductions []Deduction `json:"deductions"`
	// Label: "Gut", "Mittel", "Kritisch"
	Label string `json:"label"`
	// Color: "green", "yellow", "red"
	Color string `json:"color"`
}

// Compute berechnet den Health Score aus den übergebenen Scan-Ergebnissen.
// Nicht vorhandene Scan-Ergebnisse (nil) werden übersprungen.
func Compute(
	sys *system.ScanResult,
	autostartResult *autostart.ScanResult,
	eventsResult *events.ScanResult,
) *ScoreResult {
	score := 100
	var deductions []Deduction

	deduct := func(label string, pts int) {
		score -= pts
		deductions = append(deductions, Deduction{Label: label, Points: pts})
	}

	if sys != nil {
		sec := sys.Security

		// Firewall
		if sec.FirewallKnown && !sec.FirewallEnabled {
			deduct("Firewall deaktiviert", 20)
		}

		// Defender / AV (nur Windows)
		if sec.Platform == "windows" && !sec.DefenderEnabled {
			deduct("Windows Defender deaktiviert", 15)
		}

		// Festplattenplatz: niedrigster freier Anteil aller Volumes
		for _, v := range sys.Hardware.Volumes {
			if v.TotalGB <= 0 {
				continue
			}
			freePct := v.FreeGB / v.TotalGB
			if freePct < 0.05 {
				deduct("Laufwerk "+v.Letter+" kritisch voll (< 5 % frei)", 20)
			} else if freePct < 0.10 {
				deduct("Laufwerk "+v.Letter+" fast voll (< 10 % frei)", 15)
			}
		}

		// SMART — schlechtester Status zählt
		worstSmart := system.SmartOK
		for _, d := range sys.Smart {
			if d.Status == system.SmartCritical {
				worstSmart = system.SmartCritical
				break
			}
			if d.Status == system.SmartWarning {
				worstSmart = system.SmartWarning
			}
		}
		switch worstSmart {
		case system.SmartCritical:
			deduct("SMART: Festplatten-Fehler kritisch", 20)
		case system.SmartWarning:
			deduct("SMART: Festplatten-Warnung", 10)
		}

		// OS-Lizenz
		if sys.OS.LicenseStatus != "" && sys.OS.LicenseStatus != "Licensed" && sys.OS.LicenseStatus != "Unbekannt" {
			deduct("Betriebssystem nicht aktiviert", 5)
		}

		// Ausstehende Updates
		if sys.OS.PendingUpdates > 0 {
			deduct("Ausstehende System-Updates", 5)
		}
	}

	// Autostart: zu viele Nicht-System-Einträge
	if autostartResult != nil {
		nonSystem := 0
		for _, e := range autostartResult.Entries {
			if !e.IsSystem && e.IsEnabled {
				nonSystem++
			}
		}
		if nonSystem > 15 {
			deduct("Mehr als 15 Autostart-Einträge ("+itoa(nonSystem)+")", 10)
		}
	}

	// Ereignisse: viele kritische Einträge
	if eventsResult != nil {
		critical := 0
		for _, ev := range eventsResult.Events {
			if ev.Level == events.LevelCritical || ev.Level == events.LevelError {
				critical++
			}
		}
		if critical > 10 {
			deduct("Mehr als 10 kritische Ereignisse ("+itoa(critical)+")", 10)
		}
	}

	if score < 0 {
		score = 0
	}

	label, color := classify(score)
	return &ScoreResult{
		Score:      score,
		Deductions: deductions,
		Label:      label,
		Color:      color,
	}
}

func classify(score int) (label, color string) {
	switch {
	case score >= 80:
		return "Gut", "green"
	case score >= 50:
		return "Mittel", "yellow"
	default:
		return "Kritisch", "red"
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := [20]byte{}
	pos := len(buf)
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[pos:])
}
