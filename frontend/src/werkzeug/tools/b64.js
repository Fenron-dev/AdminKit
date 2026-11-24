// Kodieren & Dekodieren (Base64, URL) – aus dem Ideler-Portal übernommen.
import { $, esc, ic } from '../ui.js';

export function convert(mode, v) {
  if (mode === 'b64e') { const by = new TextEncoder().encode(v); let bin = ''; for (let i = 0; i < by.length; i++) bin += String.fromCharCode(by[i]); return btoa(bin); }
  if (mode === 'b64d') { const bin = atob(v.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }
  if (mode === 'urle') return encodeURIComponent(v);
  return decodeURIComponent(v.replace(/\+/g, ' '));
}

let mode = 'b64e', lastInput = 'Grüße aus der Werkstatt! 50 % Rabatt & mehr.';

export default {
  id: 'b64', name: 'Kodieren & Dekodieren', group: 'Text & Daten', tags: ['Text', 'Kodierung'], icon: 'code',
  keys: 'base64 url encode decode', online: false,
  render(p, ctx) {
    p.innerHTML = `<div class="util"><h3>Kodieren &amp; Dekodieren</h3><p>Base64 und URL-Kodierung, mit Umlauten und Sonderzeichen (UTF-8).</p>
      <div class="stack"><div class="seg" id="b64Mode">${[['b64e', 'Base64 kodieren'], ['b64d', 'Base64 dekodieren'], ['urle', 'URL kodieren'], ['urld', 'URL dekodieren']].map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div>
        <label class="field"><span>Eingabe</span><textarea class="input" id="b64In" spellcheck="false">${esc(lastInput)}</textarea></label></div>
      <div class="stack"><div class="field"><span>Ergebnis</span><div class="out-box" id="b64Out"></div></div><div class="row"><button class="btn" type="button" id="b64Copy">${ic('copy')}Ergebnis kopieren</button><button class="btn ghost" type="button" id="b64Swap">${ic('refresh')}Ergebnis als Eingabe</button></div></div></div>`;
    let res = null;
    const calc = () => {
      lastInput = $('#b64In', p).value; const out = $('#b64Out', p); out.classList.remove('err'); res = null;
      try { res = convert(mode, lastInput); out.textContent = res || ' '; }
      catch (e) { out.classList.add('err'); out.textContent = mode === 'b64d' ? 'Kein gültiges Base64 oder kein UTF-8-Text. Prüfe, ob Zeichen fehlen oder abgeschnitten wurden.' : 'Die Eingabe enthält eine ungültige %-Sequenz, z. B. ein einzelnes %.'; }
    };
    $('#b64Mode', p).addEventListener('click', e => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      mode = b.dataset.mode; $('#b64Mode', p).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); calc();
    });
    $('#b64In', p).addEventListener('input', calc);
    $('#b64Copy', p).onclick = () => { if (res != null) ctx.copy(res, 'Ergebnis kopiert'); };
    $('#b64Swap', p).onclick = () => { if (res == null) return; $('#b64In', p).value = res; calc(); };
    calc();
  },
};
