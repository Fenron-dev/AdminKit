// Fehlercodes (#106): Code oder ganzen Fehlertext einfügen → Bedeutung,
// Ursache, Was tun. Erkennt Hex (0x80070005, 80070005), Dezimal (auch negativ:
// -2147024891), Win32-Nummern, Bluescreen-Namen, Ereignis-IDs, AADSTS-, Teams-
// und macOS-Codes. Eigene Notizen pro Code liegen im Vault (Sammlung „fehlercodes“).
import { $, esc, ic } from '../ui.js';
import { md, mdInline } from '../markdown.js';
import { CODES, KINDS } from '../data/errcodes.js';
import { parseCollection, emptyCollection, splitTags, uniqueId } from '../entries.js';

const KIND = 'fehlercodes';
const hex8 = v => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

// Bekannte Bereiche (obere 16 Bit) für Codes, die nicht in der Liste stehen
export const FACILITY = {
  0x8007: 'Windows-Fehler (Win32) als HRESULT', 0x8024: 'Windows Update', 0x800F: 'Komponentenspeicher / Setup (CBS)',
  0x8004: 'programmspezifisch (COM), z. B. Outlook', 0x800C: 'Internet / Mail (Outlook)', 0xC004: 'Windows-/Office-Aktivierung',
  0xC190: 'Windows-Setup / Funktionsupdate', 0xC000: 'Kernel-Status (NTSTATUS)', 0x8019: 'HTTP-Status', 0x8018: 'Geräteverwaltung / Intune',
  0x8009: 'Sicherheit / Zertifikate', 0x8010: 'Smartcard', 0x8003: 'Speicher / Dateien (COM)', 0x8000: 'allgemeiner COM-Fehler', 0x87D1: 'Configuration Manager (SCCM)',
};

// Schlüssel eines Datensatzes: x<hex8>, w<win32>, e<event>, s<text>, n<NAME>
export function entryKeys(e) {
  const k = [];
  for (const c of [].concat(e.c)) {
    if (e.k === 'win32' && typeof c === 'number') { k.push('w' + c); k.push('x' + hex8(0x80070000 | c)); }
    else if (e.k === 'event') k.push('e' + c);
    else if (/^0x[0-9a-f]{1,8}$/i.test(String(c))) k.push('x' + hex8(parseInt(c, 16)));
    else k.push('s' + String(c).toLowerCase());
  }
  for (const n of e.n || []) k.push('n' + n.toUpperCase());
  return k;
}

const INDEX = new Map();
for (const e of CODES) for (const key of entryKeys(e)) { if (!INDEX.has(key)) INDEX.set(key, []); INDEX.get(key).push(e); }
const NAMES = new Set([...INDEX.keys()].filter(k => k[0] === 'n').map(k => k.slice(1)));

function hexToken(v, raw) {
  v >>>= 0;
  const keys = ['x' + hex8(v)];
  if (v <= 0xFFFF) keys.push('w' + v);
  if ((v >>> 16) === 0x8007) keys.push('w' + (v & 0xFFFF));
  return { raw, hex: v, keys };
}

