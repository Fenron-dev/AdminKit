// Passwort & Passphrase – aus dem Ideler-Portal übernommen.
import { $, esc, ic, segHTML, onSeg, randInt } from '../ui.js';
import { spellState, spellControls, spellBlock, spellWords, bindSpell } from './spell.js';

const DEFAULTS = { mode: 'chars', lang: 'de', n: 5, sep: '-', cap: true, num: true, len: 20, up: true, dig: true, sym: true, amb: true, spell: false };

// Wortlisten werden erst bei Bedarf geladen (je ~60 KB)
const WORDS = {};
export async function loadWords(lang) {
  if (!WORDS[lang]) {
    const mod = lang === 'en' ? await import('../data/words-en.txt?raw') : await import('../data/words-de.txt?raw');
    WORDS[lang] = mod.default.trim().split(/\s+/).filter(Boolean);
  }
  return WORDS[lang];
}

export function makePassword(o, rnd = randInt) {
  const strip = s => o.amb ? s.replace(/[0O1lIo]/g, '') : s;
  const sets = [strip('abcdefghijklmnopqrstuvwxyz')];
  if (o.up) sets.push(strip('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
  if (o.dig) sets.push(strip('0123456789'));
  if (o.sym) sets.push('!#$%&*+-=?@_~.:;');
  const pool = sets.join(''); let pw = '';
  // Jede gewählte Zeichenart muss mindestens einmal vorkommen
  for (let t = 0; t < 200; t++) { pw = ''; for (let i = 0; i < o.len; i++) pw += pool[rnd(pool.length)]; if (sets.every(s => [...s].some(c => pw.includes(c)))) break; }
  return { pw, bits: o.len * Math.log2(pool.length), info: `${pool.length} mögliche Zeichen` };
}

export function makePhrase(o, L, rnd = randInt) {
  if (!L || !L.length) return { pw: '', bits: 0, info: 'Wortliste fehlt' };
  const w = []; for (let i = 0; i < o.n; i++) { let x = L[rnd(L.length)]; if (o.cap) x = x[0].toUpperCase() + x.slice(1); w.push(x); }
  if (o.num) { const i = rnd(w.length); w[i] += String(10 + rnd(90)); }
  return { pw: w.join(o.sep), bits: o.n * Math.log2(L.length) + (o.num ? Math.log2(90 * o.n) : 0), info: `${o.n} Wörter aus ${L.length.toLocaleString('de-DE')}` };
}

export function strength(bits) {
  bits = Math.round(bits);
  return bits < 50 ? ['schwach', 'var(--color-error)', 25] : bits < 70 ? ['brauchbar', 'var(--color-warning)', 50] : bits < 100 ? ['stark', 'var(--color-success)', 75] : ['sehr stark', 'var(--color-primary)', 100];
}

export default {
  id: 'pw', name: 'Passwort & Passphrase', group: 'Sicherheit & Passwörter', tags: ['Passwort', 'Sicherheit', 'Generator'], icon: 'key',
  keys: 'passwort passphrase generator kennwort zufall', online: false,
  render(p, ctx) {
    const PW = Object.assign({}, DEFAULTS, ctx.state.get('pwOpts', {}));
    const sst = spellState(ctx);
    let current = '';
    p.innerHTML = `<div class="util"><h3>Passwort &amp; Passphrase</h3><p>Zufällige Passwörter oder merkbare Passphrasen. Erzeugt mit der Zufallsquelle des Systems, nichts wird übertragen.</p>
      <div class="stack">${segHTML('mode', [['chars', 'Zeichen'], ['phrase', 'Passphrase']], PW.mode)}<div class="stack" id="pwOpts"></div></div>
      <div class="stack"><div class="pw-out" id="pwOut" aria-live="polite"></div><div class="meter"><span id="pwMeter"></span></div><p class="muted" id="pwInfo" style="margin:0"></p>
        <div class="row"><button class="btn primary" type="button" id="pwCopy">${ic('copy')}Kopieren</button><button class="btn" type="button" id="pwNew">${ic('refresh')}Neu erzeugen</button><button class="btn" type="button" id="pwSpellBtn" aria-pressed="${PW.spell}">${ic('telephone')}Buchstabieren</button></div>
        <div id="pwSpell" class="stack"${PW.spell ? '' : ' hidden'}></div></div></div>`;
    const opts = $('#pwOpts', p);
    const drawOpts = () => {
      if (PW.mode === 'chars') opts.innerHTML = `<label class="field"><span>Länge: <output id="pwLenOut">${PW.len}</output> Zeichen</span><input type="range" data-o="len" min="8" max="64" value="${PW.len}"></label>
        <label class="check"><input type="checkbox" data-o="up"${PW.up ? ' checked' : ''}>Großbuchstaben</label>
        <label class="check"><input type="checkbox" data-o="dig"${PW.dig ? ' checked' : ''}>Ziffern</label>
        <label class="check"><input type="checkbox" data-o="sym"${PW.sym ? ' checked' : ''}>Sonderzeichen</label>
        <label class="check"><input type="checkbox" data-o="amb"${PW.amb ? ' checked' : ''}>Verwechselbare Zeichen meiden (0 O l 1 I)</label>`;
      else opts.innerHTML = `<div class="field"><span>Sprache der Wörter</span>${segHTML('lang', [['de', 'Deutsch'], ['en', 'Englisch']], PW.lang)}</div>
        <label class="field"><span>Anzahl Wörter: <output id="pwNOut">${PW.n}</output></span><input type="range" data-o="n" min="3" max="8" value="${PW.n}"></label>
        <label class="field"><span>Trennzeichen</span><select class="input" data-o="sep">${[['-', 'Bindestrich  (Wort-Wort)'], ['.', 'Punkt  (Wort.Wort)'], ['_', 'Unterstrich  (Wort_Wort)'], [' ', 'Leerzeichen  (Wort Wort)'], ['', 'ohne  (WortWort)']].map(([v, l]) => `<option value="${esc(v)}"${PW.sep === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-o="cap"${PW.cap ? ' checked' : ''}>Wörter großschreiben</label>
        <label class="check"><input type="checkbox" data-o="num"${PW.num ? ' checked' : ''}>Zahl an ein Wort hängen</label>
        <p class="note">Die Wörter kommen aus zwei fest eingebauten Listen mit je rund 7.700 Einträgen, ohne Umlaute, damit sie auf jeder Tastatur funktionieren.</p>`;
      onSeg(opts, 'lang', v => { PW.lang = v; gen(); });
    };
    opts.addEventListener('input', e => {
      const o = e.target.dataset.o; if (!o) return;
      PW[o] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value;
      if (o === 'len') $('#pwLenOut', p).textContent = PW.len;
      if (o === 'n') $('#pwNOut', p).textContent = PW.n;
      gen();
    });
    onSeg(p, 'mode', v => { PW.mode = v; drawOpts(); gen(); });
    const drawSpell = () => { const box = $('#pwSpell', p); if (!PW.spell) return; box.innerHTML = spellControls(sst) + (PW.mode === 'phrase' ? spellWords(current, sst) : spellBlock(current, sst)); bindSpell(box, sst, ctx, drawSpell); };
    async function gen() {
      const r = PW.mode === 'chars' ? makePassword(PW) : makePhrase(PW, await loadWords(PW.lang));
      current = r.pw; ctx.state.set('pwOpts', PW);
      $('#pwOut', p).innerHTML = [...r.pw].map(c => /\d/.test(c) ? `<span class="d">${c}</span>` : /[A-Za-z]/.test(c) ? c : `<span class="s">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
      const bits = Math.round(r.bits); const [lbl, col, w] = strength(bits);
      const m = $('#pwMeter', p); m.style.width = w + '%'; m.style.background = col;
      $('#pwInfo', p).innerHTML = `Etwa <b style="color:var(--text)">${bits} Bit</b> Zufall (${r.info}), also <span style="color:${col}">${lbl}</span>.`;
      drawSpell();
    }
    $('#pwNew', p).onclick = gen;
    $('#pwCopy', p).onclick = () => ctx.copy(current, 'Passwort kopiert');
    $('#pwSpellBtn', p).onclick = e => { PW.spell = !PW.spell; e.currentTarget.setAttribute('aria-pressed', PW.spell); $('#pwSpell', p).hidden = !PW.spell; ctx.state.set('pwOpts', PW); drawSpell(); };
    drawOpts(); gen();
  },
};
