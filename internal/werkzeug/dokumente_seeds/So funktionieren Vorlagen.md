# So funktionieren Vorlagen

Alles in diesem Ordner liegt im Vault unter `dokumente/`. Ordner legst du in der App (oder im Finder/Explorer) selbst an – AdminKit zeigt sie automatisch.

## Dateitypen

- **Markdown-Vorlagen (.md)** öffnet AdminKit selbst: lesen, bearbeiten, **ausfüllen und drucken**. Der Ausdruck bekommt euer Logo, Firma, Techniker und den Kunden der aktuellen Session und landet in der Session unter `exports/`.
- **Alle anderen Dateien** (Word, PDF, Excel …) öffnen mit dem Standardprogramm des Rechners. Über „Dateien importieren“ kopierst du sie in einen Ordner.

## Platzhalter

| Schreibweise | Bedeutung |
|---|---|
| `{{Kunde}}` | Eingabefeld „Kunde“ |
| `{{Kostenrahmen\|150 €}}` | Eingabefeld mit Vorgabewert |
| `{{Fehlerbeschreibung:lang}}` | mehrzeiliges Feld |

Automatisch vorbelegt: `{{Datum}}`, `{{Techniker}}`, `{{Firma}}` und – wenn eine Session offen ist – `{{Kunde}}`.

> [!TIPP] Mitgelieferte Beispiele
> Die Beispielvorlagen sind Startpunkte. Ändere oder lösche sie ruhig – sie werden nicht wiederhergestellt.