// Codes aus beliebigem Text herausziehen
export function extractCodes(text) {
  const s = String(text || ''), out = [], seen = new Set();
  const add = t => { if (!seen.has(t.keys[0])) { seen.add(t.keys[0]); out.push(t); } };
  for (const m of s.matchAll(/\b0x([0-9a-f]{1,8})\b/gi)) add(hexToken(parseInt(m[1], 16), m[0]));
  for (const m of s.matchAll(/(?<![\w-])([8C][0-9A-F]{7}|4[0-9A-F]*[A-F][0-9A-F]*)(?![\w])/gi)) if (m[1].length === 8) add(hexToken(parseInt(m[1], 16), m[1]));
  for (const m of s.matchAll(/(?<![\w.])-(\d{9,10})\b/g)) { const n = +m[1]; if (n <= 0x80000000 && n >= 0x40000000) add(hexToken(0x100000000 - n, m[0])); }
  for (const m of s.matchAll(/(?<![\w.-])(\d{10})\b/g)) { const n = +m[1]; if (n >= 0x80000000 && n <= 0xFFFFFFFF) add(hexToken(n, m[1])); }
  for (const m of s.matchAll(/\bAADSTS\d{4,8}\b/gi)) add({ raw: m[0], keys: ['s' + m[0].toLowerCase()] });
  for (const m of s.matchAll(/\bcaa[0-9a-f]{5}\b/gi)) add({ raw: m[0], keys: ['s' + m[0].toLowerCase()] });
  for (const m of s.matchAll(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]{3,}\b/g)) if (NAMES.has(m[0])) add({ raw: m[0], keys: ['n' + m[0]] });
  for (const m of s.matchAll(/\b(?:ereignis-?id|event[- ]?id|ereignis|event|id)\s*[:#]?\s*(\d{1,5})\b/gi)) add({ raw: m[0], event: +m[1], keys: ['e' + +m[1]] });
  for (const m of s.matchAll(/\b(?:systemfehler|fehler|error)\s*[:#]?\s*(-?\d{1,5})\b/gi)) {
    const n = +m[1];
    add(n < 0 ? { raw: m[0], keys: ['s' + n] } : { raw: m[0], keys: ['w' + n, 'e' + n] });
  }
  // Nur eine Zahl eingegeben: Win32-Fehler oder Ereignis-ID; negative kleine Zahl: macOS
  const only = s.trim().match(/^(-?\d{1,5})$/);
  if (only) { const n = +only[1]; add(n < 0 ? { raw: only[1], keys: ['s' + n] } : { raw: only[1], keys: ['w' + n, 'e' + n] }); }
  return out;
}

// Eigene Einträge in denselben Schlüsselraum bringen
export function ownKeys(code) { const t = extractCodes(code)[0]; return t ? t.keys : ['s' + String(code).trim().toLowerCase()]; }

export function lookup(text, own = []) {
  return extractCodes(text).map(t => {
    // Erster Schlüssel ist der genaueste (z. B. 0x0000007E = Bluescreen, nicht Win32 126)
    const first = INDEX.get(t.keys[0]) || [];
    const hits = (first.length ? first : [...new Set(t.keys.slice(1).flatMap(k => INDEX.get(k) || []))])
      .slice().sort((a, b) => (a.k === 'win32') - (b.k === 'win32')); // Spezielles vor allgemeinem Win32
    const notes = own.filter(o => ownKeys(o.code).some(k => t.keys.includes(k)));
    let info = null;
    if (t.hex != null) {
      const hi = t.hex >>> 16;
      info = { hex: hex8(t.hex), area: FACILITY[hi] || (t.hex & 0x80000000 ? 'unbekannter Bereich' : null) };
      if (hi === 0x8007) info.win32 = t.hex & 0xFFFF;
      if (hi === 0x8019) info.http = t.hex & 0xFFFF;
    }
    return { token: t, hits, notes, info };
  }).filter(r => r.hits.length || r.notes.length || r.info?.area);
}

// Freitextsuche über Titel, Ursache, Namen, Quelle (wenn kein Code erkannt)
export function searchText(q, own = []) {
  const words = String(q).toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return { hits: [], notes: [] };
  const hay = e => [e.t, e.w, (e.n || []).join(' '), e.src || '', KINDS[e.k]].join(' ').toLowerCase();
  return {
    hits: CODES.filter(e => words.every(w => hay(e).includes(w))).slice(0, 30),
    notes: own.filter(o => words.every(w => [o.code, o.name, o.text, (o.tags || []).join(' ')].join(' ').toLowerCase().includes(w))),
  };
}

export function codeLabel(e) {
  const c = [].concat(e.c)[0];
  if (e.k === 'win32' && typeof c === 'number') return `Fehler ${c} · ${hex8(0x80070000 | c)}`;
  if (e.k === 'event') return `Ereignis-ID ${c}`;
  return String(c);
}

let coll = emptyCollection(), lastQ = '';

export default {
  id: 'err', name: 'Fehlercodes', group: 'Windows & macOS', icon: 'bug', tags: ['Fehlersuche', 'Windows', 'Bluescreen', 'Update', 'Ereignisanzeige'],
  keys: 'fehlercode error code hresult 0x bluescreen bsod stopcode stop update aktivierung ereignis event id outlook aadsts teams', online: false,
  match: w => extractCodes(w).some(t => t.keys.some(k => INDEX.has(k))),
  async render(p, ctx) {
    const pre = ctx.takePrefill('err');
    if (pre?.q) lastQ = pre.q;
    try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
    p.innerHTML = `<div class="util wide"><h3>Fehlercodes</h3><p>Fehlercode oder ganze Fehlermeldung einfügen: Windows-Fehler, Windows Update, Bluescreen, Ereignis-IDs, Aktivierung, Outlook, Microsoft-365-Anmeldung, macOS. Alles läuft lokal.</p>
      <label class="field"><span class="sr">Code oder Fehlertext</span><textarea class="input" id="erIn" rows="3" spellcheck="false" placeholder="z. B. 0x80070005, CRITICAL_PROCESS_DIED, Ereignis-ID 41, -2147024891 oder die ganze Meldung">${esc(lastQ)}</textarea></label>
      <div class="row"><button class="btn primary" type="button" id="erGo">${ic('search')}Nachschlagen</button><button class="btn ghost" type="button" id="erClr">Leeren</button>
        <button class="btn" type="button" id="erNew">${ic('plus')}Eigene Notiz</button></div>
      <div id="erForm"></div><div id="erOut" aria-live="polite"></div></div>`;
    const ta = $('#erIn', p), out = $('#erOut', p), form = $('#erForm', p);

    const fixList = f => f?.length ? `<div class="todo"><strong>Was tun?</strong><ol>${f.map(x => `<li>${mdInline(x)}</li>`).join('')}</ol></div>` : '';
    const card = e => `<div class="er-card"><div class="er-head"><span class="mono er-code">${esc(codeLabel(e))}</span><span class="tag">${esc(KINDS[e.k])}</span>${e.src ? `<span class="tag">${esc(e.src)}</span>` : ''}${(e.n || []).filter(n => n !== e.t).map(n => `<span class="mono muted er-name">${esc(n)}</span>`).join('')}</div>
      <h4>${esc(e.t)}</h4><p>${esc(e.w)}</p>${fixList(e.f)}</div>`;
    const note = o => `<div class="er-card er-own"><div class="er-head"><span class="mono er-code">${esc(o.code)}</span><span class="tag">Eigene Notiz</span>${(o.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
      <button class="icon-btn" type="button" data-ered="${esc(o.id)}" title="Bearbeiten">${ic('pencil')}</button></div>${o.name ? `<h4>${esc(o.name)}</h4>` : ''}<div class="hb-prose">${md(o.text || '')}</div></div>`;
    const unknown = r => `<div class="er-card"><div class="er-head"><span class="mono er-code">${esc(r.info.hex)}</span><span class="tag">nicht in der Liste</span></div>
      <h4>Bereich: ${esc(r.info.area)}</h4><p>Dieser Code ist nicht hinterlegt.${r.info.http ? ` Er steht für den HTTP-Status <b>${r.info.http}</b> (siehe Wiki → Nachschlagen).` : ''}</p>
      <div class="todo"><strong>Mehr herausfinden</strong><ol>${r.info.win32 != null ? `<li>Windows-Fehler ${r.info.win32}: Klartext mit <code>net helpmsg ${r.info.win32}</code> in der Eingabeaufforderung.</li>` : ''}
      <li>Name und Text unter Windows: <code>certutil -error ${esc(r.info.hex)}</code></li><li>Code mit dem Programmnamen im Netz suchen und als eigene Notiz festhalten.</li></ol></div></div>`;

    const run = () => {
      lastQ = ta.value;
      const q = ta.value.trim(), own = coll.entries;
      if (!q) { out.innerHTML = browse(); return; }
      const res = lookup(q, own);
      if (res.length) {
        out.innerHTML = res.map(r => {
          const parts = r.hits.map(card).concat(r.notes.map(note));
          if (!r.hits.length && !r.notes.length) parts.push(unknown(r));
          return `<div class="sub"><h5>${esc(r.token.raw)}</h5>${parts.join('')}<button class="btn sm ghost" type="button" data-ernote="${esc(r.token.raw)}">${ic('plus')}Notiz zu ${esc(r.token.raw)}</button><button class="btn sm ghost" type="button" data-aiexplain="${esc(q)}">${ic('chat')}Erklären lassen (KI)</button></div>`;
        }).join('');
        return;
      }
      const t = searchText(q, own);
      out.innerHTML = t.hits.length || t.notes.length
        ? `<div class="sub"><h5>Treffer für „${esc(q)}“ <small>${t.hits.length + t.notes.length}</small></h5>${t.notes.map(note).join('')}${t.hits.map(card).join('')}</div>`
        : `<div class="chk info"><div><strong>Kein Code erkannt</strong><div class="chk-b">Füge den Code (z. B. <span class="mono">0x80070005</span>, <span class="mono">Ereignis-ID 41</span>) oder einen Suchbegriff wie „Konto gesperrt“ ein. Unbekannte Codes kannst du als eigene Notiz festhalten.</div></div></div>`;
    };
    const browse = () => `<div class="sub"><h5>Alle hinterlegten Codes <small>${CODES.length + coll.entries.length}</small></h5>
      ${coll.entries.length ? `<details class="er-group" open><summary>Eigene Notizen <em>${coll.entries.length}</em></summary>${coll.entries.map(note).join('')}</details>` : ''}
      ${Object.entries(KINDS).map(([k, l]) => { const L = CODES.filter(e => e.k === k); return L.length ? `<details class="er-group"><summary>${esc(l)} <em>${L.length}</em></summary><div class="er-list">${L.map(e => `<button type="button" class="er-li" data-erq="${esc(codeLabel(e).split(' · ').pop())}"><span class="mono">${esc(codeLabel(e))}</span><span>${esc(e.t)}</span></button>`).join('')}</div></details>` : ''; }).join('')}</div>`;

    const showForm = (o, code = '') => {
      const x = o || { code, name: '', text: '', tags: [] };
      form.innerHTML = `<form class="panel lk-form" id="erF"><strong>${o ? 'Notiz bearbeiten' : 'Eigene Notiz zu einem Code'}</strong>
        <div class="lk-grid"><label class="field"><span>Code</span><input class="input mono" name="code" value="${esc(x.code)}" required maxlength="80" placeholder="0x80070005, Ereignis-ID 41, eigener Code"></label>
        <label class="field"><span>Titel</span><input class="input" name="name" value="${esc(x.name || '')}" maxlength="120"></label>
        <label class="field"><span>Tags, mit Komma getrennt</span><input class="input" name="tags" value="${esc((x.tags || []).join(', '))}"></label></div>
        <label class="field"><span>Notiz (Markdown): Ursache, Lösung, betroffene Kunden …</span><textarea class="input" name="text" rows="6">${esc(x.text || '')}</textarea></label>
        <div class="row"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-erx="cancel">Abbrechen</button>${o ? `<button class="btn lk-del" type="button" data-erx="del" data-id="${esc(o.id)}">${ic('trash')}Löschen</button>` : ''}</div></form>`;
      const f = $('#erF', form);
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const fd = new FormData(f), e = { code: String(fd.get('code')).trim(), name: String(fd.get('name')).trim(), text: String(fd.get('text')), tags: splitTags(fd.get('tags')) };
        if (!e.code) return;
        if (o) Object.assign(coll.entries.find(y => y.id === o.id), e);
        else coll.entries.push(Object.assign({ id: uniqueId(e.code, new Set(coll.entries.map(y => y.id))) }, e));
        try { await ctx.entries.save(KIND, coll); ctx.addAction('Fehlercode-Notiz gespeichert: ' + e.code, 'success'); } catch (err) { ctx.toast('Speichern fehlgeschlagen: ' + err); return; }
        form.innerHTML = ''; if (!ta.value.trim()) ta.value = e.code; run();
      });
      f.querySelector(o ? '[name=text]' : (code ? '[name=name]' : '[name=code]')).focus();
    };

    p.addEventListener('click', async ev => {
      const t = ev.target;
      const q = t.closest('[data-erq]'); if (q) { ta.value = q.dataset.erq; run(); p.closest('.wz-pane')?.scrollTo?.(0, 0); return; }
      const n = t.closest('[data-ernote]'); if (n) { showForm(null, n.dataset.ernote); return; }
      const ed = t.closest('[data-ered]'); if (ed) { showForm(coll.entries.find(y => y.id === ed.dataset.ered)); return; }
      const x = t.closest('[data-erx]'); if (!x) return;
      if (x.dataset.erx === 'cancel') { form.innerHTML = ''; return; }
      const o = coll.entries.find(y => y.id === x.dataset.id);
      if (!await ctx.confirm({ title: `Notiz zu ${o.code} löschen?`, what: 'Die eigene Notiz wird aus dem Vault gelöscht.', impact: 'Der Text ist danach für alle, die diesen Vault nutzen, weg.' })) return;
      coll.entries = coll.entries.filter(y => y.id !== o.id);
      try { await ctx.entries.save(KIND, coll); ctx.addAction('Fehlercode-Notiz gelöscht: ' + o.code, 'success'); } catch (err) { ctx.toast('Löschen fehlgeschlagen: ' + err); }
      form.innerHTML = ''; run();
    });
    let tm; ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 250); });
    $('#erGo', p).onclick = run;
    $('#erClr', p).onclick = () => { ta.value = ''; run(); ta.focus(); };
    $('#erNew', p).onclick = () => showForm(null, extractCodes(ta.value)[0]?.raw || '');
    run();
  },
};
