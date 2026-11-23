// Buchstabieren (DIN 5009, klassisch, NATO) – aus dem Ideler-Portal übernommen.
import { $, esc, ic, segHTML, onSeg } from '../ui.js';

export const SPELL = {
  din: { A: 'Aachen', B: 'Berlin', C: 'Chemnitz', D: 'Düsseldorf', E: 'Essen', F: 'Frankfurt', G: 'Goslar', H: 'Hamburg', I: 'Ingelheim', J: 'Jena', K: 'Köln', L: 'Leipzig', M: 'München', N: 'Nürnberg', O: 'Offenbach', P: 'Potsdam', Q: 'Quickborn', R: 'Rostock', S: 'Salzwedel', T: 'Tübingen', U: 'Unna', V: 'Völklingen', W: 'Wuppertal', X: 'Xanten', Y: 'Ypsilon', Z: 'Zwickau', 'Ä': 'Umlaut Aachen', 'Ö': 'Umlaut Offenbach', 'Ü': 'Umlaut Unna', 'ß': 'Eszett' },
  classic: { A: 'Anton', B: 'Berta', C: 'Cäsar', D: 'Dora', E: 'Emil', F: 'Friedrich', G: 'Gustav', H: 'Heinrich', I: 'Ida', J: 'Julius', K: 'Kaufmann', L: 'Ludwig', M: 'Martha', N: 'Nordpol', O: 'Otto', P: 'Paula', Q: 'Quelle', R: 'Richard', S: 'Samuel', T: 'Theodor', U: 'Ulrich', V: 'Viktor', W: 'Wilhelm', X: 'Xanthippe', Y: 'Ypsilon', Z: 'Zacharias', 'Ä': 'Ärger', 'Ö': 'Ökonom', 'Ü': 'Übermut', 'ß': 'Eszett' },
  nato: { A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu', 'Ä': 'Umlaut Alfa', 'Ö': 'Umlaut Oscar', 'Ü': 'Umlaut Uniform', 'ß': 'Eszett' },
};
const DIG = { de: ['Null', 'Eins', 'Zwo', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun'], en: ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'] };
const SYMN = { '!': 'Ausrufezeichen', '"': 'Anführungszeichen', '#': 'Raute', '$': 'Dollar', '%': 'Prozent', '&': 'Und-Zeichen', "'": 'Apostroph', '(': 'Klammer auf', ')': 'Klammer zu', '*': 'Stern', '+': 'Plus', '-': 'Bindestrich', ',': 'Komma', '.': 'Punkt', '/': 'Schrägstrich', '\\': 'Backslash', ':': 'Doppelpunkt', ';': 'Semikolon', '<': 'Kleiner-Zeichen', '=': 'Gleich', '>': 'Größer-Zeichen', '?': 'Fragezeichen', '@': 'At-Zeichen', '[': 'eckige Klammer auf', ']': 'eckige Klammer zu', '^': 'Dach', '_': 'Unterstrich', '`': 'Gravis', '{': 'geschweifte Klammer auf', '}': 'geschweifte Klammer zu', '|': 'senkrechter Strich', '~': 'Tilde', ' ': 'Leerzeichen', '€': 'Euro', '§': 'Paragraf', '°': 'Grad' };

export function spellParts(text, tab, cases) {
  return [...text].map(ch => {
    if (/\d/.test(ch)) return { ch, w: DIG[tab === 'nato' ? 'en' : 'de'][+ch], k: 'Ziffer', t: 'd' };
    const up = ch === 'ß' ? 'ß' : ch.toUpperCase(); const w = SPELL[tab][up];
    if (w) { const letter = ch.toUpperCase() !== ch.toLowerCase() && ch !== 'ß'; return { ch, w, k: cases && letter ? (ch === ch.toUpperCase() ? 'groß' : 'klein') : '', t: 'l' }; }
    return { ch, w: SYMN[ch] || ('Zeichen „' + ch + '“'), k: 'Zeichen', t: 's' };
  });
}

// Satz für die Ansage am Telefon
export function spellSentence(text, tab, cases) {
  return spellParts(text, tab, cases).map(p => (p.k === 'groß' || p.k === 'klein' ? p.k + ' ' : '') + p.w).join(', ');
}

// Gemeinsamer Zustand (wird auch vom Passwort-Werkzeug genutzt)
export function spellState(ctx) {
  const st = { tab: ctx.state.get('spellTab', 'din'), cases: true };
  return st;
}

export function spellBlock(text, st) {
  if (!text) return `<p class="muted" style="margin:0">Gib oben etwas ein, dann erscheint hier die Buchstabierung.</p>`;
  const parts = spellParts(text, st.tab, st.cases);
  const sentence = parts.map(p => (p.k === 'groß' || p.k === 'klein' ? p.k + ' ' : '') + p.w).join(', ');
  return `<div class="spell-grid">${parts.map(p => `<div class="sp ${p.t}${p.k === 'groß' ? ' up' : ''}"><b>${p.ch === ' ' ? '␣' : esc(p.ch)}</b><span>${esc(p.w)}</span>${p.k && p.t === 'l' ? `<em>${p.k}</em>` : ''}</div>`).join('')}</div>
    <div class="spell-say"><span>${esc(sentence)}</span><button class="icon-btn" type="button" data-copy="${esc(sentence)}" aria-label="Ansage kopieren" title="Ansage kopieren">${ic('copy')}</button></div>`;
}

export function spellWords(text, st) {
  if (!text) return '';
  const toks = text.match(/[A-Za-zÄÖÜäöüß]+|\d+|[^A-Za-zÄÖÜäöüß\d]/g) || [];
  const say = [];
  const rows = toks.map(t => {
    if (/^[A-Za-zÄÖÜäöüß]+$/.test(t)) {
      const cap = /^[A-ZÄÖÜ]/.test(t); say.push(t + (cap && st.cases ? ' (groß)' : ''));
      return `<div class="spw"><b>${esc(t)}</b><span>${spellParts(t, st.tab, st.cases).map(p => (p.k === 'groß' ? 'groß ' : '') + p.w).map(esc).join(', ')}</span></div>`;
    }
    const parts = spellParts(t, st.tab, false); say.push(parts.map(p => p.w).join(' '));
    return `<div class="spw ${/\d/.test(t) ? 'd' : 's'}"><b>${esc(t)}</b><span>${parts.map(p => esc(p.w)).join(', ')}</span></div>`;
  });
  const sentence = say.join(', ');
  return `<p class="note" style="margin:0">Bei Passphrasen die Wörter ansagen, buchstabieren nur bei Rückfragen.</p><div class="spw-list">${rows.join('')}</div>
    <div class="spell-say"><span>${esc(sentence)}</span><button class="icon-btn" type="button" data-copy="${esc(sentence)}" aria-label="Ansage kopieren" title="Ansage kopieren">${ic('copy')}</button></div>`;
}

export function spellControls(st) {
  return `<div class="row">${segHTML('tab', [['din', 'DIN 5009 (Städte)'], ['classic', 'Klassisch (Anton)'], ['nato', 'International']], st.tab)}
    <label class="check"><input type="checkbox" data-sp="cases"${st.cases ? ' checked' : ''}>Groß/klein ansagen</label></div>`;
}

export function bindSpell(root, st, ctx, redraw) {
  onSeg(root, 'tab', v => { st.tab = v; ctx.state.set('spellTab', v); redraw(); });
  root.querySelector('[data-sp=cases]')?.addEventListener('change', e => { st.cases = e.target.checked; redraw(); });
}

let lastText = 'AdminKit 2026';

export default {
  id: 'spell', name: 'Buchstabieren', group: 'Für Kunden', tags: ['Telefon', 'Kunde'], icon: 'telephone',
  keys: 'buchstabiertafel din 5009 anton aachen nato alphabet telefon', online: false,
  render(p, ctx) {
    const st = spellState(ctx);
    p.innerHTML = `<div class="util wide"><h3>Buchstabieren</h3><p>Für Passwörter, Kundennummern oder Namen am Telefon. Ziffern werden als „Zwo“ statt „Zwei“ angesagt, damit sie nicht mit „Drei“ verwechselt werden.</p>
      <label class="field"><span>Text</span><input class="input mono-in" id="spIn" value="${esc(lastText)}" autocomplete="off" spellcheck="false"></label>
      <div class="stack" id="spOut"></div></div>`;
    const draw = () => { lastText = $('#spIn', p).value; const o = $('#spOut', p); o.innerHTML = spellControls(st) + spellBlock(lastText, st); bindSpell(o, st, ctx, draw); };
    $('#spIn', p).addEventListener('input', draw); draw();
  },
};
