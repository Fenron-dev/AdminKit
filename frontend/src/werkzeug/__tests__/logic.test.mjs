// Logik-Tests der Werkzeuge mit festen Beispielen aus dem Portal.
// Ausführen: cd frontend && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { luhnCD, imeiInfo } from '../tools/imei.js';
import { calcNet } from '../tools/net.js';
import { aeOf, rowMin, fmtDur } from '../tools/ae.js';
import { makePassword, makePhrase } from '../tools/pw.js';
import { spellSentence } from '../tools/spell.js';
import { convert } from '../tools/b64.js';
import { transferSeconds, fmtTime, BYT, BPS } from '../tools/units.js';

test('IMEI: Prüfziffer und Varianten', () => {
  assert.equal(luhnCD('49015420323751'), 8);
  assert.equal(imeiInfo('49 015420 323751 8').ok, true);
  const bad = imeiInfo('490154203237519');
  assert.equal(bad.ok, false); assert.equal(bad.expected, 8);
  assert.equal(imeiInfo('49015420323751').d, '490154203237518');
  assert.equal(imeiInfo('3548590314567801').kind, 'IMEISV');
  assert.equal(imeiInfo('12345').ok, false);
});

test('Subnetz: Präfix, Maske, Sonderfälle', () => {
  const r = calcNet('192.168.10.34/26');
  assert.equal(r.net, '192.168.10.0/26'); assert.equal(r.broadcast, '192.168.10.63');
  assert.equal(r.first, '192.168.10.1'); assert.equal(r.last, '192.168.10.62');
  assert.equal(r.hosts, 62); assert.equal(r.kind, 'Privat (RFC 1918)');
  assert.equal(calcNet('10.0.0.5 255.255.255.0').net, '10.0.0.0/24');
  assert.ok(calcNet('10.0.0.5 255.0.255.0').error);
  assert.equal(calcNet('1.2.3.4/31').hosts, 2);
  assert.equal(calcNet('8.8.8.8/32').hosts, 1);
  assert.equal(calcNet('169.254.1.1/16').kind, 'Link-Local (APIPA)');
  assert.equal(calcNet('100.64.0.1/10').kind, 'Carrier-Grade-NAT');
  assert.ok(calcNet('300.1.1.1/24').error);
  assert.ok(calcNet('quatsch').error);
});

test('AE: Rundung inkl. 0 Minuten und über Mitternacht', () => {
  assert.equal(aeOf(0, 10, 'up'), 0);
  assert.equal(aeOf(47, 10, 'up'), 5);
  assert.equal(aeOf(40, 10, 'up'), 4);
  assert.equal(aeOf(44, 10, 'round'), 4);
  assert.equal(aeOf(45, 10, 'round'), 5);
  assert.equal(aeOf(47, 10, 'exact'), 4.7);
  assert.equal(aeOf(47, 15, 'up'), 4);
  assert.ok(Number.isNaN(aeOf(NaN, 10, 'up')));
  assert.equal(rowMin({ s: '09:00', e: '09:47', p: '0' }), 47);
  assert.equal(rowMin({ s: '23:30', e: '00:15', p: '' }), 45);
  assert.equal(rowMin({ s: '09:00', e: '10:00', p: '15' }), 45);
  assert.equal(fmtDur(47), '47 Min.'); assert.equal(fmtDur(125), '2 Std. 5 Min.');
});

