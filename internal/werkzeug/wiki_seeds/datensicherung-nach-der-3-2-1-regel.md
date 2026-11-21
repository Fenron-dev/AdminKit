---
titel: "Datensicherung nach der 3-2-1-Regel"
kategorie: "Infrastruktur"
tags: ["backup", "beratung", "nas"]
autor: "Team"
revision: 2
---
Eine gute Datensicherung lässt sich in einem Satz erklären: **drei Kopien, zwei verschiedene Speicher, eine Kopie außer Haus.**

```illustration
backup-321
Die 3-2-1-Regel auf einen Blick.
```

| Kopie | Beispiel | Schützt vor |
|---|---|---|
| Original | Rechner oder Server | – |
| Lokale Sicherung | NAS oder USB-Festplatte | Defekt, versehentliches Löschen |
| Externe Sicherung | Cloud oder rotierende Festplatte | Brand, Diebstahl, Verschlüsselungstrojaner |

## Worauf wir achten
- Mindestens eine Sicherung ist **offline** oder unveränderlich, damit Schadsoftware sie nicht mitverschlüsseln kann.
- Die Wiederherstellung wird regelmäßig getestet. Eine Sicherung, die niemand zurückspielen kann, ist keine.
- Zugangsdaten zur Sicherung liegen in Bitwarden, nicht auf dem gesicherten Gerät.

> [!TIPP] Im Beratungsgespräch
> Frag nicht „Haben Sie ein Backup?", sondern „Wann haben Sie zuletzt eine Datei aus der Sicherung zurückgeholt?" Die Antwort sagt mehr.
