// IMEI-Prüfer – aus dem Ideler-Portal übernommen.
import { $, esc, ic, chk } from '../ui.js';

export function luhnCD(payload) { let s = 0; for (let i = payload.length - 1, r = 0; i >= 0; i--, r++) { let d = +payload[i]; if (r % 2 === 0) { d *= 2; if (d > 9) d -= 9; } s += d; } return (10 - s % 10) % 10; }

// Reine Auswertung (ohne HTML) – testbar
export function imeiInfo(raw) {
  const d = raw.replace(/\D/g, '');
  if (d.length === 15) { const cd = luhnCD(d.slice(0, 14)); return { d, kind: 'IMEI', ok: cd === +d[14], expected: cd }; }
  if (d.length === 14) { const cd = luhnCD(d); return { d: d + cd, kind: 'IMEI', ok: true, added: cd }; }
  if (d.length === 16) return { d, kind: 'IMEISV', ok: true };
  return { d, kind: '', ok: false, length: d.length };
}

export function imeiCheck(raw) {
  const r = imeiInfo(raw), d = r.d;
  if (r.kind === 'IMEI' && r.added === undefined) return { ...r, parts: [['TAC', d.slice(0, 8)], ['Seriennummer', d.slice(8, 14)], ['Prüfziffer', d[14]]],
    msg: r.ok ? chk('ok', 'IMEI ist gültig', 'Die Prüfziffer stimmt. Die ersten 8 Ziffern (TAC) stehen für Hersteller und Modell.') : chk('err', 'Prüfziffer stimmt nicht', `Bei diesen ersten 14 Ziffern müsste die letzte Ziffer <b>${r.expected}</b> sein. Wahrscheinlich ein Tippfehler, oder die Nummer ist keine echte IMEI.`) };
  if (r.kind === 'IMEI') return { ...r, parts: [['TAC', d.slice(0, 8)], ['Seriennummer', d.slice(8, 14)], ['Prüfziffer', String(r.added)]], msg: chk('info', `Prüfziffer ergänzt: ${r.added}`, `Es fehlte die 15. Ziffer. Vollständige IMEI: <span class="mono">${d}</span>`) };
  if (r.kind === 'IMEISV') return { ...r, parts: [['TAC', d.slice(0, 8)], ['Seriennummer', d.slice(8, 14)], ['Softwareversion', d.slice(14)]], msg: chk('info', 'IMEISV (16 Ziffern)', 'Diese Variante enthält statt der Prüfziffer zwei Ziffern für die Softwareversion. Eine Prüfziffer gibt es hier nicht.') };
  return { ...r, parts: null, msg: chk('err', `${d.length} Ziffern erkannt`, 'Eine IMEI hat 15 Ziffern, die Variante IMEISV 16.') };
}

let lastInput = '490154203237518';

export default {
  id: 'imei', name: 'IMEI-Prüfer', group: 'Reparatur & Laden', icon: 'phone',
  keys: 'imei handy seriennummer luhn prüfziffer', online: false,
  render(p) {
    p.innerHTML = `<div class="util"><h3>IMEI-Prüfer</h3><p>Prüft die Prüfziffer einer IMEI und deckt so Tippfehler bei der Reparaturannahme auf. Bei Dual-SIM-Geräten mehrere Nummern untereinander eingeben.</p>
      <div class="stack"><label class="field"><span>IMEI</span><textarea class="input mono-in" id="imIn" rows="3" spellcheck="false" placeholder="z. B. 49 015420 323751 8">${esc(lastInput)}</textarea></label>
        <aside class="callout info"><strong class="callout-t">${ic('info')}So findest du die IMEI</strong><p style="margin:0">Am Gerät <span class="mono">*#06#</span> wählen. Außerdem in den Einstellungen unter „Über das Telefon“ bzw. „Allgemein > Info“, auf dem SIM-Schacht oder auf der Verpackung.</p></aside></div>
      <div class="stack" id="imOut" aria-live="polite"></div></div>`;
    const draw = () => {
      lastInput = $('#imIn', p).value;
      const lines = lastInput.split(/[\n,;]+/).map(s => s.trim()).filter(s => /\d/.test(s));
      $('#imOut', p).innerHTML = lines.length ? lines.map(l => { const r = imeiCheck(l); return `<div class="imei">${r.parts ? `<div class="imei-d">${r.parts.map(([n, v], i) => `<div class="ig g${i}${i === 2 && !r.ok ? ' bad' : ''}"><span>${[...v].map(c => `<b>${c}</b>`).join('')}</span><em>${n}</em></div>`).join('')}</div>` : ''}${r.msg}</div>`; }).join('')
        : `<div class="panel empty">${ic('phone')}<p>IMEI eingeben, das Ergebnis erscheint sofort.</p></div>`;
    };
    $('#imIn', p).addEventListener('input', draw); draw();
  },
};