test('Passwort: Länge, Zeichenarten, verwechselbare Zeichen', () => {
  for (let i = 0; i < 50; i++) {
    const r = makePassword({ len: 20, up: true, dig: true, sym: true, amb: true });
    assert.equal(r.pw.length, 20);
    assert.match(r.pw, /[a-z]/); assert.match(r.pw, /[A-Z]/); assert.match(r.pw, /\d/); assert.match(r.pw, /[!#$%&*+\-=?@_~.:;]/);
    assert.doesNotMatch(r.pw, /[0O1lIo]/);
  }
  assert.ok(makePassword({ len: 20, up: true, dig: true, sym: true, amb: true }).bits > 100);
});

test('Passphrase: Wortanzahl, Trennzeichen, Wortlisten', () => {
  for (const lang of ['de', 'en']) {
    const L = readFileSync(new URL(`../data/words-${lang}.txt`, import.meta.url), 'utf8').trim().split(/\s+/);
    assert.ok(L.length > 7000, `${lang}: ${L.length} Wörter`);
    assert.ok(L.every(w => /^[a-z]+$/.test(w)), `${lang}: nur a–z ohne Umlaute`);
    const r = makePhrase({ n: 5, sep: '-', cap: true, num: false }, L);
    assert.equal(r.pw.split('-').length, 5);
    assert.ok(r.pw.split('-').every(w => /^[A-Z][a-z]+$/.test(w)));
  }
  const withNum = makePhrase({ n: 4, sep: '.', cap: false, num: true }, ['alpha', 'beta']);
  assert.equal(withNum.pw.split('.').length, 4); assert.match(withNum.pw, /\d{2}/);
});

test('Buchstabieren: Ziffern als „Zwo“, Groß/klein', () => {
  assert.equal(spellSentence('A2', 'din', true), 'groß Aachen, Zwo');
  assert.equal(spellSentence('b', 'classic', true), 'klein Berta');
  assert.equal(spellSentence('ß!', 'nato', false), 'Eszett, Ausrufezeichen');
  assert.equal(spellSentence('2', 'nato', false), 'Two');
});

test('Kodieren: Base64/URL mit Umlauten', () => {
  assert.equal(convert('b64e', 'Grüße'), 'R3LDvMOfZQ==');
  assert.equal(convert('b64d', 'R3LDvMOfZQ=='), 'Grüße');
  assert.equal(convert('b64d', 'R3LDvMOfZQ'), 'Grüße');
  assert.equal(convert('urle', 'a b&c'), 'a%20b%26c');
  assert.equal(convert('urld', 'a+b%26c'), 'a b&c');
  assert.throws(() => convert('urld', '%'));
});

test('Speicher & Tempo: Dauer', () => {
  const s = transferSeconds(50 * BYT.GB, 100 * BPS['Mbit/s'], false);
  assert.equal(Math.round(s), 4000);
  assert.equal(fmtTime(s), '1 Std. 7 Min.');
  assert.equal(fmtTime(0.5), 'unter 1 Sek.');
});

test('WLAN-QR: Sonderzeichen werden maskiert', async () => {
  const { wifiString } = await import('../tools/wifi.js').catch(() => ({}));
  if (!wifiString) return; // qrcode-Paket nur im Vite-Build auflösbar
  assert.equal(wifiString({ enc: 'WPA', ssid: 'Gast;WLAN', pw: 'a:b\\c"d', hidden: false }), 'WIFI:T:WPA;S:Gast\\;WLAN;P:a\\:b\\\\c\\"d;;');
  assert.equal(wifiString({ enc: 'nopass', ssid: 'Offen', pw: 'x', hidden: true }), 'WIFI:T:nopass;S:Offen;H:true;;');
});

test('Prüfsumme: MD5 und Vergleich', async () => {
  const { md5, normHash } = await import('../tools/hash.js').catch(() => ({}));
  if (!md5) return;
  assert.equal(md5(new TextEncoder().encode('abc')), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(md5(new TextEncoder().encode('')), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(normHash(' AB:CD-ef 12 '), 'abcdef12');
});

test('Mail-Diagnose: Beispiele aus dem Portal', async () => {
  const m = await import('../tools/mail.js');
  const b = m.analyzeMail(m.SAMPLE_BOUNCE);
  assert.ok(b.isBounce); assert.match(b.hits[0].t, /DMARC/); assert.deepEqual(b.codes, ['5.7.26']);
  const s = m.analyzeMail(m.SAMPLE_SPAM);
  assert.equal(s.isSpam, true); assert.equal(s.auth.dmarc, 'fail');
  assert.equal(m.regDom('mail.example.co.uk'), 'example.co.uk');
  const h = m.parseHdr('Subject: Hallo\r\n  Welt\r\nFrom: A <a@b.de>');
  assert.equal(h[0].v, 'Hallo Welt'); assert.equal(m.addrOf(h[1].v), 'a@b.de');
});

test('Mail-Diagnose: Absender/Empfänger und Umlaut-Prüfung', async () => {
  const m = await import('../tools/mail.js');
  const b = m.analyzeMail(m.SAMPLE_BOUNCE).parties;
  assert.equal(b.senders[0].addr, 'info@beispiel-kunde.de');
  assert.equal(b.rcpts[0].addr, 'anna.schmidt@gmail.com');
  assert.equal(b.reporter.addr, 'MAILER-DAEMON@mail.beispiel-hosting.de');
  assert.equal(b.rcpts[0].iss[0][0], 'ok');
  const s = m.analyzeMail(m.SAMPLE_SPAM).parties;
  assert.deepEqual(s.senders.map(x => [x.name, x.addr]), [['Shop Sendet', 'info@shop-sendet.example']]);
  const r = m.analyzeMail('From: =?utf-8?Q?J=C3=BCrgen_M=C3=BCller?= <jürgen@müller.de>\nTo: "Meier, Anna" <anna@x.de>, bob@y.de\nCc: Zoë <zoe@xn--mller-kva.de>\nSubject: Test').parties;
  assert.equal(r.senders[0].name, 'Jürgen Müller');
  assert.deepEqual(r.senders[0].iss.map(x => x[0]), ['err', 'warn']);
  assert.match(r.senders[0].iss[1][2], /xn--mller-kva\.de/);
  assert.deepEqual(r.rcpts.map(x => x.addr), ['anna@x.de', 'bob@y.de', 'zoe@xn--mller-kva.de']);
  assert.equal(r.rcpts[0].name, 'Meier, Anna');
  assert.equal(r.rcpts[2].iss[0][0], 'info');
  assert.match(m.analyzeMail('From: MAILER-DAEMON@x.de\nTo: a@b.de\n\n<müller@c.de>: 553 5.6.7 SMTPUTF8 not supported').hits[0].t, /Umlaute/);
});

test('Link-Prüfer: Sonderfälle aus dem Konzept', async () => {
  const { linkCheck, stripUrl } = await import('../tools/link.js');
  const lvl = u => linkCheck(u).lvl;
  assert.equal(lvl('https://paypal.com.google.de/x'), 'err');
  assert.equal(lvl('https://paypal.com.konto-sicherheit.xyz/login?id=1'), 'err');
  assert.equal(lvl('https://contoso.sharepoint.com/sites/x'), 'warn');
  assert.equal(lvl('https://sparkasse-bremen.de/'), 'warn');
  assert.equal(lvl('https://xn--pypal-4ve.com/'), 'err');
  assert.equal(lvl('https://www.paypal.com/de'), 'ok');
  assert.equal(linkCheck('javascript:alert(1)').bad, true);
  assert.equal(linkCheck('https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fpaypal.com.evil.xyz%2F').final, 'https://paypal.com.evil.xyz/');
  assert.equal(stripUrl('https://a.de/p?token=geheim#x'), 'https://a.de/p');
});

test('DNS-Check: Mail-Auswertung mit festen Antworten', async () => {
  const m = await import('../tools/dns.js');
  const zone = {
    'kunde.de|MX': [{ type: 15, data: '10 mx.kunde.de.' }],
    'kunde.de|TXT': [{ type: 16, data: '"v=spf1 mx include:spf.hoster.de ~all"' }],
    'spf.hoster.de|TXT': [{ type: 16, data: '"v=spf1 ip4:1.2.3.0/24 -all"' }],
    '_dmarc.kunde.de|TXT': [{ type: 16, data: '"v=DMARC1; p=none"' }],
    'default._domainkey.kunde.de|TXT': [{ type: 16, data: '"v=DKIM1; k=rsa; p=' + 'A'.repeat(392) + '"' }],
    'mx.kunde.de|A': [{ type: 1, data: '1.2.3.4' }],
    '4.3.2.1.in-addr.arpa|PTR': [{ type: 12, data: 'mx.kunde.de.' }],
  };
  m.setContext({ net: { dns: async (n, t) => ({ Status: 0, Answer: (zone[n + '|' + t] || []).map(a => ({ name: n, TTL: 300, ...a })) }) } });
  const r = await m.mailCheck('kunde.de', '');
  assert.equal(r.mxs[0].h, 'mx.kunde.de');
  const text = r.R.join(' ');
  assert.match(text, /Mailserver \(MX\)/);
  assert.match(text, /SPF vorhanden/); assert.match(text, /2 von maximal 10/);
  assert.match(text, /Richtlinie „none“/);
  assert.match(text, /DKIM gefunden: default/); assert.match(text, /2048 Bit/);
  assert.match(text, /Rückwärtsauflösung \(PTR\)/);
  assert.equal(r.score.err, 0);
  assert.equal(m.txtVal('"v=spf1 " "-all"'), 'v=spf1 -all');
  assert.equal(m.cleanDomain('Max@Kunde.DE'), 'kunde.de');
  assert.equal(m.revName('1.2.3.4'), '4.3.2.1.in-addr.arpa');
});

test('Fehlercodes: Erkennung und Umrechnung', async () => {
  const m = await import('../tools/err.js');
  const t = q => m.lookup(q).flatMap(r => r.hits.map(h => h.t));
  assert.deepEqual(t('0x80070005'), ['Zugriff verweigert']);
  assert.deepEqual(t('80070005'), ['Zugriff verweigert']);
  assert.deepEqual(t('-2147024891'), ['Zugriff verweigert']);
  assert.deepEqual(t('2147942405'), ['Zugriff verweigert']);
  assert.deepEqual(t('Systemfehler 5'), ['Zugriff verweigert']);
  assert.deepEqual(t('5'), ['Zugriff verweigert']);
  assert.deepEqual(t('0x0000007E'), ['SYSTEM_THREAD_EXCEPTION_NOT_HANDLED'], 'Bluescreen vor Win32 126');
  assert.deepEqual(t('Stopcode: CRITICAL_PROCESS_DIED'), ['CRITICAL_PROCESS_DIED']);
  assert.deepEqual(t('Ereignis-ID 41'), ['Unerwartet ausgeschaltet']);
  assert.deepEqual(t('41'), ['Unerwartet ausgeschaltet']);
  assert.deepEqual(t('AADSTS50126: Error validating credentials'), ['Benutzername oder Kennwort falsch']);
  assert.deepEqual(t('-36'), ['Ein-/Ausgabefehler']);
  assert.deepEqual(t('Fehler 0x800f0922 und 0x80070422'), ['Update konnte nicht installiert werden', 'Windows-Update-Dienst deaktiviert', 'Dienst ist deaktiviert']);
  assert.equal(t('valid 5').length, 0, 'kein Treffer in Wörtern');
  const u = m.lookup('0x80071234')[0];
  assert.equal(u.hits.length, 0); assert.equal(u.info.win32, 0x1234); assert.match(u.info.area, /Win32/);
  assert.equal(m.lookup('0x80190194')[0].info.http, 404);
  assert.equal(m.default.match('0x80070005'), true);
  assert.equal(m.default.match('passwort'), false);
  const own = [{ id: 'x', code: '0x80070005', text: 'Bei Kunde X: Avira' }];
  assert.equal(m.lookup('Fehler 0x80070005', own)[0].notes.length, 1);
  assert.equal(m.searchText('konto gesperrt').hits.length >= 2, true);
});

test('Mailkonto-Einstellungen: Domain, MX, Text', async () => {
  const m = await import('../tools/mailcfg.js');
  const { PROVIDERS } = await import('../data/mailcfg.js');
  assert.equal(m.cleanDomain(' Max.Muster@T-Online.de '), 't-online.de');
  assert.equal(m.byDomain('gmx.net', PROVIDERS)[0].id, 'gmx');
  assert.equal(m.byDomain('kunde.de', PROVIDERS).length, 0);
  assert.deepEqual(m.mxHosts([{ type: 15, data: '10 mx00.ionos.de.' }, { type: 5, data: 'x' }]), ['mx00.ionos.de']);
  assert.equal(m.byMx(['mx00.ionos.de'], PROVIDERS)[0].id, 'ionos');
  assert.equal(m.byMx(['kunde-de.mail.protection.outlook.com'], PROVIDERS)[0].id, 'm365');
  assert.equal(m.byMx(['smtpin.rzone.de'], PROVIDERS)[0].id, 'strato');
  assert.equal(m.byMx(['evilionos.de'], PROVIDERS).length, 0, 'nur ganze Namensteile');
  assert.equal(m.byText('apple', PROVIDERS)[0].id, 'icloud');
  for (const p of PROVIDERS) { assert.ok(p.smtp.length, p.id); for (const s of [p.imap, p.pop, ...p.smtp].filter(Boolean)) assert.ok([465, 587, 993, 995].includes(s[1]), p.id + ' Port'); }
  const mail = await import('../tools/mail.js');
  const r = mail.analyzeMail('From: MAILER-DAEMON@x.de\nTo: chef@kunde.de\n\n<a@b.de>: 530 5.7.0 Authentication required');
  assert.equal(r.hits[0].cfg, true);
});

test('Zeitstempel: Formate erkennen und umrechnen', async () => {
  const m = await import('../tools/time.js');
  assert.equal(m.parseTime('116444736000000000').ms, 0);
  assert.equal(m.parseTime('1700000000').ms, 1700000000000);
  assert.equal(m.parseTime('1700000000123').ms, 1700000000123);
  assert.equal(m.toFiletime(0), '116444736000000000');
  assert.equal(m.parseTime(m.toFiletime(1767225600000)).ms, 1767225600000);
  assert.equal(m.parseTime('0x019DB1DED53E8000').ms, 0);
  assert.equal(m.parseTime('9223372036854775807').never, true);
  assert.equal(m.parseTime('0').never, true);
  assert.equal(m.parseTime('2026-11-23T14:30:00Z').ms, Date.UTC(2026, 10, 23, 14, 30));
  assert.equal(m.parseTime('Mon, 23 Nov 2026 15:30:00 +0100').ms, Date.UTC(2026, 10, 23, 14, 30));
  assert.equal(m.parseTime('23.11.2026 14:30').ms, new Date(2026, 10, 23, 14, 30).getTime());
  assert.ok(m.parseTime('31.02.2026').error);
  const x = m.parseTime('45000');
  assert.equal(new Date(x.ms).getDate(), 15); assert.equal(new Date(x.ms).getMonth(), 2);
  assert.equal(m.toExcel(new Date(2023, 2, 15, 12).getTime()), 45000.5);
  assert.equal(m.isoWeek(Date.UTC(2026, 0, 1)), 1);
  assert.equal(m.isoWeek(Date.UTC(2027, 0, 1)), 53);
  assert.equal(m.duration(90061000), '1 Tag 1 Std. 1 Min. 1 Sek.');
  assert.ok(m.parseTime('hallo').error);
});

test('Listen-Werkzeug: Trennen, Bereinigen, Adressen, CSV', async () => {
  const m = await import('../tools/list.js');
  assert.equal(m.detectSep('a\nb'), 'line'); assert.equal(m.detectSep('a; b'), 'semi'); assert.equal(m.detectSep('a,b'), 'comma');
  const r = m.processList(m.splitItems(' b \n\nA\na\nc10\nc9\n'), { sort: 'asc' });
  assert.deepEqual(r.items, ['A', 'b', 'c9', 'c10']); assert.equal(r.dupes, 1); assert.equal(r.empty, 2);
  assert.equal(m.processList(['A', 'a'], { caseSens: true }).items.length, 2);
  assert.deepEqual(m.extractEmails('Max <max@firma.de>; anna.b@x.co.uk, mailto:info@kunde.de. Telefon 0123'), ['max@firma.de', 'anna.b@x.co.uk', 'info@kunde.de']);
  const rows = m.parseCSV('Name;Mail\n"Meier; Anna";anna@x.de\n"Er sagt ""Hi""";b@y.de\n', m.detectCsvDelim('Name;Mail'));
  assert.deepEqual(rows, [['Name', 'Mail'], ['Meier; Anna', 'anna@x.de'], ['Er sagt "Hi"', 'b@y.de']]);
  assert.equal(m.detectCsvDelim('a,b,c'), ',');
});

test('QR-Codes: Inhalte richtig aufgebaut', async () => {
  const m = await import('../tools/qr.js');
  assert.equal(m.qrPayload('url', { url: 'firma.de/hilfe' }), 'https://firma.de/hilfe');
  assert.equal(m.qrPayload('url', { url: 'http://x.de' }), 'http://x.de');
  assert.equal(m.qrPayload('tel', { tel: '+49 (0) 30 / 123-45' }), 'tel:+490301234' + '5');
  assert.equal(m.qrPayload('sms', { tel: '0170 1', msg: 'Hallo' }), 'SMSTO:01701:Hallo');
  assert.equal(m.qrPayload('mail', { mail: 'a@b.de', subject: 'Hilfe & mehr' }), 'mailto:a@b.de?subject=Hilfe%20%26%20mehr');
  const v = m.qrPayload('vcard', { fn: 'Anna', ln: 'Meier; Jr.', org: 'Firma, GmbH', tel: '030 1', mail: 'a@b.de' });
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\nN:Meier\\; Jr\.;Anna;;;\r\nFN:Anna Meier\\; Jr\.\r\nORG:Firma\\, GmbH/);
  assert.match(v, /TEL;TYPE=WORK,VOICE:0301\r\n/); assert.match(v, /END:VCARD$/);
  assert.equal(m.qrPayload('vcard', {}), '');
});

test('Garantie: Hersteller raten, Adressen füllen', async () => {
  const m = await import('../tools/warranty.js');
  assert.equal(m.guessVendor('Dell Inc.', ''), 'dell');
  assert.equal(m.guessVendor('Hewlett-Packard', ''), 'hp');
  assert.equal(m.guessVendor('LENOVO', ''), 'lenovo');
  assert.equal(m.guessVendor('', 'ABC1D23'), 'dell');
  assert.equal(m.guessVendor('', 'C02XYZ'), '');
  assert.equal(m.fillUrl('https://x/{serial}/o', ' AB 1 '), 'https://x/AB%201/o');
  for (const v of m.VENDORS) for (const [, u] of v.links) assert.match(u, /^https:\/\//);
});

test('Router-Zugänge: Adressen', async () => {
  const m = await import('../tools/router.js');
  assert.equal(m.openable('http://fritz.box'), true);
  assert.equal(m.openable('http://<IP>:5000'), false);
  for (const d of m.DEVICES) { assert.ok(d.addr.length, d.id); assert.doesNotMatch(d.pw, /\b(admin\/admin|password: )/i); }
});

test('Zertifikat & Port: Eingaben und Bewertung', async () => {
  const m = await import('../tools/certport.js');
  assert.deepEqual(m.parseTarget('https://Www.Kunde.de:8443/pfad?x', 443), { host: 'www.kunde.de', port: 8443 });
  assert.deepEqual(m.parseTarget('mail.x.de', 993), { host: 'mail.x.de', port: 993 });
  assert.deepEqual(m.parseTarget('[fe80::1]:22', 443), { host: 'fe80::1', port: 22 });
  assert.deepEqual(m.parsePorts('443, 3389;3389 99999 abc 22'), [443, 3389, 22]);
  const ok = { chain: [{}], days_left: 80, hostname_ok: true, trusted: true, tls_version: 'TLS 1.3' };
  assert.equal(m.certVerdict(ok)[0], 'ok');
  assert.equal(m.certVerdict({ ...ok, days_left: 5 })[0], 'warn');
  assert.equal(m.certVerdict({ ...ok, days_left: -1 })[0], 'err');
  assert.equal(m.certVerdict({ ...ok, trusted: false })[0], 'err');
  assert.equal(m.certVerdict({ ...ok, tls_version: 'TLS 1.0' })[0], 'warn');
  assert.equal(m.certVerdict({ error: 'x' })[0], 'err');
});

test('Wake-on-LAN: Eingaben', async () => {
  const m = await import('../tools/wol.js');
  assert.equal(m.normMac('00-11-22-aa-bb-cc'), '00:11:22:AA:BB:CC');
  assert.equal(m.normMac('0011.22aa.bbcc'), '00:11:22:AA:BB:CC');
  assert.equal(m.normMac('00:11:22'), '');
  assert.equal(m.isBroadcast(''), true); assert.equal(m.isBroadcast('192.168.178.255'), true); assert.equal(m.isBroadcast('300.1.1.1'), false);
});

test('Geräte-Erkennung: MAC, Hersteller, Hinweise', async () => {
  const m = await import('../tools/macinfo.js');
  const { V, O } = await import('../data/oui.js');
  const map = m.buildOui(V, O);
  assert.ok(map.size > 30000);
  assert.deepEqual(m.extractMacs('? (192.168.178.1) at 3c:a6:2f:1:2:3 on en0\n 192.168.0.5  00-1b-21-aa-bb-cc dynamisch\n0011.2233.4455'), ['3C:A6:2F:01:02:03', '00:1B:21:AA:BB:CC', '00:11:22:33:44:55']);
  assert.match(m.identify('3C:A6:2F:01:02:03', map).vendor, /^AVM/);
  assert.match(m.identify('3C:A6:2F:01:02:03', map).hint.text, /Netzwerkgerät/);
  assert.match(m.identify('DA:A1:19:00:00:01', map).hint.text, /Private/);
  assert.match(m.identify('00:15:5D:00:00:01', map).vendor, /Hyper-V/);
  assert.match(m.identify('00:1B:21:AA:BB:CC', map).hint.text, /Netzwerkchip/);
  assert.equal(m.guessFromProbe({ open_ports: [80, 9100] }), 'Drucker');
  assert.equal(m.guessFromProbe({ open_ports: [62078] }), 'iPhone oder iPad');
  assert.equal(m.guessFromProbe({ names: [{ name: 'Galaxy-S21-FE.fritz.box' }] }), 'Android-Smartphone oder -Tablet');
  assert.equal(m.guessFromProbe({ open_ports: [3389, 445] }), 'Windows-PC (Remotedesktop aktiv)');
});

test('Befehle: Platzhalter, Auswertung, Daten', async () => {
  const e = await import('../tools/cmdeval.js');
  const { COMMANDS } = await import('../data/commands.js');
  assert.deepEqual(e.placeholders('ping -n 4 {Ziel|8.8.8.8} {Ziel}'), [{ name: 'Ziel', def: '8.8.8.8' }]);
  assert.equal(e.fillCommand('ping {Ziel|8.8.8.8}', {}), 'ping 8.8.8.8');
  assert.equal(e.fillCommand('ping {Ziel|8.8.8.8}', { Ziel: 'drucker.fritz.box' }), 'ping drucker.fritz.box');
  assert.throws(() => e.fillCommand('ping {Ziel}', { Ziel: 'x & del c:' }));
  assert.throws(() => e.fillCommand('ping {Ziel}', { Ziel: '' }));
  const lv = (ev, o) => e.EVAL[ev](o).map(x => x.level);
  assert.deepEqual(lv('ping', 'Pakete: Gesendet = 4, Empfangen = 4, Verloren = 0\n(0% Verlust),\nMinimum = 9ms, Maximum = 12ms, Mittelwert = 10ms'), ['ok', 'ok']);
  assert.deepEqual(lv('ping', '4 packets transmitted, 2 packets received, 50.0% packet loss\nround-trip min/avg/max/stddev = 10.1/180.5/300/2 ms'), ['warn', 'err']);
  assert.deepEqual(lv('ping', 'Ping-Anforderung konnte Host "xy" nicht finden.'), ['err']);
  assert.equal(lv('ipconfig', '   Autokonfiguration IPv4-Adresse  . : 169.254.12.3(Bevorzugt)')[0], 'err');
  assert.equal(lv('ipconfig', '   IPv4-Adresse  . . . . . . . . . . : 192.168.178.20(Bevorzugt)\n   Standardgateway . . . . . . . . . : 192.168.178.1\n   DNS-Server  . . . . . . . . . . . : 192.168.178.1')[0], 'ok');
  assert.deepEqual(lv('sfc', 'Der Windows-Ressourcenschutz hat keine Integritätsverletzungen gefunden.'), ['ok']);
  assert.deepEqual(lv('sfc', 'Windows Resource Protection found corrupt files but was unable to fix some of them.'), ['err']);
  assert.deepEqual(lv('dism', 'Fehler: 0x800f081f\nDie Quelldateien wurden nicht gefunden.'), ['err']);
  assert.deepEqual(lv('wlan', '    Status                 : Verbunden\n    Signal                 : 45%\n    Kanal                  : 36'), ['err', 'info']);
  assert.deepEqual(lv('w32tm', 'Quelle: Local CMOS Clock'), ['warn']);
  assert.deepEqual(lv('crypt', 'Schutzstatus: Der Schutz ist aktiviert.\nSchutzstatus: Der Schutz ist deaktiviert.'), ['ok', 'warn']);
  assert.deepEqual(lv('tracert', '  1    <1 ms  192.168.178.1\n  2     *        *        *     Zeitüberschreitung der Anforderung.\n  3     *        *        *     Zeitüberschreitung der Anforderung.\n  4     *        *        *     Zeitüberschreitung der Anforderung.'), ['warn']);
  assert.deepEqual(e.evalRules('Verlust = 25%', [{ when: 'number', pattern: 'Verlust = (\\d+)%', op: '>', value: '0', level: 'warn', text: '{wert} % Verlust' }]), [{ level: 'warn', title: '25 % Verlust', text: '' }]);
  assert.equal(e.evalRules('ok', [{ when: 'missing', pattern: 'Reply', level: 'err', text: 'x' }])[0].level, 'err');
  assert.equal(e.evaluate({ ev: 'sfc' }, { output: '', exit_code: 5 })[0].level, 'warn');
  const ids = new Set();
  for (const c of COMMANDS) {
    assert.ok(!ids.has(c.id), 'doppelte ID ' + c.id); ids.add(c.id);
    assert.ok(Object.keys(c.v).length, c.id);
    if (c.change) assert.ok(c.impact, c.id + ' ohne Auswirkungen');
    if (c.ev) assert.ok(e.EVAL[c.ev], c.id + ' Auswerter fehlt');
    for (const v of Object.values(c.v)) if (c.kind === 'open') assert.ok(v.target, c.id); else assert.ok(v.cmd, c.id);
  }
});

test('Wiki-Markdown: Medien, Videos, Plattform, Knöpfe, Konsole', async () => {
  const m = await import('../markdown.js');
  m.setMediaBase('drucker');
  assert.match(m.md('![[clip.mp4|Demo]]'), /<video controls preload="metadata" src="\/vaultmedia\/wiki\/_medien\/drucker\/clip\.mp4"><\/video><figcaption>Demo/);
  assert.match(m.md('![[ton.m4a]]'), /<audio controls/);
  assert.match(m.md('![[anim.gif]]'), /<img src="\/vaultmedia\/wiki\/_medien\/drucker\/anim\.gif"/);
  assert.match(m.md('![[anleitung.pdf]]'), /data-media="_medien\/drucker\/anleitung\.pdf"/);
  assert.match(m.md('![[../../config.yaml]]'), /nicht gefunden/);
  assert.equal(m.videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42').src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42');
  assert.equal(m.videoEmbedUrl('https://vimeo.com/12345').site, 'Vimeo');
  assert.equal(m.videoEmbedUrl('https://example.com/x'), null);
  assert.match(m.md('https://youtu.be/dQw4w9WgXcQ'), /data-embed="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
  assert.doesNotMatch(m.md('https://youtu.be/dQw4w9WgXcQ'), /<iframe/, 'erst nach Klick laden');
  const g = m.md('> [!WINDOWS] W\n> a\n\n> [!MACOS] M\n> b\n\n> [!TIPP]\n> c');
  assert.equal((g.match(/class="os-group"/g) || []).length, 1, 'Windows und macOS in einer Gruppe');
  assert.match(g, /callout tip/);
  const b = m.md('[[run:ping?Ziel=1.1.1.1|Pingen]] [[open:devmgmt.msc|Geräte-Manager]] [[cmd:mac:ifconfig|IP]] `[[run:x]]`');
  assert.match(b, /data-act="run" data-arg="ping\?Ziel=1\.1\.1\.1">.*Pingen<\/button>/);
  assert.match(b, /data-act="open" data-arg="devmgmt\.msc">.*Geräte-Manager/);
  assert.match(b, /data-act="cmd" data-arg="mac:ifconfig" data-os="macos"/);
  assert.match(b, /<code>\[\[run:x\]\]<\/code>/, 'in Code bleibt Text');
  assert.match(m.md('[[cmd:echo "<x>" & del|Böse]]'), /data-arg="echo &quot;&lt;x&gt;&quot; &amp; del"/, 'Attribut maskiert');
  const lng = m.md('```console\n' + Array.from({ length: 25 }, (_, i) => 'Zeile ' + i).join('\n') + '\n```');
  assert.match(lng, /<details class="code md-console">.*25 Zeilen/s);
});

test('Aufnahme: Zuschnitt-Fragment, Formen', async () => {
  const r = await import('../capture-util.js');
  assert.equal(r.trimFragment(0, 30, 30), '');
  assert.equal(r.trimFragment(2.04, 30, 30), '#t=2');
  assert.equal(r.trimFragment(2, 12.36, 30), '#t=2,12.4');
  assert.equal(r.pickMime(t => t === 'video/webm'), 'video/webm');
  assert.equal(r.pickMime(() => false), '');
  const a = await import('../annotate.js');
  assert.deepEqual(a.norm({ x1: 50, y1: 40, x2: 10, y2: 60 }), { x: 10, y: 40, w: 40, h: 20 });
});

test('Abläufe: Schritte lesen, Protokoll erzeugen', async () => {
  const r = await import('../runbook-util.js');
  let p = r.parseSteps('Einleitung\n\n## 1. Netzwerk prüfen\n[[run:ipconfig|IP]]\n```bash\n## kein Schritt\n```\n## Drucker\nText');
  assert.equal(p.intro, 'Einleitung');
  assert.deepEqual(p.steps.map(s => s.title), ['Netzwerk prüfen', 'Drucker']);
  assert.match(p.steps[0].body, /## kein Schritt/);
  p = r.parseSteps('### A\nx\n### B');
  assert.deepEqual(p.steps.map(s => s.title), ['A', 'B']);
  p = r.parseSteps('Vorab\n- [ ] Backup\n- [x] Updates\n- normal');
  assert.deepEqual(p.steps.map(s => s.title), ['Backup', 'Updates']);
  assert.equal(r.parseSteps('nur Text').steps.length, 1);
  assert.equal(r.fmtDuration(95 * 60000), '1 Std. 35 Min.');
  const md = r.buildProtocol({ template: 'pc', templateTitle: 'Neuer PC', customer: 'Müller', os: 'windows', started: Date.UTC(2026, 10, 23, 9), finished: Date.UTC(2026, 10, 23, 10, 30),
    steps: [{ title: 'Netzwerk', done: true, notes: 'ok', media: ['![[a.mp4]]'], outputs: [{ name: 'IP', command: 'ipconfig', output: 'x', evals: [{ level: 'ok', title: 'IPv4' }] }] }, { title: 'Drucker', done: false }] });
  assert.match(md, /1 von 2 Schritten/); assert.match(md, /\[Neuer PC\]\(#\/wiki\/a\/pc\)/); assert.match(md, /Dauer: 1 Std\. 30 Min\./);
  assert.match(md, /## ✓ 1\. Netzwerk/); assert.match(md, /## ○ 2\. Drucker/); assert.match(md, /!\[\[a\.mp4\]\]/); assert.match(md, /✓ IPv4/); assert.match(md, /```console\nx\n```/);
  assert.equal(r.clipOutput('a'.repeat(30000)).length < 21000, true);
});
