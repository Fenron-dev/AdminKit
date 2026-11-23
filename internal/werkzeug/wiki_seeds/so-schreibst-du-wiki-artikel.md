---
titel: "So schreibst du Wiki-Artikel"
kategorie: "Hilfe"
tags: ["markdown", "anleitung", "bilder", "diagramme"]
autor: "Team"
revision: 2
---
Artikel werden in Markdown geschrieben. Die Vorschau rechts im Editor zeigt sofort, wie der Text aussieht. Gute Artikel erklären mit Bildern und Schaubildern, nicht nur mit Text.

## Formatierung
| Eingabe | Ergebnis |
|---|---|
| `**fett**` | **fett** |
| `*kursiv*` | *kursiv* |
| `` `Code` `` | `Code` |
| `[Text](https://…)` | Link |
| `## Überschrift` | Abschnitt mit Eintrag im Inhaltsverzeichnis |

## Bilder
Über den Knopf **Bild** im Editor eine Datei auswählen, oder einen Screenshot einfach mit **Strg + V** in den Text einfügen. Bilder werden automatisch verkleinert und als Datei im Vault unter `wiki/_bilder/<artikel>/` abgelegt. So zeigt auch Obsidian sie an. Die Beschreibung in den eckigen Klammern erscheint als Bildunterschrift.

```text
![Plesk: Domain hinzufügen](_bilder/neue-domain-in-plesk-anlegen/domain-hinzufuegen.webp)
```

## Ablauf-Diagramm
Für Schritt-für-Schritt-Abläufe. Jede Zeile ist ein Schritt, nach dem senkrechten Strich folgt eine kurze Erklärung.

````text
```ablauf
Anrufen | Kunde schildert das Problem
Prüfen | Fernwartung starten
Lösen | Fehler beheben und testen
```
````

So sieht das aus:

```ablauf
Anrufen | Kunde schildert das Problem
Prüfen | Fernwartung starten
Lösen | Fehler beheben und testen
```

## Vergleich
Die erste Zeile enthält die Spaltenköpfe. Ein **+** am Anfang einer Zelle markiert sie grün, ein **-** rot.

```vergleich
 | Variante A | Variante B
Sicher | + ja | - nein
Bequem | - umständlich | + ein Klick
```

## Fertige Illustrationen
Für häufige Themen gibt es fertige Schaubilder: `passkey-prinzip`, `passkey-phishing`, `passkey-geraete`, `url-anatomie`, `backup-321`. Erste Zeile ist der Name, zweite Zeile die Bildunterschrift.

````text
```illustration
url-anatomie
So liest man eine Webadresse
```
````

## Listen, Checklisten und Hinweiskästen
```text
- Punkt
1. Nummerierter Schritt
- [ ] Offene Aufgabe
- [x] Erledigte Aufgabe

> [!TIPP] Überschrift
> Ein hilfreicher Tipp.

> [!WARNUNG]
> Etwas, das schiefgehen kann.
```

> [!INFO] Tastenkürzel
> `Strg + S` speichert den Artikel, `Strg + B` macht markierten Text fett, `Strg + V` fügt auch Screenshots ein.

## Videos, Audio, GIFs und Dateien
Mit **Datei** in der Werkzeugleiste oder per Drag & Drop landen Videos (MP4, WebM, MOV), Audio (MP3, M4A, WAV), animierte GIFs und Anhänge (PDF, TXT, ZIP) im Vault beim Artikel. Eingebunden werden sie wie in Obsidian:

```text
![[installation.mp4]]
![[installation.mp4|Bildunterschrift]]
![[sprachnotiz.m4a]]
![[handbuch.pdf]]
```

Ein **YouTube- oder Vimeo-Link** allein in einer Zeile wird als Video eingebettet. Es lädt erst nach einem Klick – vorher wird nichts von YouTube abgerufen.

## Konsolenausgaben
Ausgaben von Befehlen in einen `console`-Block. Lange Ausgaben (über 20 Zeilen) werden automatisch eingeklappt.

````text
```console
C:\> ipconfig /all
…
```
````

## Windows und macOS nebeneinander
Kästen mit `[!WINDOWS]`, `[!MACOS]` oder `[!LINUX]` direkt hintereinander erscheinen nebeneinander. Über „Nur Windows anzeigen“ blendet man die andere Plattform aus.

```text
> [!WINDOWS] Drucker hinzufügen
> Einstellungen → Bluetooth und Geräte → Drucker

> [!MACOS] Drucker hinzufügen
> Systemeinstellungen → Drucker & Scanner
```

## Knöpfe, die etwas öffnen oder ausführen
Mitten im Text klicken, Ergebnis ansehen, weiterlesen:

```text
[[run:ipconfig|IP-Konfiguration anzeigen]]
[[run:ping?Ziel=192.168.178.1|Router anpingen]]
[[open:devmgmt.msc|Geräte-Manager öffnen]]
[[open:ms-settings:printers|Drucker-Einstellungen]]
[[cmd:win:netstat -an | findstr 3389|Ist Remotedesktop aktiv?]]
```

- `run:` nimmt einen Befehl aus **Werkzeugkasten → Befehle & Einstellungen** (dort „Für Wiki“ kopiert den passenden Text). Er läuft auf jedem System in der richtigen Variante, mit Hilfe und Bewertung. Werte für Platzhalter stehen hinter dem `?`.
- `open:` öffnet Einstellungsseiten und Verwaltungskonsolen.
- `cmd:` führt den Befehl so aus, wie er im Text steht – es erscheint **immer** eine Rückfrage mit dem genauen Befehl. `win:` bzw. `mac:` legt fest, für welches System er gedacht ist.

> [!WARNUNG] Befehle prüfen
> Artikel liegen im gemeinsamen Vault. Vor dem Bestätigen eines Befehls immer lesen, was er tut.
