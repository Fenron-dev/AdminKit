package packages

import "fmt"

// wingetCode beschreibt einen winget-Rückgabecode.
type wingetCode struct {
	Message string
	Success bool // Ergebnis gilt trotzdem als erfolgreich
	Reboot  bool
}

// wingetCodes übersetzt die HRESULT-artigen Rückgabecodes von winget
// (Quelle: winget-cli, doc/windows/package-manager/winget/returnCodes.md).
var wingetCodes = map[uint32]wingetCode{
	0x8A150001: {Message: "Interner Fehler in winget"},
	0x8A150002: {Message: "Ungültige Befehlszeilenargumente"},
	0x8A150003: {Message: "Befehl fehlgeschlagen"},
	0x8A150004: {Message: "Manifest konnte nicht geöffnet werden"},
	0x8A150005: {Message: "Vorgang abgebrochen"},
	0x8A150006: {Message: "Installer konnte nicht gestartet werden"},
	0x8A150008: {Message: "Download fehlgeschlagen – Internetverbindung prüfen"},
	0x8A15000C: {Message: "Paketquellen sind beschädigt – „winget source reset --force“ als Admin ausführen"},
	0x8A150010: {Message: "Paketquelle enthält keine Daten – „winget source update“ ausführen"},
	0x8A150011: {Message: "Kein passender Installer für dieses System (Architektur, Scope oder Sprache)"},
	0x8A150012: {Message: "Prüfsumme des Installers stimmt nicht – Download wurde verworfen"},
	0x8A150014: {Message: "Paket nicht gefunden"},
	0x8A150015: {Message: "Keine Paketquellen eingerichtet"},
	0x8A150016: {Message: "Mehrere Pakete passen – bitte exakte ID verwenden"},
	0x8A150017: {Message: "Kein Manifest gefunden"},
	0x8A15002B: {Message: "Kein Update verfügbar", Success: true},
	0x8A150101: {Message: "Programm ist in Benutzung – bitte schließen und erneut versuchen"},
	0x8A150102: {Message: "Eine andere Installation läuft bereits – bitte warten"},
	0x8A150103: {Message: "Eine benötigte Datei ist in Benutzung"},
	0x8A150104: {Message: "Eine Abhängigkeit fehlt"},
	0x8A150105: {Message: "Nicht genug Speicherplatz"},
	0x8A150106: {Message: "Nicht genug Arbeitsspeicher"},
	0x8A150107: {Message: "Keine Netzwerkverbindung"},
	0x8A150108: {Message: "Installer meldet einen Fehler – Hersteller-Support nötig"},
	0x8A150109: {Message: "Erfolgreich – Neustart zum Abschließen erforderlich", Success: true, Reboot: true},
	0x8A15010A: {Message: "Neustart vor der Installation erforderlich", Reboot: true},
	0x8A15010B: {Message: "Installer hat einen Neustart ausgelöst", Success: true, Reboot: true},
	0x8A15010C: {Message: "Vom Benutzer abgebrochen (UAC abgelehnt?)"},
	0x8A15010D: {Message: "Bereits installiert", Success: true},
	0x8A15010E: {Message: "Neuere Version bereits installiert"},
	0x8A15010F: {Message: "Durch Richtlinie blockiert"},
	0x8A150110: {Message: "Abhängigkeiten konnten nicht installiert werden"},
	0x8A150111: {Message: "Programm wird von einer anderen Anwendung verwendet"},
	0x800704C7: {Message: "Vom Benutzer abgebrochen (UAC abgelehnt)"},
	// MSI-/Installer-Exitcodes, die winget teils unverändert durchreicht
	1602: {Message: "Vom Benutzer abgebrochen"},
	1618: {Message: "Eine andere Installation läuft bereits – bitte warten"},
	1641: {Message: "Erfolgreich – Neustart wurde ausgelöst", Success: true, Reboot: true},
	3010: {Message: "Erfolgreich – Neustart zum Abschließen erforderlich", Success: true, Reboot: true},
}

// describeWingetExit übersetzt einen Exit-Code in Ergebnisfelder.
func describeWingetExit(code int) (success bool, reboot bool, msg string) {
	if code == 0 {
		return true, false, "Erfolgreich"
	}
	u := uint32(code)
	if c, ok := wingetCodes[u]; ok {
		return c.Success, c.Reboot, c.Message
	}
	return false, false, fmt.Sprintf("Fehlgeschlagen (Code 0x%08X)", u)
}
