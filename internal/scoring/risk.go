package scoring

import (
	"path/filepath"
	"strings"
)

// EventRisk berechnet den Risiko-Score für ein einzelnes Log-Ereignis (0–100).
//
// Die meisten macOS-Fehler sind System-Rauschen (iCloud-Sync, CoreData-XPC,
// Family-Entitlements) und bekommen niedrige Scores. Echte Sicherheitsrisiken
// wie unsigned Code, SIP-Deaktivierung oder unbekannte Prozesse aus User-Dirs
// bekommen hohe Scores.
func EventRisk(processName, subsystem, message string) int {
	proc    := strings.ToLower(processName)
	sub     := strings.ToLower(subsystem)
	msg     := strings.ToLower(message)

	// ── Sehr hohes Risiko (80–95) ────────────────────────────────────────────
	if containsAny(msg, "malware", "xprotect found", "gatekeeper blocked",
		"unsigned code", "invalid signature", "code signature", "quarantine") {
		return 90
	}
	if containsAny(msg, "system integrity protection", "sip disabled", "sip is disabled") {
		return 80
	}
	if containsAny(sub, "com.apple.mrt", "com.apple.xprotect") {
		return 85
	}

	// ── Mittleres Risiko (30–60) ──────────────────────────────────────────────
	if containsAny(msg, "permission denied", "access denied", "operation not permitted",
		"entitlement denied", "authorization failed") {
		// Entitlement-Fehler von bekannten Apple-Prozessen sind Rauschen
		if isAppleNoise(proc, sub) {
			return 15
		}
		return 45
	}
	if containsAny(msg, "certificate", "ssl", "tls handshake", "trust") &&
		!isAppleNoise(proc, sub) {
		return 40
	}
	if containsAny(msg, "crash", "killed", "segfault", "signal 11", "signal 6") &&
		!isAppleNoise(proc, sub) {
		return 35
	}

	// ── Bekanntes Apple-System-Rauschen (1–10) ────────────────────────────────
	if isAppleNoise(proc, sub) {
		return noiseScore(proc, sub, msg)
	}

	// ── Unbekannter Prozess — moderates Risiko ────────────────────────────────
	return 20
}

// AutostartRisk berechnet den Risiko-Score für einen Autostart-Eintrag (0–100).
func AutostartRisk(path string, isSystem bool, location string) int {
	if isSystem {
		return 0
	}
	p := strings.ToLower(path)
	loc := strings.ToLower(location)

	// Aus /tmp, /var/folders, /private/tmp → sehr verdächtig
	if containsAny(p, "/tmp/", "/private/tmp/", "/var/folders/") {
		return 90
	}
	// Aus User-Home-Verzeichnis (nicht ~/Library/LaunchAgents) → hoch
	if strings.Contains(p, "/users/") &&
		!containsAny(p, "/library/launchagents/", "/library/application support/") {
		return 80
	}
	// LaunchDaemon aus User-Verzeichnis → sehr hoch (sollte in /Library/LaunchDaemons stehen)
	if strings.Contains(loc, "launchdaemon") && strings.Contains(p, "/users/") {
		return 85
	}
	// Ausführbar aus Downloads oder Desktop
	if containsAny(p, "/downloads/", "/desktop/") {
		return 75
	}
	// Aus /Library/LaunchAgents ohne system-Flag → mittel (drittanbieter, aber normal)
	if containsAny(loc, "launchagent", "launchdaemon") {
		return 30
	}
	// Login-Item, Startup-Ordner
	if containsAny(loc, "login item", "startup") {
		return 15
	}
	return 10
}

// SecurityRisk gibt einen Risiko-Score für bekannte Sicherheits-Checks zurück.
// Wird im Security-Tab verwendet um einheitliche Scores anzuzeigen.
func SecurityRisk(check string) int {
	switch check {
	case "sip_disabled":    return 80
	case "filevault_off":   return 70
	case "firewall_off":    return 75
	case "defender_off":    return 80
	case "rdp_enabled":     return 40
	case "ssh_enabled":     return 35
	default:                return 0
	}
}

// isAppleNoise gibt true zurück wenn ein Prozess/Subsystem bekannt harmlose Fehler produziert.
func isAppleNoise(proc, sub string) bool {
	noiseProcs := []string{
		"apsd", "bird", "cloudd", "nsurlsessiond", "callservicesd",
		"imessage", "imdpersistenceagent", "addressbooksourcesync",
		"familycircle", "familyd", "com.apple.family",
		"coredata", "swiftuicore", "coreui", "coreroutine",
		"storeaccountd", "storekitagent", "commerce",
		"accountsd", "akd", "cloudphotosd", "photolibraryd",
		"assistantd", "siriknowledged",
	}
	noiseSubs := []string{
		"com.apple.family", "com.apple.coredata", "com.apple.coreui",
		"com.apple.coroutine", "com.apple.swiftui", "com.apple.commerce",
		"com.apple.icloud", "com.apple.accounts",
	}
	for _, n := range noiseProcs {
		if strings.Contains(proc, n) {
			return true
		}
	}
	for _, n := range noiseSubs {
		if strings.Contains(sub, n) {
			return true
		}
	}
	return false
}

// noiseScore gibt den spezifischen Score für bekanntes Apple-Rauschen zurück.
func noiseScore(proc, sub, msg string) int {
	// iCloud-Sync-Fehler: sehr harmlos
	if containsAny(proc, "bird", "cloudd", "cloudphotosd") ||
		containsAny(sub, "com.apple.icloud") {
		return 2
	}
	// Push-Service: harmlos
	if strings.Contains(proc, "apsd") {
		return 2
	}
	// Family/Contacts-Entitlements: System-Rauschen
	if containsAny(proc, "addressbook", "family") ||
		containsAny(sub, "com.apple.family") {
		return 3
	}
	// CoreData/XPC sync: harmlos
	if containsAny(sub, "com.apple.coredata") ||
		containsAny(msg, "xpc: synchronous") {
		return 3
	}
	// SwiftUI / CoreUI Konfigurationsfehler: harmlos
	if containsAny(proc, "swiftuicore", "coreui") ||
		containsAny(sub, "com.apple.swiftui", "com.apple.coreui") {
		return 5
	}
	return 8
}

// RiskLabel gibt ein kurzes Label für einen Score zurück.
func RiskLabel(score int) string {
	switch {
	case score >= 80: return "Kritisch"
	case score >= 50: return "Hoch"
	case score >= 20: return "Mittel"
	case score >= 5:  return "Niedrig"
	default:          return "Info"
	}
}

// RiskColor gibt die CSS-Farb-Klasse für einen Score zurück.
func RiskColor(score int) string {
	switch {
	case score >= 80: return "red"
	case score >= 50: return "orange"
	case score >= 20: return "yellow"
	case score >= 5:  return "blue"
	default:          return "gray"
	}
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

// PathRisk ist ein Hilfsmittel für Pfad-basierte Risikobewertung ohne autostart-Import.
func PathRisk(path string) int {
	p := strings.ToLower(filepath.Clean(path))
	if containsAny(p, "/tmp/", "/private/tmp/", "/var/folders/") {
		return 90
	}
	if containsAny(p, "/downloads/", "/desktop/") {
		return 70
	}
	if strings.Contains(p, "/users/") {
		return 50
	}
	return 0
}
