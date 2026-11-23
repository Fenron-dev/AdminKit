// Wake-on-LAN (#116): Rechner im lokalen Netz per „Magic Packet“ aufwecken.
// Gespeicherte Geräte liegen im Vault (Sammlung „wol“). Senden nur nach Bestätigung.
import { $, esc, ic } from '../ui.js';
import { parseCollection, emptyCollection, splitTags, uniqueId } from '../entries.js';

const KIND = 'wol';
export function normMac(s) {
  const h = String(s || '').replace(/[\s:.-]/g, '').toLowerCase();
  return /^[0-9a-f]{12}$/.test(h) ? h.match(/../g).join(':').toUpperCase() : '';
}
export const isBroadcast = s => !s || /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) && s.split('.').every(n => +n <= 255);
let coll = emptyCollection();

export default {
  id: 'wol', name: 'Wake-on-LAN', group: 'Netzwerk & Mail', icon: 'zap', tags: ['Netzwerk', 'Fernwartung'],
  keys: 'wake on lan wol aufwecken einschalten magic packet rechner pc fernstart', online: false,
  async render(p, ctx) {
    try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
    p.innerHTML = `<div class="util wide"><h3>Wake-on-LAN</h3><p>Schaltet einen Rechner im selben Netz über die Netzwerkkarte ein, z. B. vor einer Fernwartung. Das Gerät muss Wake-on-LAN unterstützen und per Kabel verbunden sein.</p>
      <form class="lk-form panel" id="woF"><div class="lk-grid">
        <label class="field"><span>MAC-Adresse</span><input class="input mono" name="mac" required placeholder="00:11:22:33:44:55" spellcheck="false"></label>
        <label class="field"><span>Broadcast-Adresse (optional)</span><input class="input mono" name="bc" placeholder="255.255.255.255 oder 192.168.178.255" spellcheck="false"></label>
        <label class="field"><span>Port</span><select class="input" name="port"><option>9</option><option>7</option></select></label>
        <label class="field"><span>Name (zum Speichern)</span><input class="input" name="name" placeholder="z. B. Empfang-PC" maxlength="60"></label></div>
        <div class="row"><button class="btn primary" type="submit">${ic('zap')}Aufwecken</button><button class="btn" type="button" id="woSave">${ic('plus')}Speichern</button></div></form>
      <div id="woList"></div>
      <details class="howto"><summary>${ic('info')}Klappt nicht? Voraussetzungen</summary><div class="howto-b">
        <p><b>BIOS/UEFI:</b> „Wake on LAN“ bzw. „Power on by PCI-E“ aktivieren, „ErP/EuP“ (Energiesparmodus im ausgeschalteten Zustand) deaktivieren.</p>
        <p><b>Windows:</b> Geräte-Manager → Netzwerkadapter → Eigenschaften → Energieverwaltung: „Gerät kann den Computer aus dem Ruhezustand aktivieren“ und „Nur Magic Packet …“; Erweitert: „Wake on Magic Packet“ aktivieren. Schnellstart in den Energieoptionen ausschalten.</p>
        <p><b>Netz:</b> Funktioniert nur im selben Netzsegment (Broadcast). Über VPN oder andere Subnetze braucht es die Broadcast-Adresse des Zielnetzes bzw. Weiterleitung am Router. WLAN-Geräte wachen in der Regel nicht auf.</p></div></details></div>`;
    const f = $('#woF', p), list = $('#woList', p);
    const draw = () => {
      list.innerHTML = coll.entries.length ? `<div class="sub"><h5>Gespeicherte Geräte <small>${coll.entries.length}</small></h5>${coll.entries.map(e => `<div class="wz-hrow">${ic('monitor')}<span><b>${esc(e.name)}</b> <span class="mono muted">${esc(e.mac)}${e.bc ? ' → ' + esc(e.bc) : ''}</span></span>
        <button class="btn sm primary" type="button" data-wowake="${esc(e.id)}">${ic('zap')}Aufwecken</button><button class="icon-btn" type="button" data-wodel="${esc(e.id)}" title="Löschen">${ic('trash')}</button></div>`).join('')}</div>` : '';
    };
    const wake = async (mac, bc, port, name) => {
      const m = normMac(mac);
      if (!m) { ctx.toast('MAC-Adresse ungültig (12 Hex-Zeichen)'); return; }
      if (!isBroadcast(bc)) { ctx.toast('Broadcast-Adresse ungültig'); return; }
      const ok = await ctx.confirm({ title: `${name || m} aufwecken?`, what: `Ein Wake-on-LAN-Paket wird an ${bc || '255.255.255.255'} (Port ${port || 9}) gesendet, um das Gerät mit der MAC-Adresse ${m} einzuschalten.`,
        impact: 'Der Rechner startet, falls er Wake-on-LAN unterstützt. Wer gerade nicht damit rechnet, findet ihn eingeschaltet vor. Andere Geräte im Netz sind nicht betroffen.' });
      if (!ok) return;
      try { await ctx.net.wol(m, bc, +port || 9); ctx.addAction(`Wake-on-LAN gesendet: ${name || m}`, 'success'); ctx.toast('Paket gesendet – der Start kann bis zu einer Minute dauern.'); }
      catch (e) { ctx.toast('Senden fehlgeschlagen: ' + e); }
    };
    f.addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(f); wake(fd.get('mac'), String(fd.get('bc')).trim(), fd.get('port'), String(fd.get('name')).trim()); });
    $('#woSave', p).onclick = async () => {
      const fd = new FormData(f), mac = normMac(fd.get('mac')), bc = String(fd.get('bc')).trim(), name = String(fd.get('name')).trim() || mac;
      if (!mac) { ctx.toast('MAC-Adresse ungültig'); return; }
      if (!isBroadcast(bc)) { ctx.toast('Broadcast-Adresse ungültig'); return; }
      coll.entries.push({ id: uniqueId(name, new Set(coll.entries.map(x => x.id))), name, mac, bc, port: +fd.get('port') || 9, tags: splitTags('') });
      try { await ctx.entries.save(KIND, coll); ctx.addAction('Wake-on-LAN-Gerät gespeichert: ' + name, 'success'); } catch (err) { ctx.toast(String(err)); return; }
      f.reset(); draw();
    };
    p.addEventListener('click', async e => {
      const w = e.target.closest('[data-wowake]'); if (w) { const x = coll.entries.find(y => y.id === w.dataset.wowake); wake(x.mac, x.bc, x.port, x.name); return; }
      const d = e.target.closest('[data-wodel]');
      if (d) {
        const x = coll.entries.find(y => y.id === d.dataset.wodel);
        if (!await ctx.confirm({ title: `„${x.name}“ entfernen?`, what: 'Das gespeicherte Gerät wird aus dem Vault gelöscht.', impact: 'Nur der Eintrag verschwindet, am Gerät ändert sich nichts.' })) return;
        coll.entries = coll.entries.filter(y => y.id !== x.id);
        try { await ctx.entries.save(KIND, coll); } catch (err) { ctx.toast(String(err)); }
        draw();
      }
    });
    draw();
  },
};
