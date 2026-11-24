package system

import "strings"

// DeviceIdentity: Hersteller, Modell und Geräte-Seriennummer (BIOS/Service-Tag),
// z. B. für Garantieabfragen (#111). Nur lesend.
type DeviceIdentity struct {
	Manufacturer string `json:"manufacturer"`
	Model        string `json:"model"`
	Serial       string `json:"serial"`
}

// cleanSerial verwirft Platzhalter, die Hersteller statt einer Seriennummer eintragen.
func cleanSerial(s string) string {
	s = strings.TrimSpace(s)
	switch strings.ToLower(s) {
	case "", "default string", "to be filled by o.e.m.", "system serial number", "none", "0", "n/a", "not specified", "not applicable":
		return ""
	}
	return s
}
