// Prüfsumme – Oberfläche aus dem Ideler-Portal. Dateien hasht Go als Stream
// (auch große ISOs), Text wird im Browser berechnet.
import { EventsOn, EventsOff } from '../../../wailsjs/runtime/runtime';
import { $, esc, ic, chk, nf, segHTML, onSeg } from '../ui.js';

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// MD5 (aus dem Portal) – nur für Text, Dateien rechnet Go
export function md5(bytes) {
  const K = new Uint32Array(64), Sh = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  const len = bytes.length, total = (((len + 8) >>> 6) + 1) * 64, buf = new Uint8Array(total); buf.set(bytes); buf[len] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(total - 8, (len * 8) >>> 0, true); dv.setUint32(total - 4, Math.floor(len / 0x20000000), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476; const M = new Uint32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g; if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const s = Sh[(i >> 4) * 4 + (i % 4)]; F = (F + A + K[i] + M[g]) >>> 0; A = D; D = C; C = B; B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const o = new DataView(new ArrayBuffer(16)); o.setUint32(0, a0, true); o.setUint32(4, b0, true); o.setUint32(8, c0, true); o.setUint32(12, d0, true); return hex(o.buffer);
}

export async function hashText(text) {
  const bytes = new TextEncoder().encode(text), r = {};
  for (const n of ['SHA-256', 'SHA-1', 'SHA-512']) r[n] = hex(await crypto.subtle.digest(n, bytes));
  r['MD5'] = md5(bytes);
  return r;
}

// Vergleich: Leerzeichen, Doppelpunkte und Bindestriche ignorieren
export const normHash = v => String(v || '').trim().toLowerCase().replace(/[\s:-]/g, '');

let mode = 'file';

export default {
  id: 'hash', name: 'Prüfsumme', group: 'Nachschlagen & Prüfen', icon: 'fingerprint',
  keys: 'hash sha256 md5 prüfsumme checksumme datei iso', online: false,
  render(p, ctx) {
    let res = null, name = '';
    p.innerHTML = `<div class="util"><h3>Prüfsumme</h3><p>Prüft, ob eine heruntergeladene Datei (ISO, Treiber, Firmware) vollständig und unverändert ist. Die Datei verlässt den Rechner nicht.</p>
      <div class="stack">${segHTML('hm', [['file', 'Datei'], ['text', 'Text']], mode)}
        <div id="hsIn"></div>
        <label class="field"><span>Erwarteter Wert vom Hersteller (optional)</span><input class="input mono-in" id="hsCmp" placeholder="Prüfsumme hier einfügen" spellcheck="false" autocomplete="off"></label></div>
      <div class="stack"><div id="hsOut"></div><div id="hsMatch"></div></div></div>`;
    const out = $('#hsOut', p);
    const show = () => {
      if (!res) { out.innerHTML = `<div class="panel empty">${ic('fingerprint')}<p>${mode === 'file' ? 'Datei auswählen.' : 'Text eingeben.'}</p></div>`; $('#hsMatch', p).innerHTML = ''; return; }
      out.innerHTML = `${name ? `<p class="muted" style="margin:0 0 8px">${esc(name)}</p>` : ''}<dl class="kv hashes">${['SHA-256', 'SHA-1', 'SHA-512', 'MD5'].filter(k => res[k]).map(k => `<dt>${k}</dt><dd><span class="h">${res[k]}</span><button class="icon-btn copy" type="button" data-copy="${res[k]}" aria-label="${k} kopieren">${ic('copy')}</button></dd>`).join('')}</dl>`;
      cmp();
    };
    const cmp = () => {
      const v = normHash($('#hsCmp', p).value), m = $('#hsMatch', p);
      out.querySelectorAll('dd').forEach(d => d.classList.remove('match'));
      if (!v || !res) { m.innerHTML = ''; return; }
      const hit = Object.entries(res).find(([, h]) => h === v);
      if (hit) { [...out.querySelectorAll('dt')].find(d => d.textContent === hit[0])?.nextElementSibling.classList.add('match'); m.innerHTML = chk('ok', `Stimmt überein (${hit[0]})`, 'Die Datei ist vollständig und unverändert.'); }
      else m.innerHTML = chk('err', 'Keine Übereinstimmung', 'Datei erneut herunterladen. Prüfen, ob der Wert zur richtigen Version und zum richtigen Verfahren (SHA-256, MD5 …) gehört.');
    };
    const drawIn = () => {
      res = null; name = ''; const box = $('#hsIn', p);
      if (mode === 'file') {
        box.innerHTML = `<div class="row"><button class="btn" type="button" id="hsPick">${ic('upload')}Datei auswählen…</button><button class="btn ghost" type="button" id="hsStop" hidden>Abbrechen</button></div>`;
        $('#hsPick', p).onclick = async () => {
          const path = await ctx.files.pickForHash(); if (!path) return;
          name = path.split(/[\\/]/).pop();
          out.innerHTML = `<div class="loading" id="hsProg">Wird berechnet …</div>`; $('#hsStop', p).hidden = false; $('#hsPick', p).disabled = true;
          EventsOn('hash:progress', pr => { const el = $('#hsProg', p); if (el && pr.total) el.textContent = `Wird berechnet … ${nf(pr.done / 1e6, 0)} von ${nf(pr.total / 1e6, 0)} MB (${Math.round(pr.done / pr.total * 100)} %)`; });
          try { res = await ctx.files.hash(path); name += ''; show(); }
          catch (e) { out.innerHTML = chk('err', 'Berechnung fehlgeschlagen', esc(String(e))); }
          finally { EventsOff('hash:progress'); const s = $('#hsStop', p); if (s) s.hidden = true; const b = $('#hsPick', p); if (b) b.disabled = false; }
        };
        $('#hsStop', p).onclick = () => ctx.files.cancelHash();
      } else {
        box.innerHTML = `<label class="field"><span>Text</span><textarea class="input" id="hsTxt" rows="4" spellcheck="false"></textarea></label>`;
        $('#hsTxt', p).addEventListener('input', async e => { res = e.target.value ? await hashText(e.target.value) : null; show(); });
      }
      show();
    };
    $('#hsCmp', p).addEventListener('input', cmp);
    onSeg(p, 'hm', v => { mode = v; drawIn(); });
    drawIn();
    return () => { ctx.files.cancelHash(); EventsOff('hash:progress'); };
  },
};
