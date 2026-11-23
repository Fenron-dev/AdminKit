// Kunden- & Geräteakte (#125): pro Kunde Ansprechpartner, Geräte, Lizenzen/Abos,
// Notizen und verknüpfte Protokolle – verbindet Garantie, Wake-on-LAN, MAC-Erkennung
// und Abläufe. Keine Kennwörter speichern, nur wo sie liegen. Sammlung „kunden“.
import { $, esc, ic } from '../ui.js';
import { md } from '../markdown.js';
import { parseCollection, emptyCollection, splitTags, uniqueId } from '../entries.js';

const KIND = 'kunden';
export const DEVICE_TYPES = ['PC', 'Notebook', 'Server', 'Drucker', 'Router', 'Switch/AP', 'NAS', 'Smartphone', 'Tablet', 'Telefon', 'Sonstiges'];
const SUB = {
  contacts: { title: 'Ansprechpartner', icon: 'users', fields: [['name', 'Name'], ['role', 'Funktion'], ['phone', 'Telefon'], ['mail', 'E-Mail']] },
  devices: { title: 'Geräte', icon: 'monitor', fields: [['name', 'Name'], ['type', 'Typ', DEVICE_TYPES], ['os', 'System'], ['vendor', 'Hersteller'], ['model', 'Modell'], ['serial', 'Seriennummer'], ['mac', 'MAC'], ['ip', 'IP'], ['warranty', 'Garantie bis', 'date'], ['notes', 'Notiz']] },
  licenses: { title: 'Lizenzen & Abos', icon: 'key', fields: [['name', 'Produkt'], ['until', 'Läuft ab', 'date'], ['seats', 'Anzahl'], ['note', 'Notiz']] },
};
export const isoDay = d => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
export function daysLeft(dateStr, now = Date.now()) { if (!dateStr) return null; const t = Date.parse(dateStr + 'T23:59:59'); return isNaN(t) ? null : Math.ceil((t - now) / 86400000); }
export function newCustomer(name, used) { return { id: uniqueId(name, used), name, tags: [], address: '', pwHint: '', notes: '', contacts: [], devices: [], licenses: [] }; }

let coll = emptyCollection(), sel = '', q = '', pendingDevice = null;

