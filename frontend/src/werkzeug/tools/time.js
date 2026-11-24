// Zeitstempel-Umrechner (#113): Unix (s/ms), Windows-FILETIME bzw. AD-Zeitstempel
// (lastLogonTimestamp, pwdLastSet, accountExpires), ISO 8601, Mail-Header (RFC 2822),
// deutsches Datum und Excel-Seriennummer → alle Formate, Zeitzonen, Differenz.
import { $, esc, ic } from '../ui.js';

// Kein BigInt-Literal (123n): das Build-Ziel (Safari 13) kennt sie nicht
const B = BigInt, EPOCH_DIFF = B('11644473600000'); // ms zwischen 1601-01-01 und 1970-01-01
const N0 = B(0), NMAX = B('9223372036854775807'), N10K = B(10000), NLIM = B('8640000000000000');
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
// Excel-Seriennummer ist Ortszeit ohne Zeitzone → als Ortszeit dieses Rechners lesen
const excelMs = v => { const u = new Date(EXCEL_EPOCH + Math.round(v * 86400000)); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds()).getTime(); };
export const ZONES = [['Europe/Berlin', 'Deutschland'], ['UTC', 'UTC'], ['Europe/London', 'London'], ['America/New_York', 'New York'], ['America/Los_Angeles', 'Los Angeles'], ['Asia/Kolkata', 'Indien'], ['Asia/Shanghai', 'China'], ['Asia/Tokyo', 'Tokio'], ['Australia/Sydney', 'Sydney']];

// Erkennt das Format und liefert { ms, kind } oder { never|error }
export function parseTime(input, now = Date.now()) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^(jetzt|now|heute)$/i.test(s)) return { ms: now, kind: 'Jetzt' };
  let m;
  if ((m = s.match(/^0x([0-9a-f]{15,16})$/i))) return fromFiletime(BigInt('0x' + m[1]), 'FILETIME (hex)');
  if (/^-?\d+$/.test(s)) {
    const n = BigInt(s), len = s.replace('-', '').length;
    if (n === N0 || n === NMAX) return { never: true, kind: 'AD-Zeitstempel', note: n === N0 ? '0 = nie (bzw. „Kennwort muss bei nächster Anmeldung geändert werden“ bei pwdLastSet)' : '9223372036854775807 = läuft nie ab' };
    if (len >= 17 && len <= 19) return fromFiletime(n, 'Windows-FILETIME / AD-Zeitstempel');
    if (len >= 12 && len <= 14) return { ms: Number(n), kind: 'Unix-Zeit in Millisekunden' };
    if (len >= 9 && len <= 11) return { ms: Number(n) * 1000, kind: 'Unix-Zeit in Sekunden' };
    if (len <= 7 && n > N0 && n < B(2958466)) return { ms: excelMs(Number(n)), kind: 'Excel-Datum (Seriennummer)', local: true };
    return { error: 'Zahl passt zu keinem bekannten Format' };
  }
  if ((m = s.match(/^(\d{1,7})[.,](\d+)$/))) { const v = parseFloat(m[1] + '.' + m[2]); if (v > 0 && v < 2958466) return { ms: excelMs(v), kind: 'Excel-Datum mit Uhrzeit', local: true }; }
  // Deutsches Datum: 23.11.2026 [14:30[:15]]
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
    let y = +m[3]; if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if (d.getMonth() !== +m[2] - 1) return { error: 'Ungültiges Datum' };
    return { ms: d.getTime(), kind: 'Datum (deutsch, Ortszeit)' };
  }
  // ISO 8601, RFC 2822 (Mail-Header), englische Schreibweisen
  const t = Date.parse(s.replace(/\s*\([^)]*\)\s*$/, ''));
  if (!isNaN(t)) return { ms: t, kind: /^\d{4}-\d{2}-\d{2}/.test(s) ? 'ISO 8601' : /^[A-Z][a-z]{2},? /.test(s) ? 'Mail-Header (RFC 2822)' : 'Datumstext' };
  return { error: 'Format nicht erkannt' };
}

function fromFiletime(n, kind) {
  const ms = n / N10K - EPOCH_DIFF;
  if (ms < -NLIM || ms > NLIM) return { error: 'Wert außerhalb des Datumsbereichs' };
  return { ms: Number(ms), kind };
}

export const toFiletime = ms => ((BigInt(Math.round(ms)) + EPOCH_DIFF) * N10K).toString();
export const toExcel = ms => {
  // Excel rechnet in Ortszeit ohne Zeitzone
  const d = new Date(ms), loc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return Math.round((loc - EXCEL_EPOCH) / 864) / 100000;
};
export function isoWeek(ms) {
  const d = new Date(ms), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}
export function duration(ms) {
  const a = Math.abs(ms), s = Math.floor(a / 1000), parts = [];
  const D = Math.floor(s / 86400), H = Math.floor(s % 86400 / 3600), M = Math.floor(s % 3600 / 60), S = s % 60;
  if (D) parts.push(D + (D === 1 ? ' Tag' : ' Tage')); if (H) parts.push(H + ' Std.'); if (M) parts.push(M + ' Min.'); if (S || !parts.length) parts.push(S + ' Sek.');
  return parts.join(' ');
}
export const relative = (ms, now = Date.now()) => { const d = ms - now; return Math.abs(d) < 1000 ? 'jetzt' : (d < 0 ? 'vor ' : 'in ') + duration(d); };

