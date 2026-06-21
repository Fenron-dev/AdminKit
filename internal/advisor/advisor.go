// Package advisor analysiert Scan-Ergebnisse und erzeugt Optimierungsvorschläge.
package advisor

import (
	"adminkit/internal/autostart"
	"adminkit/internal/events"
	"adminkit/internal/scoring"
	"adminkit/internal/system"
	"fmt"
)

// Severity beschreibt den Schweregrad eines Vorschlags.
type Severity string

const (
	SeverityCritical Severity = "critical" // Sofortige Aktion empfohlen
	SeverityWarning  Severity = "warning"  // Sollte behoben werden
	SeverityInfo     Severity = "info"     // Optimierungspotenzial
)

// FixType beschreibt ob und wie ein Fix angewendet werden kann.
type FixType string

const (
	FixAuto     FixType = "auto"     // Kann automatisch angewendet werden
	FixNavigate FixType = "navigate" // Öffnet System-Einstellungen o.ä.
	FixManual   FixType = "manual"   // Muss manuell behoben werden
	FixNone     FixType = "none"     // Kein Fix möglich
)

// Suggestion beschreibt einen einzelnen Optimierungsvorschlag.
type Suggestion struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Detail      string   `json:"detail"`
	Severity    Severity `json:"severity"`
	RiskScore   int      `json:"risk_score"`
	FixType     FixType  `json:"fix_type"`
	FixLabel    string   `json:"fix_label"`   // Text für den Fix-Button
	FixID       string   `json:"fix_id"`      // ID für RunFix()
	FixWarning  string   `json:"fix_warning"` // Warnung vor Auto-Fix (leer = keine)
}

