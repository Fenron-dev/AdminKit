// Ablauf-Wächter (#129): Domains, Zertifikate, Lizenzen und Garantien mit
// Ablaufdatum im Blick behalten. Domains/Zertifikate lassen sich automatisch prüfen.
import { $, esc, ic, chk } from '../ui.js';
import { parseCollection, emptyCollection, uniqueId } from '../entries.js';
import { KINDS, collect, level } from '../watch-util.js';

const KIND = 'waechter';
let coll = emptyCollection();
export const isoDay = t => new Date(t).toISOString().slice(0, 10);

export default {
  id: 'watch', name: 'Ablauf-Wächter', group: 'Sicherheit & Passwörter', icon: 'bell', tags: ['Fristen', 'Domain', 'Zertifikat', 'Lizenz', 'Garantie'],
  keys: 'ablauf frist ablaufdatum domain zertifikat ssl lizenz abo garantie erinnerung wächter läuft ab', online: false,
  async render(p, ctx) {
    try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
    let kunden = []; try { kunden = parseCollection(await ctx.entries.load('kunden')).entries; } catch (_) { /* keine Akte */ }
    const save = () => ctx.entries.save(KIND, coll).catch(e => ctx.toast('Speichern fehlgeschlagen: ' + e));
    p.innerHTML = `<div class="util wide"><h3>Ablauf-Wächter</h3><p>Was läuft wann ab? Domains und Zertifikate werden auf Knopfdruck geprüft, Garantien und Lizenzen kommen aus der Kundenakte. Fällige Einträge (≤ 14 Tage) erscheinen beim Start im Aktionsprotokoll.</p>
      <form class="panel lk-form" id="waF"><div class="lk-grid"><label class="field"><span>Art</span><select class="input" name="kind">${Object.entries(KINDS).filter(([k]) => k !== 'warranty').map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="field"><span>Name / Domain / Server[:Port]</span><input class="input mono" name="name" required placeholder="kunde.de oder mail.kunde.de:993"></label>
        <label class="field"><span>Kunde (optional)</span><input class="input" name="customer" list="waK"><datalist id="waK">${kunden.map(k => `<option value="${esc(k.name)}">`).join('')}</datalist></label>
        <label class="field"><span>Läuft ab (leer = automatisch prüfen)</span><input class="input" type="date" name="due"></label></div>
        <div class="row"><button class="btn primary" type="submit">${ic('plus')}Hinzufügen</button><button class="btn" type="button" id="waAll">${ic('refresh')}Domains & Zertifikate prüfen</button></div></form>
      <div id="waOut"></div></div>`;
    const draw = () => {
      const L = collect(coll.entries, kunden);
      $('#waOut', p).innerHTML = L.length ? `<div class="table"><table class="mc-t wa-t"><thead><tr><th>Läuft ab</th><th>Art</th><th>Name</th><th>Kunde</th><th></th></tr></thead><tbody>${L.map(x => `<tr class="wa-${level(x.days)}"><td><b>${x.days === null ? '–' : x.days < 0 ? 'abgelaufen' : x.days === 0 ? 'heute' : `in ${x.days} Tagen`}</b><div class="muted">${esc(x.due ? new Date(x.due).toLocaleDateString('de-DE') : (x.note || 'unbekannt'))}</div></td>
        <td>${esc(KINDS[x.kind] || x.kind)}</td><td class="mono">${esc(x.name)}${x.lastCheck ? `<div class="muted">geprüft ${new Date(x.lastCheck).toLocaleDateString('de-DE')}</div>` : ''}</td><td>${esc(x.customer || '')}</td>
        <td class="ns-act">${x.src === 'watch' ? `${['domain', 'cert'].includes(x.kind) ? `<button class="icon-btn" type="button" data-wachk="${esc(x.id)}" title="Jetzt prüfen">${ic('refresh')}</button>` : ''}<button class="icon-btn" type="button" data-wadel="${esc(x.id)}" title="Entfernen">${ic('trash')}</button>` : `<button class="btn sm ghost" type="button" data-wakunde="${esc(x.cid)}">Akte</button>`}</td></tr>`).join('')}</tbody></table></div>` : chk('info', 'Noch nichts eingetragen');
    };
    const check = async e => {
      try {
        if (e.kind === 'domain') { const r = await ctx.net.rdap(e.name.replace(/^https?:\/\//, '').split(/[/:]/)[0]); if (r.expires && !String(r.expires).startsWith('0001')) { e.due = isoDay(r.expires); e.note = ''; } else { e.due = e.due || ''; e.note = r.not_found ? 'Domain nicht gefunden' : 'Registrierungsstelle nennt kein Ablaufdatum (z. B. bei .de)'; } }
        else if (e.kind === 'cert') { const [h, pt] = e.name.replace(/^https?:\/\//, '').split(/[/]/)[0].split(':'); const r = await ctx.net.cert(h, +pt || 443, 'auto'); if (r.chain?.length) { e.due = isoDay(r.chain[0].not_after); e.note = ''; } else e.note = r.error || 'Kein Zertifikat'; }
        e.lastCheck = Date.now();
      } catch (err) { e.note = String(err); }
    };
    $('#waF', p).addEventListener('submit', async ev => {
      ev.preventDefault();
      const fd = new FormData(ev.target), e = { id: uniqueId(fd.get('kind') + '-' + fd.get('name'), new Set(coll.entries.map(x => x.id))), kind: String(fd.get('kind')), name: String(fd.get('name')).trim(), customer: String(fd.get('customer')).trim(), due: String(fd.get('due')) };
      if (!e.due && ['domain', 'cert'].includes(e.kind)) await check(e);
      coll.entries.push(e); await save(); ev.target.reset(); draw();
    });
    $('#waAll', p).onclick = async () => { for (const e of coll.entries.filter(x => ['domain', 'cert'].includes(x.kind))) await check(e); await save(); draw(); ctx.toast('Geprüft'); };
    p.addEventListener('click', async ev => {
      const c = ev.target.closest('[data-wachk]'); if (c) { const e = coll.entries.find(x => x.id === c.dataset.wachk); await check(e); await save(); draw(); return; }
      const d = ev.target.closest('[data-wadel]'); if (d) { coll.entries = coll.entries.filter(x => x.id !== d.dataset.wadel); await save(); draw(); return; }
      const k = ev.target.closest('[data-wakunde]'); if (k) ctx.openTool('customers', {});
    });
    draw();
  },
};
