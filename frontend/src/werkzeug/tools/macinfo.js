// Geräte-Erkennung (#109). Stufe 1 (offline): Hersteller aus der IEEE-Liste,
// private/zufällige Adressen, Hinweise zum Gerätetyp. Stufe 2 (lokales Netz, nur
// lesend): Gerät abfragen – Namen (DNS/mDNS/NetBIOS), UPnP-Modell, Weboberfläche,
// offene Dienste. Das Modell steckt nie in der MAC selbst.
import { $, esc, ic, chk } from '../ui.js';

let OUI = null;
export function buildOui(V, O) { const m = new Map(); for (const x of O.split(';')) if (x) m.set(x.slice(0, 6), V[parseInt(x.slice(6), 36)]); return m; }
export async function oui() { if (!OUI) { const d = await import('../data/oui.js'); OUI = buildOui(d.V, d.O); } return OUI; }

export function normMac(s) {
  const p = String(s || '').trim().split(/[:-]/);
  const h = p.length === 6 ? p.map(x => x.padStart(2, '0')).join('') : String(s || '').replace(/[\s:.-]/g, '');
  return /^[0-9a-f]{12}$/i.test(h) ? h.toUpperCase().match(/../g).join(':') : '';
}
export function extractMacs(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/\b[0-9a-f]{1,2}(?:[:-][0-9a-f]{1,2}){5}\b|\b[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}\b|\b[0-9a-f]{12}\b/gi)) { const n = normMac(m[0]); if (n && !out.includes(n)) out.push(n); }
  return out;
}
export function macFlags(mac) {
  const b = parseInt(mac.slice(0, 2), 16);
  return { local: !!(b & 2), multicast: !!(b & 1), broadcast: mac === 'FF:FF:FF:FF:FF:FF' };
}
// Bekannte Präfixe, die nicht (sinnvoll) in der IEEE-Liste stehen
export const SPECIAL = { '00:15:5D': 'Hyper-V (virtuelle Maschine)', '08:00:27': 'VirtualBox (virtuelle Maschine)', '00:50:56': 'VMware (virtuelle Maschine)', '00:0C:29': 'VMware (virtuelle Maschine)', '00:05:69': 'VMware (virtuelle Maschine)', '00:1C:42': 'Parallels (virtuelle Maschine)', '00:16:3E': 'Xen (virtuelle Maschine)', '52:54:00': 'QEMU/KVM (virtuelle Maschine)', '02:42:': 'Docker-Container' };
const TYPES = [
  [/brother|kyocera|lexmark|ricoh|konica|xerox|oki data|zebra|toshiba tec|seiko epson|epson/i, 'Drucker oder Multifunktionsgerät', 'printer'],
  [/^canon|^sharp/i, 'Drucker, Kamera oder Unterhaltungselektronik', 'printer'],
  [/^(avm|ubiquiti|tp-link|netgear|juniper|aruba|mikrotik|routerboard|zyxel|lancom|draytek|d-link|linksys|sagemcom|arcadyan|technicolor|fortinet|sophos|cisco|meraki|ruckus|edgecore|compal broadband|askey|sercomm|eero|devolo)/i, 'Netzwerkgerät (Router, Switch, Access Point, Repeater)', 'network'],
  [/^(synology|qnap|western digital|buffalo|asustor|terramaster)/i, 'NAS (Netzwerkspeicher)', 'server'],
  [/^apple/i, 'Apple-Gerät (iPhone, iPad, Mac, Apple TV, Watch …)', 'phone'],
  [/^samsung/i, 'Samsung-Gerät (Handy, Tablet, Fernseher, Drucker …)', 'phone'],
  [/^(xiaomi|oneplus|oppo|vivo|honor|motorola|huawei device|realme|nothing technology|fairphone)/i, 'Smartphone oder Tablet', 'phone'],
  [/^(intel|realtek|broadcom|qualcomm|mediatek|marvell|azurewave|liteon|lite-on|hon hai|foxconn|murata|universal global scientific|wistron|quanta|pegatron|rivet networks|killer|aquantia)/i, 'Netzwerkchip – steckt meist in einem PC oder Notebook (Chiphersteller, nicht Gerätehersteller)', 'monitor'],
  [/^(dell|lenovo|asustek|acer|fujitsu|micro-star|gigabyte|asrock|elitegroup|microsoft|framework|medion|getac|panasonic connect)/i, 'PC, Notebook oder Dockingstation', 'monitor'],
  [/^(hp|hewlett)/i, 'PC, Notebook oder Drucker (HP)', 'monitor'],
  [/^(espressif|tuya|shelly|allterco|sonos|amazon|google|nest|signify|philips lighting|ring|eq-3|tado|sonoff|itead|bosch|ezviz|hikvision|dahua|reolink|ecovacs|roborock|dreame|netatmo)/i, 'Smart-Home, Kamera oder Lautsprecher', 'zap'],
  [/raspberry/i, 'Raspberry Pi', 'server'],
  [/^(lg electronics|sony|tcl|hisense|vestel|roku|nvidia|loewe|metz|grundig|skyworth)/i, 'Fernseher, Konsole oder Mediengerät', 'video'],
  [/^(snom|yealink|gigaset|polycom|grandstream|auerswald|unify|avaya|mitel|fanvil|agfeo)/i, 'Telefon (VoIP)', 'telephone'],
];
export function typeHint(vendor) { for (const [re, t, i] of TYPES) if (re.test(vendor || '')) return { text: t, icon: i }; return null; }