export default {
  id: 'customers', name: 'Kunden & Geräte', group: 'Für Kunden', icon: 'users', tags: ['Kunde', 'Geräte', 'Inventar', 'Dokumentation'],
  keys: 'kunde kunden akte geräte inventar ansprechpartner lizenzen abos seriennummer garantie kundenakte', online: false,
  async render(p, ctx) {
    try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
    for (const c of coll.entries) { for (const k of ['contacts', 'devices', 'licenses']) if (!Array.isArray(c[k])) c[k] = []; for (const k of ['address', 'pwHint', 'notes']) c[k] = c[k] || ''; }
    const pre = ctx.takePrefill('customers'); if (pre?.addDevice) pendingDevice = pre.addDevice;
    let saveTm = 0;
    const save = (now) => { clearTimeout(saveTm); const go = () => ctx.entries.save(KIND, coll).catch(e => ctx.toast('Speichern fehlgeschlagen: ' + e)); if (now) return go(); saveTm = setTimeout(go, 600); };
    const cur = () => coll.entries.find(c => c.id === sel);
    p.innerHTML = `<div class="util wide"><h3>Kunden & Geräte</h3><div class="sn-grid"><div><input class="input" id="cuQ" type="search" placeholder="Kunde suchen" value="${esc(q)}"><div id="cuList" class="sn-list"></div>
      <form class="row" id="cuNew"><input class="input" name="n" placeholder="Neuer Kunde" required maxlength="80"><button class="btn sm" type="submit">${ic('plus')}</button></form></div><div id="cuMain"></div></div></div>`;
    const list = () => {
      const w = q.toLowerCase();
      $('#cuList', p).innerHTML = coll.entries.filter(c => !w || JSON.stringify(c).toLowerCase().includes(w)).sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map(c => `<button type="button" class="wz-tab" data-cu="${esc(c.id)}" aria-selected="${c.id === sel}"><span>${esc(c.name)}</span><em>${c.devices.length} Geräte</em></button>`).join('') || '<p class="muted">Noch keine Kunden.</p>';
    };
    const subHTML = (key, c) => { const d = SUB[key]; return `<div class="sub"><h5>${ic(d.icon)} ${d.title} <small>${c[key].length}</small></h5>${c[key].map((it, i) => `<div class="cu-item" data-k="${key}" data-i="${i}"><div class="lk-grid">${d.fields.map(([f, l, t]) => `<label class="field"><span>${l}</span>${Array.isArray(t) ? `<select class="input" data-f="${f}">${['', ...t].map(o => `<option${o === it[f] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>` : `<input class="input${['serial', 'mac', 'ip'].includes(f) ? ' mono' : ''}" data-f="${f}" type="${t === 'date' ? 'date' : 'text'}" value="${esc(it[f] || '')}">`}</label>`).join('')}</div>
      <div class="row">${key === 'devices' ? `${it.serial ? `<button class="btn sm ghost" type="button" data-cua="warranty">${ic('shield')}Garantie</button>` : ''}${it.mac ? `<button class="btn sm ghost" type="button" data-cua="wol">${ic('zap')}Aufwecken</button><button class="btn sm ghost" type="button" data-cua="mac">${ic('search')}MAC prüfen</button>` : ''}${it.ip ? `<button class="btn sm ghost" type="button" data-cua="web">${ic('ext')}Weboberfläche</button>` : ''}${daysLeft(it.warranty) !== null ? `<span class="tag${daysLeft(it.warranty) < 30 ? ' cm-chg' : ''}">Garantie ${daysLeft(it.warranty) < 0 ? 'abgelaufen' : 'noch ' + daysLeft(it.warranty) + ' Tage'}</span>` : ''}` : ''}
        ${key === 'contacts' && it.phone ? `<button class="icon-btn" type="button" data-copy="${esc(it.phone)}" title="Nummer kopieren">${ic('telephone')}</button>` : ''}${key === 'licenses' && daysLeft(it.until) !== null ? `<span class="tag${daysLeft(it.until) < 30 ? ' cm-chg' : ''}">${daysLeft(it.until) < 0 ? 'abgelaufen' : 'noch ' + daysLeft(it.until) + ' Tage'}</span>` : ''}
        <button class="icon-btn" type="button" data-cudel title="Entfernen" style="margin-left:auto">${ic('trash')}</button></div></div>`).join('')}
      <div class="row"><button class="btn sm" type="button" data-cuadd="${key}">${ic('plus')}${d.title.replace(/ & .*/, '')} hinzufügen</button>${key === 'devices' ? `<button class="btn sm ghost" type="button" data-cuthis>${ic('monitor')}Diesen Rechner hinzufügen</button>` : ''}</div></div>`; };
    const main = async () => {
      const c = cur(), box = $('#cuMain', p);
      if (pendingDevice && !c) { box.innerHTML = `<div class="chk info"><div><strong>Gerät ${esc(pendingDevice.name)} übernehmen</strong><div class="chk-b">Kunden links auswählen oder neu anlegen – das Gerät wird dort hinzugefügt.</div></div></div>`; return; }
      if (!c) { box.innerHTML = '<p class="muted">Kunden auswählen oder neu anlegen. Hier landen Ansprechpartner, Geräte, Lizenzen, Notizen und die Protokolle aus Abläufen.</p>'; return; }
      if (pendingDevice) { c.devices.push(Object.assign({ name: '', type: '' }, pendingDevice)); pendingDevice = null; save(); ctx.toast('Gerät hinzugefügt'); }
      box.innerHTML = `<div class="cu-head"><input class="input cu-name" data-cf="name" value="${esc(c.name)}"><button class="btn sm lk-del" type="button" data-cux="del">${ic('trash')}Kunde löschen</button></div>
        <div class="lk-grid"><label class="field"><span>Tags</span><input class="input" data-cf="tags" value="${esc(c.tags.join(', '))}"></label><label class="field"><span>Adresse</span><input class="input" data-cf="address" value="${esc(c.address)}"></label>
          <label class="field"><span>Wo liegen die Zugangsdaten? (keine Kennwörter!)</span><input class="input" data-cf="pwHint" value="${esc(c.pwHint)}" placeholder="z. B. Passwortmanager, Ordner „Kunde Müller“"></label></div>
        ${['contacts', 'devices', 'licenses'].map(k => subHTML(k, c)).join('')}
        <div class="sub"><h5>${ic('book')} Notizen</h5><textarea class="input" data-cf="notes" rows="5" placeholder="Markdown: Besonderheiten, Netzwerk, Abläufe …">${esc(c.notes)}</textarea></div>
        <div class="sub"><h5>${ic('clipboard')} Protokolle</h5><div id="cuProt"><span class="muted">Suche …</span></div>
          <button class="btn sm" type="button" data-cux="runbook">${ic('play')}Ablauf für diesen Kunden starten</button></div>`;
      try {
        const { ListWikiArticles } = await import('../../../wailsjs/go/main/App');
        const arts = ((await ListWikiArticles()) || []).filter(a => a.kategorie === 'Protokolle' && ((a.tags || []).some(t => t.toLowerCase() === c.name.toLowerCase()) || a.titel.toLowerCase().includes(c.name.toLowerCase())));
        $('#cuProt', p).innerHTML = arts.length ? `<ul class="plain">${arts.map(a => `<li><a href="#" data-cuwiki="${esc(a.slug)}">${esc(a.titel)}</a></li>`).join('')}</ul>` : '<p class="muted">Noch keine Protokolle. Beim Start eines Ablaufs den Kundennamen eintragen.</p>';
      } catch (_) { $('#cuProt', p).innerHTML = ''; }
    };
    p.addEventListener('input', e => {
      const c = cur(); if (!c) return;
      const cf = e.target.dataset.cf; if (cf) { c[cf] = cf === 'tags' ? splitTags(e.target.value) : e.target.value; save(); if (cf === 'name') list(); return; }
      const f = e.target.dataset.f; if (f) { const it = e.target.closest('.cu-item'); c[it.dataset.k][+it.dataset.i][f] = e.target.value; save(); }
    });
    p.addEventListener('click', async e => {
      const t = e.target;
      const b = t.closest('[data-cu]'); if (b) { sel = b.dataset.cu; list(); main(); return; }
      const w = t.closest('[data-cuwiki]'); if (w) { e.preventDefault(); document.dispatchEvent(new CustomEvent('adminkit:open-wiki', { detail: { slug: w.dataset.cuwiki } })); return; }
      const c = cur(); if (!c) return;
      const add = t.closest('[data-cuadd]'); if (add) { c[add.dataset.cuadd].push({}); save(); main(); return; }
      if (t.closest('[data-cudel]')) { const it = t.closest('.cu-item'); c[it.dataset.k].splice(+it.dataset.i, 1); save(); main(); return; }
      if (t.closest('[data-cuthis]')) {
        const ic_ = await ctx.infoCard().catch(() => ({}));
        c.devices.push({ name: ic_.hostname || '', type: /book|notebook|laptop/i.test(ic_.model || '') ? 'Notebook' : 'PC', os: ic_.os || '', vendor: ic_.manufacturer || '', model: ic_.model || '', serial: ic_.serial || '', ip: (ic_.ips || [])[0] || '' });
        save(); main(); ctx.toast('Dieser Rechner wurde hinzugefügt'); return;
      }
      const a = t.closest('[data-cua]');
      if (a) {
        const d = c.devices[+a.closest('.cu-item').dataset.i];
        if (a.dataset.cua === 'warranty') ctx.openTool('warranty', { serial: d.serial, vendor: d.vendor });
        else if (a.dataset.cua === 'wol') ctx.openTool('wol', { mac: d.mac, name: d.name });
        else if (a.dataset.cua === 'mac') ctx.openTool('macinfo', { q: d.mac });
        else if (a.dataset.cua === 'web') ctx.open('http://' + d.ip);
        return;
      }
      const x = t.closest('[data-cux]'); if (!x) return;
      if (x.dataset.cux === 'runbook') ctx.openTool('runbook', {});
      else if (x.dataset.cux === 'del') {
        if (!await ctx.confirm({ title: `Kunde „${c.name}“ löschen?`, what: 'Die Akte mit Ansprechpartnern, Geräten, Lizenzen und Notizen wird aus dem Vault gelöscht.', impact: 'Die Angaben sind für alle, die den Vault nutzen, weg. Protokolle im Wiki bleiben erhalten.' })) return;
        coll.entries = coll.entries.filter(y => y.id !== c.id); sel = ''; await save(true); list(); main();
      }
    });
    $('#cuQ', p).addEventListener('input', e => { q = e.target.value; list(); });
    $('#cuNew', p).addEventListener('submit', async e => {
      e.preventDefault(); const n = e.target.n.value.trim(); if (!n) return;
      const c = newCustomer(n, new Set(coll.entries.map(x => x.id))); coll.entries.push(c); sel = c.id; e.target.reset();
      await save(true); list(); main();
    });
    list(); main();
    return () => { clearTimeout(saveTm); ctx.entries.save(KIND, coll).catch(() => {}); };
  },
};
export { md };
