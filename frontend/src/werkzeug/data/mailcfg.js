// Mailkonto-Einstellungen gängiger Anbieter (#107). Stand Ende 2026 – Anbieter
// ändern gelegentlich Server oder Anmeldeverfahren; eigene Einträge im Vault
// haben Vorrang. Felder:
//   domains  Adress-Domains (exakt)          mx  Teilstrings im MX-Hostnamen (eigene Domains)
//   imap/pop [host, port, sec]               smtp [[host, port, sec], …]
//   user     Benutzername                    auth 'passwort' | 'app' (App-Passwort) | 'oauth'
//   hints    Hinweise (Markdown inline)      tags Tags
export const SEC = { ssl: 'SSL/TLS', starttls: 'STARTTLS' };
export const AUTH = {
  passwort: 'Normales Kennwort',
  app: 'App-Passwort nötig (bei aktivierter Zwei-Faktor-Anmeldung)',
  oauth: 'Moderne Anmeldung (OAuth) – das Mailprogramm muss sie unterstützen',
};
const FULL = 'Vollständige E-Mail-Adresse';

export const PROVIDERS = [
  { id: 't-online', name: 'Telekom (T-Online)', domains: ['t-online.de', 'magenta.de'], imap: ['secureimap.t-online.de', 993, 'ssl'], pop: ['securepop.t-online.de', 995, 'ssl'],
    smtp: [['securesmtp.t-online.de', 465, 'ssl'], ['securesmtp.t-online.de', 587, 'starttls']], user: FULL, auth: 'passwort', tags: ['Freemail', 'Provider'],
    hints: ['Es wird das **E-Mail-Passwort** benötigt, nicht das Passwort des Telekom-Logins. Es wird im E-Mail Center unter Einstellungen → Passwörter festgelegt.'] },
  { id: 'gmx', name: 'GMX', domains: ['gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch'], imap: ['imap.gmx.net', 993, 'ssl'], pop: ['pop.gmx.net', 995, 'ssl'],
    smtp: [['mail.gmx.net', 465, 'ssl'], ['mail.gmx.net', 587, 'starttls']], user: FULL + ' oder Kundennummer', auth: 'passwort', tags: ['Freemail'],
    hints: ['Abruf per IMAP/POP3 muss im Webmailer freigeschaltet werden: Einstellungen → POP3/IMAP-Abruf → „POP3 und IMAP Zugriff erlauben“.', 'Bei aktivierter Zwei-Faktor-Anmeldung wird ein anwendungsspezifisches Passwort benötigt.'] },
  { id: 'webde', name: 'WEB.DE', domains: ['web.de'], imap: ['imap.web.de', 993, 'ssl'], pop: ['pop3.web.de', 995, 'ssl'],
    smtp: [['smtp.web.de', 587, 'starttls']], user: FULL, auth: 'passwort', tags: ['Freemail'],
    hints: ['Abruf per IMAP/POP3 muss im Webmailer freigeschaltet werden: Einstellungen → POP3/IMAP-Abruf.', 'Bei aktivierter Zwei-Faktor-Anmeldung wird ein anwendungsspezifisches Passwort benötigt.'] },
  { id: 'gmail', name: 'Gmail / Google Workspace', domains: ['gmail.com', 'googlemail.com'], mx: ['google.com', 'googlemail.com'], imap: ['imap.gmail.com', 993, 'ssl'], pop: ['pop.gmail.com', 995, 'ssl'],
    smtp: [['smtp.gmail.com', 465, 'ssl'], ['smtp.gmail.com', 587, 'starttls']], user: FULL, auth: 'app', tags: ['Freemail', 'Google'],
    hints: ['Am besten „Google“ als Kontotyp wählen (Outlook, Apple Mail, Thunderbird) – dann klappt die Anmeldung ohne App-Passwort.', 'Manuell: App-Passwort unter myaccount.google.com → Sicherheit (setzt Bestätigung in zwei Schritten voraus).', 'Bei Google Workspace muss der Administrator IMAP ggf. erst erlauben.'] },
  { id: 'outlookcom', name: 'Outlook.com / Hotmail', domains: ['outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'msn.com'], imap: ['outlook.office365.com', 993, 'ssl'], pop: ['outlook.office365.com', 995, 'ssl'],
    smtp: [['smtp-mail.outlook.com', 587, 'starttls']], user: FULL, auth: 'oauth', tags: ['Freemail', 'Microsoft'],
    hints: ['Microsoft erlaubt für Outlook.com keine Anmeldung mit einfachem Passwort mehr: Das Mailprogramm muss „Microsoft-Konto“/OAuth unterstützen (aktuelles Outlook, Apple Mail, Thunderbird).', 'In Outlook am besten das Konto einfach mit Adresse hinzufügen (automatische Einrichtung).'] },
  { id: 'm365', name: 'Microsoft 365 (Exchange Online)', domains: [], mx: ['mail.protection.outlook.com'], imap: ['outlook.office365.com', 993, 'ssl'], pop: ['outlook.office365.com', 995, 'ssl'],
    smtp: [['smtp.office365.com', 587, 'starttls']], user: FULL, auth: 'oauth', tags: ['Microsoft', 'Firma'],
    hints: ['Empfohlen: als **Exchange/Microsoft 365**-Konto einrichten, nicht IMAP – dann kommen Kalender und Kontakte mit.', 'IMAP/POP/SMTP-Anmeldung muss im Admin Center pro Postfach erlaubt sein; einfache Kennwort-Anmeldung ist abgeschaltet.', 'Scanner/Kopierer: SMTP-Versand über smtp.office365.com braucht „Authentifiziertes SMTP“ für das Postfach oder einen Connector.'] },
  { id: 'icloud', name: 'iCloud Mail', domains: ['icloud.com', 'me.com', 'mac.com'], imap: ['imap.mail.me.com', 993, 'ssl'], pop: null,
    smtp: [['smtp.mail.me.com', 587, 'starttls']], user: 'IMAP: Name vor dem @ (z. B. „max.muster“), SMTP: vollständige Adresse', auth: 'app', tags: ['Freemail', 'Apple'],
    hints: ['Für andere Programme als Apple Mail ist ein **app-spezifisches Passwort** nötig (account.apple.com → Anmelden und Sicherheit).', 'POP3 wird nicht angeboten.'] },
  { id: 'yahoo', name: 'Yahoo Mail', domains: ['yahoo.com', 'yahoo.de', 'ymail.com'], imap: ['imap.mail.yahoo.com', 993, 'ssl'], pop: ['pop.mail.yahoo.com', 995, 'ssl'],
    smtp: [['smtp.mail.yahoo.com', 465, 'ssl'], ['smtp.mail.yahoo.com', 587, 'starttls']], user: FULL, auth: 'app', tags: ['Freemail'],
    hints: ['App-Passwort in den Yahoo-Kontosicherheitseinstellungen erzeugen.'] },
  { id: 'aol', name: 'AOL Mail', domains: ['aol.com', 'aol.de'], imap: ['imap.aol.com', 993, 'ssl'], pop: ['pop.aol.com', 995, 'ssl'],
    smtp: [['smtp.aol.com', 465, 'ssl']], user: FULL, auth: 'app', tags: ['Freemail'],
    hints: ['App-Passwort in den AOL-Kontosicherheitseinstellungen erzeugen.'] },
  { id: 'ionos', name: 'IONOS (1&1)', domains: ['online.de', 'onlinehome.de'], mx: ['ionos.de', 'ionos.com', 'kundenserver.de', 'perfora.net'], imap: ['imap.ionos.de', 993, 'ssl'], pop: ['pop.ionos.de', 995, 'ssl'],
    smtp: [['smtp.ionos.de', 465, 'ssl'], ['smtp.ionos.de', 587, 'starttls']], user: FULL, auth: 'passwort', tags: ['Hoster'],
    hints: ['Passwort ist das des Postfachs (im IONOS-Kundenbereich unter E-Mail änderbar), nicht das Kundenkonto-Passwort.'] },
  { id: 'strato', name: 'STRATO', domains: [], mx: ['rzone.de'], imap: ['imap.strato.de', 993, 'ssl'], pop: ['pop3.strato.de', 995, 'ssl'],
    smtp: [['smtp.strato.de', 465, 'ssl'], ['smtp.strato.de', 587, 'starttls']], user: FULL, auth: 'passwort', tags: ['Hoster'],
    hints: ['Passwort des Postfachs aus dem STRATO-Kundenlogin (E-Mail-Verwaltung).'] },
  { id: 'hetzner', name: 'Hetzner (Webhosting)', domains: [], mx: ['your-server.de'], imap: ['mail.your-server.de', 993, 'ssl'], pop: ['mail.your-server.de', 995, 'ssl'],
    smtp: [['mail.your-server.de', 465, 'ssl'], ['mail.your-server.de', 587, 'starttls']], user: FULL, auth: 'passwort', tags: ['Hoster'], hints: [] },
  { id: 'allinkl', name: 'ALL-INKL.COM', domains: [], mx: ['kasserver.com'], imap: ['(Servername aus dem KAS, z. B. w0123456.kasserver.com)', 993, 'ssl'], pop: ['(wie IMAP)', 995, 'ssl'],
    smtp: [['(wie IMAP)', 465, 'ssl'], ['(wie IMAP)', 587, 'starttls']], user: 'Postfachname (z. B. m0123456) oder vollständige Adresse', auth: 'passwort', tags: ['Hoster'],
    hints: ['Der Servername ist pro Kunde verschieden und steht im KAS unter E-Mail → Postfach → Info.'] },
  { id: 'mailboxorg', name: 'mailbox.org', domains: ['mailbox.org'], mx: ['mailbox.org'], imap: ['imap.mailbox.org', 993, 'ssl'], pop: ['pop3.mailbox.org', 995, 'ssl'],
    smtp: [['smtp.mailbox.org', 465, 'ssl'], ['smtp.mailbox.org', 587, 'starttls']], user: FULL, auth: 'passwort', tags: ['Freemail', 'Datenschutz'], hints: [] },
  { id: 'posteo', name: 'Posteo', domains: ['posteo.de', 'posteo.net', 'posteo.at', 'posteo.ch', 'posteo.eu', 'posteo.org'], imap: ['posteo.de', 993, 'ssl'], pop: ['posteo.de', 995, 'ssl'],
    smtp: [['posteo.de', 465, 'ssl'], ['posteo.de', 587, 'starttls']], user: FULL, auth: 'passwort', tags: ['Datenschutz'], hints: [] },
  { id: 'freenet', name: 'freenet Mail', domains: ['freenet.de'], imap: ['mx.freenet.de', 993, 'ssl'], pop: ['mx.freenet.de', 995, 'ssl'],
    smtp: [['mx.freenet.de', 587, 'starttls']], user: FULL, auth: 'passwort', tags: ['Freemail'],
    hints: ['Abruf über externe Programme muss in den freenet-Mail-Einstellungen aktiviert sein.'] },
];