export function identify(mac, map) {
  const f = macFlags(mac), pre = mac.slice(0, 8);
  const special = SPECIAL[pre] || (mac.startsWith('02:42:') ? SPECIAL['02:42:'] : null);
  if (f.broadcast) return { mac, vendor: 'Broadcast', hint: { text: 'Keine Geräteadresse (an alle)', icon: 'network' }, flags: f };
  if (special) return { mac, vendor: special, hint: { text: special, icon: 'server' }, flags: f };
  if (f.multicast) return { mac, vendor: 'Multicast', hint: { text: 'Gruppenadresse, kein einzelnes Gerät', icon: 'network' }, flags: f };
  if (f.local) return { mac, vendor: '', hint: { text: 'Private (zufällige) Adresse – meist Smartphone, Tablet oder Notebook mit „Privater WLAN-Adresse“; Hersteller nicht ablesbar', icon: 'phone' }, flags: f };
  const vendor = map.get(mac.replace(/:/g, '').slice(0, 6)) || '';
  return { mac, vendor, hint: typeHint(vendor), flags: f };
}

export const PORT_HINTS = { 80: 'Weboberfläche', 443: 'Weboberfläche (HTTPS)', 445: 'Dateifreigabe (Windows-PC oder NAS)', 548: 'AFP (Mac oder NAS)', 631: 'Drucken (IPP)', 3389: 'Remotedesktop (Windows-PC)', 5000: 'Synology-NAS oder UPnP', 8009: 'Chromecast / Google-Gerät / Smart-TV', 9100: 'Druckerport (RAW)', 62078: 'iPhone/iPad (Apple-Synchronisation)' };
export function guessFromProbe(r, base) {
  const P = new Set(r.open_ports || []), txt = [r.upnp?.device_type, r.upnp?.model_name, r.web_title, ...(r.names || []).map(n => n.name)].join(' ').toLowerCase();
  if (P.has(9100) || P.has(631) || /printer|drucker|laserjet|officejet|mfc-|ecosys|imagerunner|workforce/.test(txt)) return 'Drucker';
  if (P.has(62078) || /iphone|ipad/.test(txt)) return 'iPhone oder iPad';
  if (/galaxy|android|pixel|redmi/.test(txt)) return 'Android-Smartphone oder -Tablet';
  if (/mediarenderer|tv|bravia|webos|tizen/.test(txt) || P.has(8009)) return 'Fernseher oder Mediengerät';
  if (/fritz|router|internetgatewaydevice|speedport/.test(txt)) return 'Router';
  if (/diskstation|nas|qnap|synology/.test(txt) || (P.has(5000) && P.has(445))) return 'NAS';
  if (P.has(3389)) return 'Windows-PC (Remotedesktop aktiv)';
  if (/macbook|imac|mac-mini|macmini|mac mini/.test(txt) || P.has(548)) return 'Mac';
  if (P.has(445)) return 'Windows-PC oder Server';
  return base?.hint?.text || '';
}

