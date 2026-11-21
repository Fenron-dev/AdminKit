---
titel: "Neuen Arbeitsplatz-PC einrichten"
kategorie: "Arbeitsplatz"
tags: ["windows", "checkliste", "bitlocker", "winget"]
autor: "Team"
revision: 2
---
Diese Checkliste hilft, einen PC für Kundschaft oder Team vollständig und nachvollziehbar einzurichten. Hake die Punkte im Auftrag ab und vermerke Abweichungen in der [Arbeitserfassung](https://input.ideler.de/).

```ablauf
Vorbereiten | Auftrag im CRM, Lizenzen in Bitwarden, Altgerät gesichert
Einrichten | Updates, Konten, BitLocker
Software und Daten | Standardprogramme per winget, Daten übernehmen
Übergabe | Funktionstest, Einweisung, Abrechnung
```

## Vor dem Start
- [x] Auftrag im CRM angelegt und dem Kunden zugeordnet
- [ ] Lizenzschlüssel und Zugangsdaten liegen in Bitwarden
- [ ] Datensicherung des Altgeräts geprüft

## Einrichtung
1. Windows-Updates vollständig installieren, inklusive Treiber-Updates.
2. Lokales Administratorkonto mit eigenem Passwort anlegen und in Bitwarden ablegen.
3. Benutzerkonto ohne Administratorrechte anlegen.
4. BitLocker aktivieren und den Wiederherstellungsschlüssel in Bitwarden speichern.
5. Standardsoftware installieren: Browser, PDF-Reader, Office, PCVisit-Kundenmodul. Schnell geht das mit dem Werkzeug **Software mit winget** im Portal: Favoriten mit dem Tag „Neuer PC“ filtern und alle Befehle auf einmal kopieren.
6. Daten vom Altgerät übernehmen und stichprobenartig öffnen.

> [!TIPP] Wiederherstellungsschlüssel
> Ohne BitLocker-Schlüssel gibt es nach einem Mainboard-Tausch keinen Zugriff mehr auf die Daten. Die Ablage in Bitwarden ist Pflicht.

## Übergabe
| Punkt | Zuständig |
|---|---|
| Funktionstest Drucker und E-Mail | Technik |
| Kurze Einweisung | Technik |
| Abrechnung | Arbeitserfassung |
