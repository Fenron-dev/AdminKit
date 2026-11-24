// Listen-Werkzeug (#114): Listen bereinigen (Leerzeilen, Duplikate, Sortieren),
// Trennzeichen umstellen, E-Mail-Adressen aus Text ziehen (mit Umlaut-Prüfung
// aus der Mail-Diagnose) und Spalten aus CSV wählen. Alles lokal.
import { $, esc, ic } from '../ui.js';
import { checkAddr } from './mail.js';

export const SEPS = { auto: 'Automatisch', line: 'Zeilenumbruch', comma: 'Komma', semi: 'Semikolon', tab: 'Tabulator', space: 'Leerzeichen' };
const SEP_RE = { line: /\r?\n/, comma: /,/, semi: /;/, tab: /\t/, space: /\s+/ };
export const JOINS = { line: ['Eine pro Zeile', '\n'], comma: ['Komma', ', '], semi: ['Semikolon (Outlook)', '; '], tab: ['Tabulator (Excel)', '\t'], space: ['Leerzeichen', ' '] };

export function detectSep(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length > 1) return 'line';
  const l = lines[0] || '';
  if (l.includes(';')) return 'semi';
  if (l.includes('\t')) return 'tab';
  if (l.includes(',')) return 'comma';
  return 'space';
}
export function splitItems(text, sep = 'auto') {
  const s = sep === 'auto' ? detectSep(text) : sep;
  return String(text).split(SEP_RE[s] || SEP_RE.line);
}

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
export function processList(items, o = {}) {
  let L = items.map(x => o.trim !== false ? x.trim() : x);
  const total = L.length;
  if (o.empty !== false) L = L.filter(x => x.trim());
  const afterEmpty = L.length;
  if (o.lower) L = L.map(x => x.toLowerCase());
  if (o.dedupe !== false) { const seen = new Set(); L = L.filter(x => { const k = o.caseSens ? x : x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }
  if (o.sort === 'asc') L.sort(collator.compare); else if (o.sort === 'desc') L.sort((a, b) => collator.compare(b, a));
  return { items: L, total, empty: total - afterEmpty, dupes: afterEmpty - L.length };
}

export function extractEmails(text) {
  return [...String(text).matchAll(/[^\s<>()"',;:\[\]]+@[^\s<>()"',;:\[\]]+\.[^\s<>()"',;:\[\].]{2,}/g)].map(m => m[0].replace(/^mailto:/i, '').replace(/[.]+$/, ''));
}

export function detectCsvDelim(text) {
  const first = String(text).split(/\r?\n/)[0] || '';
  const c = { ';': 0, ',': 0, '\t': 0 };
  for (const ch of first) if (ch in c) c[ch]++;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] : ';';
}
// CSV mit Anführungszeichen ("a;b" und "" als Escape)
export function parseCSV(text, delim) {
  const rows = []; let row = [], cur = '', q = false;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

const O = { mode: 'list', sep: 'auto', join: 'line', trim: true, empty: true, dedupe: true, caseSens: false, sort: '', lower: false, col: 0, header: true };
let lastIn = '';

export default {
  id: 'list', name: 'Listen-Werkzeug', group: 'Text & Daten', icon: 'list', tags: ['Text', 'Mail', 'CSV', 'Bereinigen'],
  keys: 'liste duplikate doppelte entfernen sortieren trennzeichen komma semikolon verteiler adressen email extrahieren csv spalte bereinigen', online: false,
  render(p, ctx) {
    Object.assign(O, ctx.state.get('listOpts', {}));
    const opt = (k, l) => `<label class="check"><input type="checkbox" data-o="${k}"${O[k] ? ' checked' : ''}>${l}</label>`;
    const sel = (k, obj) => `<select class="input" data-o="${k}">${Object.entries(obj).map(([v, l]) => `<option value="${v}"${O[k] === v ? ' selected' : ''}>${Array.isArray(l) ? l[0] : l}</option>`).join('')}</select>`;
    p.innerHTML = `<div class="util wide"><h3>Listen-Werkzeug</h3><p>Liste oder Text einfügen: bereinigen, Doppelte entfernen, sortieren, Trennzeichen umstellen – etwa für Verteiler, Importdateien oder Seriennummern.</p>
      <div class="lst-modes">${[['list', 'Liste bereinigen'], ['mail', 'E-Mail-Adressen herausziehen'], ['csv', 'Spalte aus CSV']].map(([v, l]) => `<button type="button" class="lk-chip${O.mode === v ? ' on' : ''}" data-mode="${v}">${l}</button>`).join('')}</div>
      <div class="lst-grid"><label class="field"><span>Eingabe</span><textarea class="input mono" id="lsIn" rows="12" spellcheck="false" placeholder="Hier einfügen …">${esc(lastIn)}</textarea></label>
        <label class="field"><span>Ergebnis <em id="lsStat" class="muted"></em></span><textarea class="input mono" id="lsOut" rows="12" readonly></textarea></label></div>
      <div class="lst-opts">
        <label class="field lst-only-list"><span>Trennen bei</span>${sel('sep', SEPS)}</label>
        <label class="field lst-only-csv"><span>Spalte</span><select class="input" id="lsCol"></select></label>
        <label class="field"><span>Ausgabe getrennt durch</span>${sel('join', JOINS)}</label>
        <label class="field"><span>Sortieren</span>${sel('sort', { '': 'Nein', asc: 'A → Z', desc: 'Z → A' })}</label>
        <div class="lst-checks">${opt('dedupe', 'Doppelte entfernen')}${opt('caseSens', 'Groß/klein unterscheiden')}${opt('empty', 'Leere entfernen')}${opt('trim', 'Leerzeichen am Rand entfernen')}${opt('lower', 'In Kleinbuchstaben')}<span class="lst-only-csv">${opt('header', 'Erste Zeile ist Überschrift')}</span></div>
      </div>
      <div class="row"><button class="btn primary" type="button" id="lsCopy">${ic('copy')}Ergebnis kopieren</button><button class="btn" type="button" id="lsSave">${ic('download')}Als Datei speichern</button><button class="btn ghost" type="button" id="lsClr">Leeren</button></div>
      <div id="lsWarn"></div></div>`;
    const inp = $('#lsIn', p), out = $('#lsOut', p), stat = $('#lsStat', p), warn = $('#lsWarn', p), colSel = $('#lsCol', p);
    const showMode = () => { p.querySelectorAll('.lst-only-list').forEach(e => { e.hidden = O.mode !== 'list'; }); p.querySelectorAll('.lst-only-csv').forEach(e => { e.hidden = O.mode !== 'csv'; }); };
    const run = () => {
      lastIn = inp.value; warn.innerHTML = '';
      let items = [];
      if (O.mode === 'mail') items = extractEmails(inp.value);
      else if (O.mode === 'csv') {
        const rows = parseCSV(inp.value, detectCsvDelim(inp.value));
        const head = rows[0] || [];
        const cols = head.map((h, i) => O.header ? (h.trim() || `Spalte ${i + 1}`) : `Spalte ${i + 1}`);
        colSel.innerHTML = cols.map((c, i) => `<option value="${i}"${i === +O.col ? ' selected' : ''}>${esc(c)}</option>`).join('');
        items = rows.slice(O.header ? 1 : 0).map(r => r[+O.col] ?? '');
      } else items = splitItems(inp.value, O.sep);
      const r = processList(items, O);
      out.value = r.items.join(JOINS[O.join][1]);
      stat.textContent = inp.value.trim() ? `${r.items.length} Einträge${r.dupes ? `, ${r.dupes} doppelte entfernt` : ''}${r.empty ? `, ${r.empty} leere entfernt` : ''}` : '';
      if (O.mode === 'mail') {
        const bad = r.items.map(a => [a, checkAddr(a).filter(x => x[0] === 'err' || x[0] === 'warn')]).filter(x => x[1].length);
        if (bad.length) warn.innerHTML = `<div class="chk warn"><div><strong>${bad.length} Adresse${bad.length > 1 ? 'n' : ''} mit Umlauten oder Sonderzeichen</strong><div class="chk-b"><ul class="plain">${bad.map(([a, iss]) => `<li><span class="mono">${esc(a)}</span> – ${esc(iss.map(x => x[1]).join('; '))}</li>`).join('')}</ul></div></div></div>`;
      }
    };
    const save = () => ctx.state.set('listOpts', Object.fromEntries(Object.entries(O).filter(([k]) => k !== 'col')));
    p.addEventListener('change', e => { const k = e.target.dataset.o; if (!k) return; O[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; save(); run(); });
    colSel.addEventListener('change', () => { O.col = +colSel.value; run(); });
    p.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; O.mode = b.dataset.mode; O.col = 0; p.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); showMode(); save(); run(); });
    let tm; inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 200); });
    $('#lsCopy', p).onclick = () => { if (out.value) ctx.copy(out.value, `${out.value.split(JOINS[O.join][1]).length} Einträge kopiert`); };
    $('#lsSave', p).onclick = () => { if (!out.value) return; const b = new TextEncoder().encode(out.value); let s = ''; for (const x of b) s += String.fromCharCode(x); ctx.saveDataURL('liste.txt', 'data:text/plain;base64,' + btoa(s)); };
    $('#lsClr', p).onclick = () => { inp.value = ''; run(); inp.focus(); };
    showMode(); run();
  },
};
