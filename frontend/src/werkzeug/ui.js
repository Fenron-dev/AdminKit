// Gemeinsame Helfer der Werkzeuge (aus dem Ideler-Portal übernommen).
// Keine DOM-Zugriffe beim Import → Logik ist mit `node --test` testbar.
import { ic } from './icons.js';
export { ic };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nf = (n, d = 2) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d });
export const pnum = s => { const v = parseFloat(String(s).trim().replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : NaN; };
export const segHTML = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
export function onSeg(root, name, fn) {
  const el = root.querySelector(`[data-seg="${name}"]`);
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    fn(b.dataset.v);
  });
}
const ST = { ok: 'check', warn: 'alert', err: 'x', info: 'info' };
export const chk = (st, title, body = '') => `<div class="chk ${st}"><span class="chk-i">${ic(ST[st])}</span><div><strong>${title}</strong>${body ? `<div class="chk-b">${body}</div>` : ''}</div></div>`;
export const sel = (id, opts, cur) => `<select class="input" id="${id}">${opts.map(o => `<option${o === cur ? ' selected' : ''}>${o}</option>`).join('')}</select>`;

// Kryptografisch sicherer Zufall ohne Modulo-Verzerrung
export function randInt(n) {
  const lim = Math.floor(0x100000000 / n) * n, a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
