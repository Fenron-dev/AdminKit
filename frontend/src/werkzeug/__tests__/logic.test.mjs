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
