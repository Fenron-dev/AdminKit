// Router- & Geräte-Zugänge (#112): Standardadressen der Weboberflächen,
// wo das Kennwort steht und Hinweise zum Zurücksetzen. Bewusst keine Liste von
// Standardpasswörtern. Eigene Einträge (z. B. Kundengeräte) im Vault (Sammlung „router“).
import { $, esc, ic } from '../ui.js';
import { mdInline } from '../markdown.js';
import { parseCollection, emptyCollection, splitTags, uniqueId } from '../entries.js';

const KIND = 'router';
const RESET = 'Reset-Taste am Gerät (meist mit einer Büroklammer) – Dauer laut Handbuch. Danach gelten wieder die Zugangsdaten vom Typenschild, alle Einstellungen sind weg.';
export const DEVICES = [
  { id: 'fritzbox', name: 'FRITZ!Box (AVM)', addr: ['http://fritz.box', 'http://192.168.178.1'], pw: 'FRITZ!Box-Kennwort auf dem Typenschild an der Unterseite.', tags: ['Router', 'DSL', 'Kabel', 'Glasfaser'],
    hints: ['Notfall-IP, wenn nichts geht: `169.254.1.1` (PC per LAN-Kabel direkt anschließen).', 'Zurücksetzen ohne Kennwort: in der Anmeldeseite „Kennwort vergessen“ → Werkseinstellungen (nur kurz nach dem Einschalten bzw. per Taste am Gerät bestätigen).', 'Mit angeschlossenem Telefon: `#991*15901590*` wählen und auflegen → Werkseinstellungen.'] },
  { id: 'fritzrep', name: 'FRITZ!Repeater', addr: ['http://fritz.repeater'], pw: 'Kennwort auf dem Typenschild bzw. beim ersten Aufruf festgelegt.', tags: ['WLAN', 'Repeater'], hints: [] },
  { id: 'speedport', name: 'Telekom Speedport', addr: ['http://speedport.ip', 'http://192.168.2.1'], pw: 'Gerätepasswort auf der Rück- oder Unterseite.', tags: ['Router', 'DSL', 'Telekom'], hints: [RESET] },
  { id: 'vodafone', name: 'Vodafone Station', addr: ['http://192.168.0.1'], pw: 'Kennwort auf dem Aufkleber des Geräts.', tags: ['Router', 'Kabel', 'Vodafone'], hints: ['Bei FRITZ!Box von Vodafone: siehe FRITZ!Box.', RESET] },
  { id: 'o2', name: 'o2 HomeBox', addr: ['http://192.168.1.1'], pw: 'Kennwort auf dem Typenschild.', tags: ['Router', 'DSL', 'o2'], hints: [RESET] },
  { id: 'tplink', name: 'TP-Link (Router, Repeater, Deco)', addr: ['http://tplinkwifi.net', 'http://192.168.0.1', 'http://192.168.1.1'], pw: 'Wird beim ersten Aufruf festgelegt (ältere Geräte: Typenschild).', tags: ['Router', 'WLAN', 'Repeater'], hints: ['Deco-Mesh wird über die Deco-App verwaltet.', RESET] },
  { id: 'netgear', name: 'NETGEAR', addr: ['http://routerlogin.net', 'http://192.168.1.1'], pw: 'Wird bei der Einrichtung festgelegt; WLAN-Schlüssel auf dem Typenschild.', tags: ['Router', 'WLAN'], hints: [RESET] },
  { id: 'asus', name: 'ASUS-Router', addr: ['http://router.asus.com', 'http://192.168.50.1', 'http://192.168.1.1'], pw: 'Wird bei der Einrichtung festgelegt.', tags: ['Router', 'WLAN'], hints: [RESET] },
  { id: 'linksys', name: 'Linksys', addr: ['http://myrouter.local', 'http://192.168.1.1'], pw: 'Wird bei der Einrichtung festgelegt.', tags: ['Router', 'WLAN'], hints: [RESET] },
  { id: 'synology', name: 'Synology NAS', addr: ['https://find.synology.com', 'http://<IP>:5000', 'https://<IP>:5001'], pw: 'Admin-Konto wird bei der Einrichtung angelegt.', tags: ['NAS', 'Speicher'], hints: ['IP im Router (Heimnetz-Übersicht) oder mit find.synology.com / Synology Assistant suchen.', 'Kurzer Druck (4 Sek.) auf die Reset-Taste setzt nur Netzwerk und Admin-Kennwort zurück, Daten bleiben erhalten.'] },
  { id: 'qnap', name: 'QNAP NAS', addr: ['http://<IP>:8080', 'https://<IP>:443'], pw: 'Admin-Konto wird bei der Einrichtung angelegt.', tags: ['NAS', 'Speicher'], hints: ['IP mit Qfinder Pro oder im Router suchen.', 'Reset-Taste 3 Sek.: Netzwerk und Admin-Kennwort zurücksetzen, Daten bleiben erhalten.'] },
  { id: 'unifi', name: 'UniFi (Ubiquiti)', addr: ['https://unifi.ui.com', 'https://<IP>:8443'], pw: 'UI-Konto bzw. lokales Konto des Controllers.', tags: ['Netzwerk', 'WLAN', 'Firma'], hints: ['Geräte werden im Controller bzw. in der UniFi-App verwaltet, nicht einzeln.'] },
  { id: 'printer', name: 'Netzwerkdrucker (allgemein)', addr: ['http://<IP>'], pw: 'Oft auf dem Typenschild (neuere Geräte) oder leer/„admin“ bei älteren – beim ersten Zugriff ändern.', tags: ['Drucker'], hints: ['IP-Adresse: Konfigurationsseite am Gerät drucken oder im Router nachsehen.', 'Feste IP bzw. DHCP-Reservierung einrichten, damit der Drucker nicht „verschwindet“.'] },
];