export default {
  id: 'macinfo', name: 'Geräte-Erkennung (MAC)', group: 'Geräte & Hardware', icon: 'search', tags: ['Netzwerk', 'Hardware', 'MAC'],
  keys: 'mac adresse hersteller oui vendor gerät erkennen unbekanntes gerät netzwerk arp ip lookup welches gerät', online: false,
  render(p, ctx) {
    p.innerHTML = `<div class="util wide"><h3>Geräte-Erkennung</h3><p>MAC-Adresse(n) oder die Ausgabe von <span class="mono">arp -a</span> einfügen: Hersteller und Hinweis auf den Gerätetyp. Für genauere Angaben (Name, Modell, Dienste) kann ein Gerät im lokalen Netz abgefragt werden.</p>
      <label class="field"><span class="sr">MAC-Adressen</span><textarea class="input mono" id="maIn" rows="3" spellcheck="false" placeholder="3C:A6:2F:11:22:33 oder arp -a Ausgabe"></textarea></label>
      <div class="row"><button class="btn primary" type="button" id="maGo">${ic('search')}Hersteller ermitteln</button><button class="btn" type="button" id="maArp">${ic('network')}Geräte im Netz anzeigen</button>
        <label class="field" style="margin-left:auto"><span class="sr">IP abfragen</span><input class="input mono" id="maIp" placeholder="IP genauer abfragen, z. B. 192.168.178.25" spellcheck="false"></label><button class="btn" type="button" id="maProbe">Abfragen</button></div>
      <div id="maOut" aria-live="polite"></div><div id="maProbeOut"></div>
      <p class="note">Was geht, was nicht: Die MAC verrät nur den Hersteller der Netzwerkkarte, nie das Modell. Namen wie „Galaxy-S21-FE“ oder Druckermodelle kommen erst über die Abfrage im lokalen Netz – und nur, wenn das Gerät sie preisgibt. Monitore, Tastaturen usw. haben keine Netzwerkadresse.</p></div>`;
    const inp = $('#maIn', p), out = $('#maOut', p), pout = $('#maProbeOut', p);
    const row = (x, ip) => `<tr><td class="mono">${esc(x.mac)}</td>${ip !== undefined ? `<td class="mono">${esc(ip)}</td>` : ''}<td>${esc(x.vendor || '–')}</td><td>${x.hint ? `${ic(x.hint.icon)} ${esc(x.hint.text)}` : '<span class="muted">kein Hinweis</span>'}</td>${ip ? `<td><button class="btn sm" type="button" data-maip="${esc(ip)}">Abfragen</button></td>` : ip !== undefined ? '<td></td>' : ''}</tr>`;
    const run = async () => {
      const macs = extractMacs(inp.value);
      if (!macs.length) { out.innerHTML = inp.value.trim() ? chk('info', 'Keine MAC-Adresse erkannt', 'Format z. B. 3C:A6:2F:11:22:33, 3C-A6-2F-11-22-33 oder 3ca62f112233.') : ''; return; }
      const m = await oui();
      out.innerHTML = `<div class="sub"><h5>Ergebnis <small>${macs.length}</small></h5><div class="table"><table class="mc-t"><thead><tr><th>MAC</th><th>Hersteller</th><th>Hinweis</th></tr></thead><tbody>${macs.map(x => row(identify(x, m))).join('')}</tbody></table></div></div>`;
    };
    const probe = async ip => {
      pout.innerHTML = `<p class="muted">Frage ${esc(ip)} ab (Namen, Modell, Dienste) …</p>`;
      let r; try { r = await ctx.net.probe(ip); } catch (e) { pout.innerHTML = chk('warn', 'Abfrage nicht möglich', esc(e)); return; }
      const m = await oui(), base = r.mac ? identify(r.mac, m) : null, guess = guessFromProbe(r, base);
      const u = r.upnp;
      pout.innerHTML = `<div class="sub"><h5>${esc(ip)}${guess ? ` <small>vermutlich: ${esc(guess)}</small>` : ''}</h5><dl class="kv mc-kv">
        ${r.mac ? `<dt>MAC</dt><dd><span class="mono">${esc(r.mac)}</span>&nbsp;· ${esc(base.vendor || base.hint?.text || '–')}</dd>` : '<dt>MAC</dt><dd class="muted">nicht in der ARP-Tabelle (anderes Netz?)</dd>'}
        ${(r.names || []).map(n => `<dt>Name (${esc(n.source)})</dt><dd class="mono">${esc(n.name)}</dd>`).join('')}
        ${u ? `<dt>Modell (UPnP)</dt><dd>${esc([u.manufacturer, u.model_name, u.model_number].filter(Boolean).join(' '))}${u.friendly_name ? ` · „${esc(u.friendly_name)}“` : ''}</dd>` : ''}
        ${r.web_title ? `<dt>Weboberfläche</dt><dd>${esc(r.web_title)}</dd>` : ''}
        <dt>Offene Dienste</dt><dd>${(r.open_ports || []).length ? r.open_ports.map(x => `<span class="tag" title="${esc(PORT_HINTS[x] || '')}">${x} ${esc(PORT_HINTS[x] || '')}</span>`).join(' ') : '<span class="muted">keine der geprüften</span>'}</dd></dl>
        ${(r.open_ports || []).some(x => x === 80 || x === 443) ? `<button class="btn sm" type="button" data-maweb="${esc(ip)}">${ic('ext')}Weboberfläche öffnen</button>` : ''}
        ${!(r.names || []).length && !u && !r.web_title ? '<p class="note">Das Gerät gibt keine Namen oder Modelldaten preis. Im Router (Heimnetz-Übersicht) steht oft der beim Verbinden gemeldete Gerätename.</p>' : ''}</div>`;
    };
    $('#maGo', p).onclick = run;
    let tm; inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 300); });
    $('#maArp', p).onclick = async () => {
      out.innerHTML = '<p class="muted">Lese ARP-Tabelle …</p>';
      let L; try { L = (await ctx.net.arp()) || []; } catch (e) { out.innerHTML = chk('warn', 'ARP-Tabelle nicht lesbar', esc(e)); return; }
      const m = await oui();
      out.innerHTML = L.length ? `<div class="sub"><h5>Bekannte Geräte im Netz <small>${L.length}</small></h5><p class="note">Nur Geräte, mit denen dieser Rechner kürzlich Kontakt hatte.</p><div class="table"><table class="mc-t"><thead><tr><th>MAC</th><th>IP</th><th>Hersteller</th><th>Hinweis</th><th></th></tr></thead><tbody>${L.map(n => row(identify(n.mac, m), n.ip)).join('')}</tbody></table></div></div>` : chk('info', 'Keine Einträge', 'Die ARP-Tabelle ist leer.');
    };
    $('#maProbe', p).onclick = () => { const ip = $('#maIp', p).value.trim(); if (ip) probe(ip); };
    const pre = ctx.takePrefill('macinfo'); if (pre?.q) { inp.value = pre.q; run(); }
    p.addEventListener('click', e => { const b = e.target.closest('[data-maip]'); if (b) { $('#maIp', p).value = b.dataset.maip; probe(b.dataset.maip); return; } const w = e.target.closest('[data-maweb]'); if (w) ctx.open('http://' + w.dataset.maweb); });
  },
};