// Analyze wertet die übergebenen Scan-Ergebnisse aus und gibt eine priorisierte
// Liste von Optimierungsvorschlägen zurück (höchster Risk-Score zuerst).
func Analyze(
	sys *system.ScanResult,
	ast *autostart.ScanResult,
	evts *events.ScanResult,
) []Suggestion {
	var suggestions []Suggestion

	add := func(s Suggestion) { suggestions = append(suggestions, s) }

	if sys != nil {
		sec := sys.Security

		// ── Firewall ─────────────────────────────────────────────────────────
		if sec.FirewallKnown && !sec.FirewallEnabled {
			add(Suggestion{
				ID:        "firewall_off",
				Title:     "Firewall ist deaktiviert",
				Detail:    "Die System-Firewall schützt vor unerwünschten Netzwerkverbindungen. Eine aktive Firewall ist besonders im öffentlichen WLAN wichtig.",
				Severity:  SeverityWarning,
				RiskScore: scoring.SecurityRisk("firewall_off"),
				FixType:   FixAuto,
				FixLabel:  "Firewall aktivieren",
				FixID:     "enable_firewall",
				FixWarning: "",
			})
		}

		// ── SIP (macOS) ──────────────────────────────────────────────────────
		if sec.SIPKnown && sec.SIPEnabled != nil && !*sec.SIPEnabled {
			add(Suggestion{
				ID:       "sip_off",
				Title:    "System Integrity Protection (SIP) ist deaktiviert",
				Detail:   "SIP verhindert, dass Schadsoftware kritische System-Dateien verändert. Die Deaktivierung ist ein erhebliches Sicherheitsrisiko. Reaktivierung nur über macOS Recovery möglich (⌘+R beim Start).",
				Severity: SeverityCritical,
				RiskScore: scoring.SecurityRisk("sip_disabled"),
				FixType:  FixManual,
				FixLabel: "Anleitung öffnen",
				FixID:    "sip_info",
			})
		}

		// ── FileVault / BitLocker ────────────────────────────────────────────
		anyUnencrypted := false
		for _, v := range sec.BitLockerVolumes {
			if !v.Encrypted {
				anyUnencrypted = true
				break
			}
		}
		if anyUnencrypted {
			label := "FileVault aktivieren"
			detail := "Ohne FileVault sind alle Daten bei Diebstahl des Geräts sofort lesbar. Aktivierung in Systemeinstellungen → Datenschutz & Sicherheit → FileVault."
			navigateID := "open_filevault"
			if sec.Platform == "windows" {
				label = "BitLocker aktivieren"
				detail = "Ohne BitLocker sind alle Daten bei Diebstahl sofort lesbar. Aktivierung in Systemsteuerung → System und Sicherheit → BitLocker."
				navigateID = "open_bitlocker"
			}
			add(Suggestion{
				ID:        "encryption_off",
				Title:     "Festplattenverschlüsselung ist deaktiviert",
				Detail:    detail,
				Severity:  SeverityWarning,
				RiskScore: scoring.SecurityRisk("filevault_off"),
				FixType:   FixNavigate,
				FixLabel:  label,
				FixID:     navigateID,
			})
		}

		// ── Windows Defender ─────────────────────────────────────────────────
		if sec.Platform == "windows" && !sec.DefenderEnabled {
			add(Suggestion{
				ID:        "defender_off",
				Title:     "Windows Defender ist deaktiviert",
				Detail:    "Ohne Echtzeit-Schutz ist das System anfällig für Malware. Falls kein anderes AV-Programm aktiv ist, sollte Defender sofort reaktiviert werden.",
				Severity:  SeverityCritical,
				RiskScore: scoring.SecurityRisk("defender_off"),
				FixType:   FixNavigate,
				FixLabel:  "Windows Sicherheit öffnen",
				FixID:     "open_windows_security",
			})
		}

		// ── SSH offen (macOS) ────────────────────────────────────────────────
		if sec.Platform == "darwin" && sec.RDPEnabled {
			add(Suggestion{
				ID:        "ssh_open",
				Title:     "Remote Login (SSH) ist aktiviert",
				Detail:    fmt.Sprintf("Port %d ist offen. Falls kein Fernzugriff benötigt wird, sollte SSH deaktiviert werden.", sec.RDPPort),
				Severity:  SeverityInfo,
				RiskScore: scoring.SecurityRisk("ssh_enabled"),
				FixType:   FixAuto,
				FixLabel:  "SSH deaktivieren",
				FixID:     "disable_ssh",
				FixWarning: "SSH wird sofort deaktiviert. Aktive Verbindungen werden getrennt.",
			})
		}

		// ── RDP offen (Windows) ──────────────────────────────────────────────
		if sec.Platform == "windows" && sec.RDPEnabled {
			add(Suggestion{
				ID:        "rdp_open",
				Title:     "Remote Desktop (RDP) ist aktiviert",
				Detail:    "RDP auf Port 3389 ist ein häufiges Angriffsziel für Brute-Force-Angriffe. Nur aktivieren wenn wirklich benötigt.",
				Severity:  SeverityInfo,
				RiskScore: scoring.SecurityRisk("rdp_enabled"),
				FixType:   FixManual,
				FixLabel:  "Systemeinstellungen öffnen",
				FixID:     "open_rdp_settings",
			})
		}

		// ── Ausstehende Updates ──────────────────────────────────────────────
		if sys.OS.PendingUpdates > 0 {
			add(Suggestion{
				ID:        "pending_updates",
				Title:     fmt.Sprintf("%d ausstehende System-Updates", sys.OS.PendingUpdates),
				Detail:    "System-Updates schließen Sicherheitslücken und verbessern die Stabilität. Updates sollten zeitnah eingespielt werden.",
				Severity:  SeverityWarning,
				RiskScore: 30,
				FixType:   FixNavigate,
				FixLabel:  "Software-Update öffnen",
				FixID:     "open_software_update",
			})
		}

		// ── SMART-Warnung ────────────────────────────────────────────────────
		for _, disk := range sys.Smart {
			if disk.Status == system.SmartCritical {
				add(Suggestion{
					ID:        "smart_critical_" + disk.SerialNumber,
					Title:     "Festplatte \"" + disk.Model + "\" meldet kritische Fehler",
					Detail:    "SMART-Status: KRITISCH. Die Festplatte zeigt Anzeichen eines bevorstehenden Ausfalls. Sofort Daten sichern und Austausch planen.",
					Severity:  SeverityCritical,
					RiskScore: 90,
					FixType:   FixNone,
					FixLabel:  "",
					FixID:     "",
				})
			} else if disk.Status == system.SmartWarning {
				add(Suggestion{
					ID:        "smart_warning_" + disk.SerialNumber,
					Title:     "Festplatte \"" + disk.Model + "\" zeigt SMART-Warnung",
					Detail:    "SMART-Status: WARNUNG. Anomalien erkannt. Regelmäßiges Backup empfohlen, Austausch einplanen.",
					Severity:  SeverityWarning,
					RiskScore: 60,
					FixType:   FixNone,
					FixLabel:  "",
					FixID:     "",
				})
			}
		}

		// ── Wenig Speicher ───────────────────────────────────────────────────
		for _, vol := range sys.Hardware.Volumes {
			if vol.TotalGB <= 0 { continue }
			freePct := vol.FreeGB / vol.TotalGB
			if freePct < 0.05 {
				add(Suggestion{
					ID:        "disk_critical_" + vol.Letter,
					Title:     fmt.Sprintf("Laufwerk %s ist kritisch voll (%.1f GB frei)", vol.Letter, vol.FreeGB),
					Detail:    "Weniger als 5 % freier Speicher. Das System kann instabil werden. Sofort Dateien löschen oder verschieben.",
					Severity:  SeverityCritical,
					RiskScore: 75,
					FixType:   FixNavigate,
					FixLabel:  "Speicher-Analyse öffnen",
					FixID:     "open_storage",
				})
			} else if freePct < 0.10 {
				add(Suggestion{
					ID:        "disk_low_" + vol.Letter,
					Title:     fmt.Sprintf("Laufwerk %s hat wenig freien Speicher (%.1f GB)", vol.Letter, vol.FreeGB),
					Detail:    "Weniger als 10 % freier Speicher. Empfohlen: Temp-Dateien bereinigen.",
					Severity:  SeverityWarning,
					RiskScore: 40,
					FixType:   FixAuto,
					FixLabel:  "Schnellbereinigung",
					FixID:     "quick_clean",
				})
			}
		}
	}

	// ── Zu viele Autostart-Einträge ──────────────────────────────────────────
	if ast != nil {
		nonSystem := 0
		for _, e := range ast.Entries {
			if !e.IsSystem && e.IsEnabled {
				nonSystem++
			}
		}
		if nonSystem > 15 {
			add(Suggestion{
				ID:        "autostart_many",
				Title:     fmt.Sprintf("%d Autostart-Einträge von Drittanbietern", nonSystem),
				Detail:    "Viele Autostart-Einträge verlängern die Boot-Zeit und können Ressourcen verbrauchen. Überprüfen ob alle wirklich benötigt werden.",
				Severity:  SeverityInfo,
				RiskScore: 15,
				FixType:   FixNavigate,
				FixLabel:  "Autostart-Tab öffnen",
				FixID:     "open_autostart",
			})
		}
	}

	// ── Viele risikorelevante Ereignisse ────────────────────────────────────
	if evts != nil {
		highRisk := 0
		for _, e := range evts.Events {
			if e.RiskScore >= 50 {
				highRisk++
			}
		}
		if highRisk > 5 {
			add(Suggestion{
				ID:        "high_risk_events",
				Title:     fmt.Sprintf("%d Ereignisse mit hohem Risiko-Score", highRisk),
				Detail:    "Mehrere sicherheitsrelevante Log-Ereignisse gefunden. Details im Ereignis-Tab einsehen.",
				Severity:  SeverityWarning,
				RiskScore: 50,
				FixType:   FixNavigate,
				FixLabel:  "Ereignisse anzeigen",
				FixID:     "open_events",
			})
		}
	}

	// Sortierung: höchster Risk-Score zuerst
	sortSuggestions(suggestions)
	return suggestions
}

func sortSuggestions(s []Suggestion) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j].RiskScore > s[j-1].RiskScore; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}
