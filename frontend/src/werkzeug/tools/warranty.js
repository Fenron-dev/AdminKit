// Garantie & Support (#111): Seriennummer → Garantie-/Supportseite des Herstellers.
// Nur Links, keine Abfragen im Hintergrund. Wo die Seite die Seriennummer nicht
// über die Adresse annimmt, wird sie in die Zwischenablage kopiert.
// Eigene Hersteller/Portale (Adresse mit {serial}) liegen im Vault (Sammlung „garantie“).
import { $, esc, ic } from '../ui.js';
import { parseCollection, emptyCollection, uniqueId } from '../entries.js';

const KIND = 'garantie';
// url: {serial} wird ersetzt; ohne {serial} → Seite öffnen + Seriennummer kopieren
export const VENDORS = [
  { id: 'dell', name: 'Dell', match: /\bdell\b|alienware/i, links: [['Garantie & Übersicht', 'https://www.dell.com/support/home/de-de/product-support/servicetag/{serial}/overview'], ['Treiber & Downloads', 'https://www.dell.com/support/home/de-de/product-support/servicetag/{serial}/drivers']] },
  { id: 'hp', name: 'HP', match: /\bhp\b|hewlett/i, links: [['Garantie prüfen', 'https://support.hp.com/de-de/check-warranty'], ['Treiber & Software', 'https://support.hp.com/de-de/drivers']] },
  { id: 'lenovo', name: 'Lenovo', match: /lenovo/i, links: [['Support & Garantie', 'https://pcsupport.lenovo.com/de/de']] },
  { id: 'apple', name: 'Apple', match: /apple/i, links: [['Garantie & Service', 'https://checkcoverage.apple.com/']] },
  { id: 'asus', name: 'ASUS', match: /asus/i, links: [['Support & Garantie', 'https://www.asus.com/de/support/']] },
  { id: 'acer', name: 'Acer', match: /acer/i, links: [['Support & Garantie', 'https://www.acer.com/de-de/support']] },
  { id: 'surface', name: 'Microsoft Surface', match: /microsoft/i, links: [['Garantie (Geschäftskunden)', 'https://mybusinessservice.surface.com/'], ['Geräte im Microsoft-Konto', 'https://account.microsoft.com/devices']] },
  { id: 'samsung', name: 'Samsung', match: /samsung/i, links: [['Support', 'https://www.samsung.com/de/support/']] },
  { id: 'brother', name: 'Brother', match: /brother/i, links: [['Support & Downloads', 'https://support.brother.com/']] },
];

export const fillUrl = (u, serial) => u.replace(/\{serial\}/g, encodeURIComponent(serial.trim()));
export const needsCopy = u => !u.includes('{serial}');
export function guessVendor(manufacturer, serial, list = VENDORS) {
  if (manufacturer) { const v = list.find(x => x.match && x.match.test(manufacturer)); if (v) return v.id; }
  const s = String(serial || '').trim();
  if (/^[A-Z0-9]{7}$/i.test(s)) return 'dell'; // Dell-Service-Tag: 7 Zeichen
  return '';
}

let coll = emptyCollection(), S = { serial: '', vendor: '' };

