---
titel: "Neue Domain in Plesk anlegen"
kategorie: "Hosting"
tags: ["plesk", "domain", "ssl", "dns"]
autor: "Team"
revision: 2
---
So legst du eine neue Kundendomain im [Hosting Interface](https://hosting01.ideler.host:8443/) an.

```ablauf
Domain anlegen | Websites & Domains, Domain hinzufügen
DNS umstellen | Domain muss auf unseren Server zeigen
Zertifikat ausstellen | Let's Encrypt unter SSL/TLS-Zertifikate
Postfächer anlegen | Zugangsdaten per Share Secret weitergeben
Abschluss | Test und Eintrag im CRM
```

## Ablauf im Detail
1. In Plesk **Websites & Domains** öffnen und **Domain hinzufügen** wählen.
2. Den passenden Kunden bzw. das Abonnement auswählen.
3. Domainnamen eintragen und die Hosting-Art festlegen.
4. Unter **SSL/TLS-Zertifikate** ein Let's-Encrypt-Zertifikat ausstellen, sobald die DNS-Einträge auf den Server zeigen.
5. Postfächer anlegen und Zugangsdaten über Share Secret an den Kunden geben.

## DNS prüfen
Bevor das Zertifikat ausgestellt werden kann, muss die Domain auf den Server zeigen. Am schnellsten geht das mit **DNS & Mail-Check** im Werkzeugkasten, oder in der Kommandozeile:

```bash
nslookup beispiel.de
nslookup -type=mx beispiel.de
```

> [!TIPP]
> DNS-Änderungen brauchen je nach TTL eine Weile. Wenn das Zertifikat nicht ausgestellt wird, lohnt sich zuerst ein Blick auf die TTL des alten Eintrags.

## Abschluss
- [ ] Webseite unter `https://` erreichbar
- [ ] Mailversand und -empfang getestet, Mail-Check zeigt SPF, DKIM und DMARC
- [ ] Domain im CRM beim Kunden hinterlegt