export const openable = a => /^https?:\/\/[^<\s]+$/i.test(a);
let coll = emptyCollection(), lastQ = '';

export default {
  id: 'router', name: 'Router- & Geräte-Zugänge', group: 'Geräte & Hardware', icon: 'network', tags: ['Router', 'Netzwerk', 'NAS', 'Drucker'],
  keys: 'router fritzbox fritz box speedport vodafone o2 tplink netgear asus nas synology qnap unifi weboberfläche login ip 192.168 gateway zurücksetzen werkseinstellungen reset', online: false,
  async render(p, ctx) {
    try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
    const all = () => coll.entries.map(e => Object.assign({ own: true }, e)).concat(DEVICES);
    p.innerHTML = `<div class="util wide"><h3>Router- & Geräte-Zugänge</h3><p>Wie komme ich auf die Weboberfläche, wo steht das Kennwort, wie setze ich zurück? Links öffnen im Standardbrowser.</p>
      <div class="row"><button class="btn primary" type="button" id="rtGw">${ic('network')}Router dieses Rechners öffnen</button><span id="rtGwOut" class="muted"></span></div>
      <div class="row"><label class="field" style="flex:1"><span class="sr">Filtern</span><input class="input" id="rtQ" type="search" value="${esc(lastQ)}" placeholder="Gerät suchen, z. B. fritz, nas, drucker"></label><button class="btn" type="button" id="rtNew">${ic('plus')}Eigenes Gerät</button></div>
      <div id="rtForm"></div><div id="rtList"></div></div>`;
    const list = $('#rtList', p), form = $('#rtForm', p), q = $('#rtQ', p);
    const card = x => `<div class="er-card${x.own ? ' er-own' : ''}"><div class="er-head"><b>${esc(x.name)}</b>${x.own ? '<span class="tag">eigenes Gerät</span>' : ''}${(x.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        ${x.own ? `<button class="icon-btn" type="button" data-rted="${esc(x.id)}" title="Bearbeiten">${ic('pencil')}</button>` : ''}</div>
      <div class="rt-addr">${(x.addr || []).map(a => openable(a) ? `<button class="btn sm" type="button" data-rtopen="${esc(a)}">${ic('ext')}${esc(a.replace(/^https?:\/\//, ''))}</button>` : `<span class="mono rt-ph">${esc(a)}</span>`).join('')}</div>
      ${x.pw ? `<p><b>Kennwort:</b> ${esc(x.pw)}</p>` : ''}${(x.hints || []).length ? `<ul class="plain rt-h">${x.hints.map(h => `<li>${mdInline(h)}</li>`).join('')}</ul>` : ''}</div>`;
    const draw = () => {
      lastQ = q.value;
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const L = all().filter(x => words.every(w => [x.name, (x.addr || []).join(' '), (x.tags || []).join(' ')].join(' ').toLowerCase().includes(w)));
      list.innerHTML = L.map(card).join('') || '<p class="muted">Kein Gerät passt. Mit „Eigenes Gerät“ anlegen.</p>';
    };
    const showForm = o => {
      const x = o || { name: '', addr: [], pw: '', hints: [], tags: [] };
      form.innerHTML = `<form class="panel lk-form" id="rtF"><strong>${o ? 'Gerät bearbeiten' : 'Eigenes Gerät'}</strong>
        <p class="muted">Keine Kennwörter hier speichern – dafür ist der Passwortmanager da. Nur wo es steht.</p>
        <div class="lk-grid"><label class="field"><span>Name</span><input class="input" name="name" value="${esc(x.name)}" required maxlength="80" placeholder="z. B. Kunde Müller – Firewall"></label>
        <label class="field"><span>Adressen, mit Komma getrennt</span><input class="input mono" name="addr" value="${esc((x.addr || []).join(', '))}" placeholder="https://192.168.10.1:4444" spellcheck="false"></label>
        <label class="field"><span>Wo steht das Kennwort?</span><input class="input" name="pw" value="${esc(x.pw || '')}" placeholder="z. B. Passwortmanager, Eintrag „Kunde Müller Firewall“"></label>
        <label class="field"><span>Tags, mit Komma getrennt</span><input class="input" name="tags" value="${esc((x.tags || []).join(', '))}"></label></div>
        <label class="field"><span>Hinweise, eine Zeile pro Hinweis</span><textarea class="input" name="hints" rows="3">${esc((x.hints || []).join('\n'))}</textarea></label>
        <div class="row"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-rtx="cancel">Abbrechen</button>${o ? `<button class="btn lk-del" type="button" data-rtx="del" data-id="${esc(o.id)}">${ic('trash')}Löschen</button>` : ''}</div></form>`;
      const f = $('#rtF', form);
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const fd = new FormData(f);
        const e = { name: String(fd.get('name')).trim(), addr: String(fd.get('addr')).split(',').map(s => s.trim()).filter(Boolean).map(a => /^[a-z]+:\/\//i.test(a) || a.includes('<') ? a : 'http://' + a),
          pw: String(fd.get('pw')).trim(), hints: String(fd.get('hints')).split('\n').map(s => s.trim()).filter(Boolean), tags: splitTags(fd.get('tags')) };
        if (!e.name) return;
        if (o) Object.assign(coll.entries.find(y => y.id === o.id), e);
        else coll.entries.push(Object.assign({ id: uniqueId(e.name, new Set(coll.entries.map(y => y.id))) }, e));
        try { await ctx.entries.save(KIND, coll); ctx.addAction('Gerät gespeichert: ' + e.name, 'success'); } catch (err) { ctx.toast('Speichern fehlgeschlagen: ' + err); return; }
        form.innerHTML = ''; draw();
      });
      f.querySelector('[name=name]').focus();
    };
    p.addEventListener('click', async ev => {
      const t = ev.target;
      const o = t.closest('[data-rtopen]'); if (o) { ctx.open(o.dataset.rtopen); return; }
      const ed = t.closest('[data-rted]'); if (ed) { showForm(coll.entries.find(y => y.id === ed.dataset.rted)); p.closest('.wz-pane')?.scrollTo?.(0, 0); return; }
      const x = t.closest('[data-rtx]'); if (!x) return;
      if (x.dataset.rtx === 'cancel') { form.innerHTML = ''; return; }
      const e = coll.entries.find(y => y.id === x.dataset.id);
      if (!await ctx.confirm({ title: `„${e.name}“ löschen?`, what: 'Das eigene Gerät wird aus dem Vault gelöscht.', impact: 'Die Angaben sind danach für alle, die diesen Vault nutzen, weg.' })) return;
      coll.entries = coll.entries.filter(y => y.id !== e.id);
      try { await ctx.entries.save(KIND, coll); ctx.addAction('Gerät gelöscht: ' + e.name, 'success'); } catch (err) { ctx.toast(String(err)); }
      form.innerHTML = ''; draw();
    });
    q.addEventListener('input', draw);
    $('#rtNew', p).onclick = () => showForm(null);
    $('#rtGw', p).onclick = async () => {
      const out = $('#rtGwOut', p); out.textContent = 'Suche Standardgateway…';
      try {
        const gws = (await ctx.gateways()) || [];
        const v4 = gws.filter(g => /^\d+\.\d+\.\d+\.\d+$/.test(g));
        if (!v4.length) { out.textContent = 'Kein Standardgateway gefunden (keine Netzwerkverbindung?).'; return; }
        out.innerHTML = 'Gateway: ' + v4.map(g => `<button class="btn sm ghost" type="button" data-rtopen="http://${esc(g)}">${esc(g)}</button>`).join(' ');
        ctx.open('http://' + v4[0]);
      } catch (err) { out.textContent = 'Nicht ermittelbar: ' + err; }
    };
    draw();
  },
};