const fmt = (ms, tz) => new Date(ms).toLocaleString('de-DE', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
let lastA = '', lastB = '';

export default {
  id: 'time', name: 'Zeitstempel', group: 'Text & Daten', icon: 'clock', tags: ['Zeit', 'Logs', 'Active Directory', 'Umrechnen'],
  keys: 'zeitstempel timestamp unix epoch filetime lastlogon lastlogontimestamp pwdlastset accountexpires ad excel datum uhrzeit zeitzone utc differenz', online: false,
  render(p, ctx) {
    p.innerHTML = `<div class="util wide"><h3>Zeitstempel</h3><p>Zeitstempel aus Logs, Active Directory, Mail-Headern oder Excel einfügen. Das Format wird erkannt und in alle anderen umgerechnet.</p>
      <div class="row"><label class="field" style="flex:1"><span>Zeitpunkt</span><input class="input mono" id="tsA" value="${esc(lastA)}" placeholder="1763905200, 133769000000000000, 2026-11-23T14:30:00Z, 23.11.2026 14:30, jetzt" spellcheck="false"></label>
      <button class="btn ghost" type="button" id="tsNow">Jetzt</button></div>
      <div id="tsOut" aria-live="polite"></div>
      <details class="howto"><summary>${ic('clock')}Differenz zu einem zweiten Zeitpunkt</summary><div class="howto-b">
        <label class="field"><span>Zweiter Zeitpunkt</span><input class="input mono" id="tsB" value="${esc(lastB)}" placeholder="z. B. 24.11.2026 08:00" spellcheck="false"></label><div id="tsDiff"></div></div></details></div>`;
    const a = $('#tsA', p), b = $('#tsB', p), out = $('#tsOut', p), diff = $('#tsDiff', p);
    const row = (k, v, copy = true) => `<dt>${k}</dt><dd>${esc(v)}${copy ? ` <button class="icon-btn copy" type="button" data-copy="${esc(v)}" title="Kopieren">${ic('copy')}</button>` : ''}</dd>`;
    const run = () => {
      lastA = a.value; lastB = b.value;
      const r = parseTime(a.value);
      if (!r) { out.innerHTML = ''; diff.innerHTML = ''; return; }
      if (r.error) { out.innerHTML = `<div class="chk warn"><div><strong>${esc(r.error)}</strong><div class="chk-b">Unterstützt: Unix-Zeit (Sekunden/Millisekunden), Windows-FILETIME/AD (17–18 Ziffern), ISO 8601, Mail-Header-Datum, 23.11.2026 14:30, Excel-Seriennummer.</div></div></div>`; return; }
      if (r.never) { out.innerHTML = `<div class="chk info"><div><strong>${esc(r.kind)}: kein Datum</strong><div class="chk-b">${esc(r.note)}</div></div></div>`; return; }
      const d = new Date(r.ms), ms = r.ms;
      out.innerHTML = `<div class="sub"><h5>Erkannt: ${esc(r.kind)} <small>${esc(relative(ms))}</small></h5><dl class="kv ts-kv">
        ${row('Ortszeit', fmt(ms))}${row('UTC', fmt(ms, 'UTC'))}${row('ISO 8601 (UTC)', d.toISOString())}
        ${row('Unix (Sekunden)', String(Math.floor(ms / 1000)))}${row('Unix (Millisekunden)', String(ms))}${row('Windows-FILETIME / AD', toFiletime(ms))}
        ${row('Excel', String(toExcel(ms)).replace('.', ','))}${row('Kalenderwoche', 'KW ' + isoWeek(ms) + ' / ' + d.getFullYear(), false)}</dl>
        ${r.local ? '<p class="note">Excel speichert Ortszeit ohne Zeitzone; angenommen wird die Zeitzone dieses Rechners.</p>' : ''}
        <div class="table"><table class="mc-t ts-z"><thead><tr><th>Zeitzone</th><th>Uhrzeit</th></tr></thead><tbody>${ZONES.map(([z, l]) => `<tr><th>${esc(l)}</th><td class="mono">${esc(fmt(ms, z))}</td></tr>`).join('')}</tbody></table></div></div>`;
      const rb = parseTime(b.value);
      diff.innerHTML = rb && rb.ms != null ? `<dl class="kv"><dt>Abstand</dt><dd>${esc(duration(rb.ms - ms))}</dd><dt>in Minuten</dt><dd>${Math.round((rb.ms - ms) / 60000)}</dd><dt>in Stunden</dt><dd>${(Math.round((rb.ms - ms) / 36000) / 100).toLocaleString('de-DE')}</dd></dl>` : '';
    };
    a.addEventListener('input', run); b.addEventListener('input', run);
    $('#tsNow', p).onclick = () => { a.value = String(Math.floor(Date.now() / 1000)); run(); };
    run();
  },
};
