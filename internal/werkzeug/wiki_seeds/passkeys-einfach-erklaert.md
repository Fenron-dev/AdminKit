---
titel: "Passkeys einfach erklärt"
kategorie: "Sicherheit"
tags: ["passkey", "anmeldung", "passwortlos", "fido2", "beratung"]
autor: "Team"
revision: 1
---
Passkeys sind der Nachfolger des Passworts. Statt ein Geheimnis einzutippen, bestätigst du die Anmeldung einfach mit Fingerabdruck, Gesicht oder der PIN deines Geräts. Das BSI empfiehlt Passkeys ausdrücklich als Alternative zu Passwörtern.

## Die Idee: Schloss und Schlüssel
Ein Passkey besteht aus zwei Teilen, die genau zueinander passen:

- Der **private Schlüssel** bleibt auf deinem Handy, PC oder in deinem Passwort-Manager. Er wird nie verschickt, auch nicht an die Website.
- Der **öffentliche Schlüssel** liegt beim Onlinedienst. Er ist wie ein Schloss an der Tür: Jeder darf es sehen, öffnen kann es nur der passende Schlüssel.

```illustration
passkey-prinzip
So läuft eine Anmeldung mit Passkey ab. Ein Geheimnis wird dabei nie übertragen.
```

## Was bei der Anmeldung passiert
```ablauf
Anmelden antippen | Zum Beispiel bei PayPal, Amazon oder deinem Google-Konto
Website stellt eine Aufgabe | Eine Zufallszahl, die nur für diese eine Anmeldung gilt
Am Gerät bestätigen | Fingerabdruck, Gesicht oder PIN entsperren den Schlüssel
Gerät unterschreibt | Der private Schlüssel unterschreibt die Aufgabe digital
Website prüft | Passt die Unterschrift zum Schloss, bist du angemeldet
```

> [!INFO] Fingerabdruck und Gesicht bleiben bei dir
> Sie werden nur auf deinem eigenen Gerät geprüft und entsperren dort den Schlüssel. Die Website bekommt davon nichts zu sehen, nur die fertige Unterschrift.

## Warum ist das sicherer als ein Passwort?
```vergleich
 | Passwort | Passkey
Funktioniert auf einer gefälschten Seite | - ja, der häufigste Betrugstrick | + nein, nur auf der echten Adresse
Kann bei einem Hackerangriff auf den Dienst gestohlen werden | - ja | + nein, dort liegt nur das Schloss
Kann erraten oder durchprobiert werden | - ja, wenn es zu kurz ist | + nein
Muss man sich merken | - ja | + nein
Wird oft für mehrere Konten benutzt | - leider ja | + nein, jedes Konto hat einen eigenen
```

### Schutz vor gefälschten Seiten
Ein Passkey gehört fest zu einer Internetadresse. Landest du über eine Phishing-Mail auf einer Fälschung, bietet dein Gerät dort einfach keinen Passkey an. Es gibt nichts einzugeben und damit nichts, was Betrüger abgreifen könnten.

```illustration
passkey-phishing
Der Passkey für paypal.com passt nur auf paypal.com, egal wie echt die Fälschung aussieht.
```

## Wo werden Passkeys gespeichert?
```illustration
passkey-geraete
Gespeicherte Passkeys stehen auf allen eigenen Geräten bereit. An fremden Geräten hilft das Handy per QR-Code.
```

| Gerät | Speicherort |
|---|---|
| iPhone, iPad, Mac | iCloud-Schlüsselbund (App „Passwörter“), auf allen Geräten mit derselben Apple-ID |
| Android und Chrome | Google Passwortmanager, auf allen Geräten mit demselben Google-Konto |
| Windows | Windows Hello auf dem PC, zu finden unter Einstellungen > Konten > Passkeys |
| Passwort-Manager | z. B. Bitwarden: auf allen Geräten und Systemen gleichzeitig |

> [!TIPP] Gemischte Geräte
> Wer ein iPhone und einen Windows-PC nutzt, fährt mit einem Passwort-Manager wie Bitwarden am besten. Dann liegen alle Passkeys an einer Stelle und funktionieren überall.

## Passkey einrichten
```ablauf
Sicherheitseinstellungen öffnen | Beim Dienst unter „Sicherheit“ oder „Anmeldung“ nach „Passkey“ suchen
Passkey erstellen | „Passkey erstellen“ oder „hinzufügen“ antippen
Speicherort wählen | Am besten dort, wo er sich auf alle eigenen Geräte überträgt
Bestätigen | Mit Fingerabdruck, Gesicht oder PIN, fertig
```

Beim Google-Konto findest du das zum Beispiel unter **Sicherheit > Passkeys und Sicherheitsschlüssel**. Die Menüs ändern sich gelegentlich, die Suche in den Einstellungen nach „Passkey“ hilft fast immer. Nicht jeder Dienst bietet Passkeys schon an. Eine Übersicht gibt es unter https://passkeys.directory.

## Worauf du achten solltest
- **Gerätesperre ist Pflicht.** Wer dein Handy entsperren kann, kann auch deine Passkeys benutzen. Also eine sichere PIN und das Handy nie entsperrt herumliegen lassen.
- **Geräteverlust einplanen.** Passkeys sollten synchronisiert sein (iCloud, Google oder Passwort-Manager). Liegt ein Passkey nur auf einem einzigen Gerät, ist er mit dem Gerät weg. Dann hilft nur noch die Kontowiederherstellung des Dienstes.
- **Das Konto dahinter gut schützen.** Apple-ID, Google-Konto oder Passwort-Manager verwalten jetzt alle Schlüssel. Sie brauchen ein starkes Passwort und eine Zwei-Faktor-Anmeldung.
- **Das alte Passwort bleibt oft bestehen.** Viele Dienste behalten es als Notfall-Zugang. Dann muss es trotzdem stark und einzigartig sein, denn Betrüger können weiterhin danach fragen. Wo es geht, die Anmeldung per Passwort abschalten.
- **Keine Passkeys auf gemeinsam genutzten Geräten.** Ein Familien-Tablet, das mehrere entsperren können, ist der falsche Ort.

## Häufige Fragen
**Hat Google oder Apple jetzt meinen Fingerabdruck?**
Nein. Der Fingerabdruck wird nur auf dem Gerät selbst geprüft und verlässt es nicht.

**Was passiert, wenn mein Handy kaputtgeht?**
Wenn die Passkeys synchronisiert waren, sind sie auf dem neuen Gerät wieder da, sobald du dich mit demselben Apple-, Google- oder Passwort-Manager-Konto anmeldest. Sonst über die Kontowiederherstellung des jeweiligen Dienstes.

**Kann jemand meinen Passkey abfangen?**
Nein. Übertragen wird nur eine Unterschrift, die für genau eine Anmeldung gilt. Damit kann niemand etwas anfangen.

**Kann ich mich an einem fremden PC anmelden?**
Ja. Auf dem PC „mit einem anderen Gerät anmelden“ wählen, den QR-Code mit dem Handy scannen und dort bestätigen. Das Handy muss dafür in der Nähe sein.

## Für die Kundenberatung
> [!TIPP] In einem Satz erklärt
> „Ein Passkey ist wie ein Haustürschlüssel, der nur in Ihr echtes Schloss passt und Ihr Handy nie verlässt. Selbst wenn Sie auf eine gefälschte Seite geraten, gibt es dort nichts, was man Ihnen abnehmen könnte.“