export default {
  id: 'warranty', name: 'Garantie & Support', group: 'Geräte & Hardware', icon: 'shield', tags: ['Hardware', 'Seriennummer', 'Garantie', 'Treiber'],
  keys: 'garantie warranty seriennummer service tag servicetag dell hp lenovo apple asus acer surface samsung brother treiber support', online: false,
  async render(p, ctx) {
    try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
    const pre = ctx.takePrefill('warranty'); if (pre?.serial) { S.serial = pre.serial; S.vendor = guessVendor(pre.vendor || '', pre.serial) || S.vendor; }
    const all = () => VENDORS.concat(coll.entries.map(e => ({ id: e.id, name: e.name, own: true, links: (e.links || []).map(l => [l.label, l.url]) })));
    p.innerHTML = `<div class="util wide"><h3>Garantie & Support</h3><p>Seriennummer eingeben und Hersteller wählen: öffnet die Garantie- bzw. Supportseite im Browser. Es werden keine Daten im Hintergrund abgefragt.</p>
      <div class="row"><label class="field" style="flex:1"><span>Seriennummer / Service-Tag</span><input class="input mono" id="waSn" value="${esc(S.serial)}" spellcheck="false" autocomplete="off"></label>
      <button class="btn" type="button" id="waMe">${ic('monitor')}Dieses Gerät</button></div><p class="note" id="waId"></p>
      <div class="lst-modes" id="waV"></div><div id="waLinks"></div>
      <details class="howto"><summary>${ic('plus')}Eigenes Portal hinzufügen (z. B. Fujitsu, Medion, Händlerportal)</summary><div class="howto-b"><form class="lk-form" id="waF">
        <div class="lk-grid"><label class="field"><span>Name</span><input class="input" name="name" required maxlength="60"></label>
        <label class="field"><span>Adresse – <span class="mono">{serial}</span> wird durch die Seriennummer ersetzt</span><input class="input mono" name="url" required placeholder="https://…/{serial}" spellcheck="false"></label></div>
        <button class="btn primary" type="submit">Hinzufügen</button></form><div id="waOwn"></div></div></details>
      <details class="howto"><summary>${ic('info')}Wo steht die Seriennummer?</summary><div class="howto-b">
        <p><b>Windows:</b> <code>wmic bios get serialnumber</code> bzw. in PowerShell <code>Get-CimInstance Win32_BIOS | Select SerialNumber</code>. <b>macOS:</b> Apple-Menü → Über diesen Mac.</p>
        <p><b>Am Gerät:</b> Aufkleber auf der Unterseite (Notebook), Rückseite (PC, Monitor), unter dem Akku (ältere Notebooks). Bei Dell heißt sie „Service Tag“, bei HP „S/N“, bei Lenovo „S/N“ neben „MT“ (Maschinentyp).</p></div></details></div>`;
    const sn = $('#waSn', p), vEl = $('#waV', p), lEl = $('#waLinks', p);
    const draw = () => {
      S.serial = sn.value;
      vEl.innerHTML = all().map(v => `<button type="button" class="lk-chip${S.vendor === v.id ? ' on' : ''}" data-wv="${esc(v.id)}">${esc(v.name)}</button>`).join('');
      const v = all().find(x => x.id === S.vendor);
      if (!v) { lEl.innerHTML = '<p class="muted">Hersteller wählen.</p>'; return; }
      const has = !!sn.value.trim();
      lEl.innerHTML = `<div class="sub"><h5>${esc(v.name)}</h5><div class="row">${v.links.map(([l, u], i) => `<button class="btn${i ? '' : ' primary'}" type="button" data-wo="${i}"${!has && !needsCopy(u) ? ' disabled title="Erst Seriennummer eingeben"' : ''}>${ic('ext')}${esc(l)}</button>`).join('')}</div>
        ${v.links.some(([, u]) => needsCopy(u)) ? '<p class="note">Diese Seite nimmt die Seriennummer nicht über die Adresse an – sie wird beim Öffnen in die Zwischenablage kopiert und muss dort eingefügt werden.</p>' : ''}</div>`;
      $('#waOwn', p).innerHTML = coll.entries.length ? `<ul class="plain">${coll.entries.map(e => `<li>${esc(e.name)} <span class="mono muted">${esc(e.links?.[0]?.url || '')}</span> <button class="icon-btn" type="button" data-wdel="${esc(e.id)}" title="Löschen">${ic('trash')}</button></li>`).join('')}</ul>` : '';
    };
    p.addEventListener('click', async e => {
      const t = e.target;
      const vb = t.closest('[data-wv]'); if (vb) { S.vendor = vb.dataset.wv; draw(); return; }
      const ob = t.closest('[data-wo]');
      if (ob) {
        const v = all().find(x => x.id === S.vendor), [, u] = v.links[+ob.dataset.wo], s = sn.value.trim();
        if (needsCopy(u)) { if (s) await ctx.copy(s, 'Seriennummer kopiert – auf der Seite einfügen'); ctx.open(u); } else ctx.open(fillUrl(u, s));
        return;
      }
      const d = t.closest('[data-wdel]');
      if (d) {
        const o = coll.entries.find(x => x.id === d.dataset.wdel);
        if (!await ctx.confirm({ title: `„${o.name}“ entfernen?`, what: 'Das eigene Portal wird aus dem Vault gelöscht.', impact: 'Es fehlt danach für alle, die diesen Vault nutzen.' })) return;
        coll.entries = coll.entries.filter(x => x.id !== o.id);
        try { await ctx.entries.save(KIND, coll); } catch (err) { ctx.toast(String(err)); }
        if (S.vendor === o.id) S.vendor = ''; draw();
      }
    });
    $('#waF', p).addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target), name = String(fd.get('name')).trim(), url = String(fd.get('url')).trim();
      if (!/^https?:\/\/[^\s/]+/i.test(url)) { ctx.toast('Nur http(s)-Adressen erlaubt'); return; }
      const id = uniqueId('eigen-' + name, new Set(all().map(x => x.id)));
      coll.entries.push({ id, name, links: [{ label: 'Öffnen', url }] });
      try { await ctx.entries.save(KIND, coll); ctx.addAction('Garantie-Portal hinzugefügt: ' + name, 'success'); } catch (err) { ctx.toast(String(err)); return; }
      e.target.reset(); S.vendor = id; draw();
    });
    sn.addEventListener('input', () => { if (!S.vendor) S.vendor = guessVendor('', sn.value); draw(); });
    $('#waMe', p).onclick = async () => {
      try {
        const id = await ctx.deviceIdentity();
        if (!id.serial) { ctx.toast('Keine Seriennummer im BIOS hinterlegt'); }
        sn.value = id.serial || sn.value; S.vendor = guessVendor(id.manufacturer, id.serial) || S.vendor;
        $('#waId', p).textContent = [id.manufacturer, id.model].filter(Boolean).join(' · ');
        draw();
      } catch (err) { ctx.toast('Geräteinfo nicht lesbar: ' + err); }
    };
    draw();
  },
};
