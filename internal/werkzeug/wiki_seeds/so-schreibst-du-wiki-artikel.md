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
