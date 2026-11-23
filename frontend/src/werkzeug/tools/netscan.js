// Netzwerk durchsuchen (#128): Geräte im eigenen Netz mit Hersteller, Name,
// Typ-Vermutung und Diensten. Nur nach Bestätigung (wird als Scan sichtbar).
import { $, esc, ic, chk } from '../ui.js';
import { oui, identify, guessFromProbe, PORT_HINTS } from './macinfo.js';

let last = null, cidr = '';
export default {
  id: 'netscan', name: 'Netzwerk durchsuchen', group: 'Netzwerk & Mail', icon: 'network', tags: ['Netzwerk', 'Geräte', 'Inventar'],
  keys: 'netzwerk scan geräte finden ip scanner lan inventar welche geräte drucker nas finden subnetz', online: false,
  async render(p, ctx) {
    const subs = (await ctx.net.subnets().catch(() => [])) || [];
    if (!cidr) cidr = subs[0] || '';
    p.innerHTML = `<div class="util wide"><h3>Netzwerk durchsuchen</h3><p>Findet Geräte im eigenen Netz (höchstens 254 Adressen) und zeigt Hersteller, Namen, offene Dienste und eine Vermutung zum Gerätetyp.</p>
      <div class="row"><label class="field"><span>Netz</span><input class="input mono" id="nsC" value="${esc(cidr)}" list="nsL" placeholder="192.168.178.0/24"><datalist id="nsL">${subs.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
        <button class="btn primary" type="button" id="nsGo">${ic('search')}Durchsuchen</button><button class="btn" type="button" id="nsCsv" hidden>CSV speichern</button></div>
      <div id="nsOut" aria-live="polite"></div></div>`;
    const out = $('#nsOut', p);
    const draw = async () => {
      if (!last) return;
      const map = await oui();
      out.innerHTML = `<div class="sub"><h5>${last.length} Geräte in ${esc(cidr)}</h5><div class="table"><table class="mc-t ns-t"><thead><tr><th>IP</th><th>Name</th><th>Hersteller</th><th>Vermutlich</th><th>Dienste</th><th></th></tr></thead><tbody>
        ${last.map((h, i) => { const id = h.mac ? identify(h.mac, map) : null, g = guessFromProbe({ open_ports: h.ports || [], names: h.name ? [{ name: h.name }] : [] }, id);
          return `<tr><td class="mono">${esc(h.ip)}${h.self ? ' <span class="tag">dieser PC</span>' : ''}</td><td class="mono">${esc(h.name || '–')}</td><td>${esc(id?.vendor || (h.mac ? '' : '–'))}<div class="mono muted ns-mac">${esc(h.mac || '')}</div></td><td>${esc(g || '')}</td>
            <td>${(h.ports || []).map(x => `<span class="tag" title="${esc(PORT_HINTS[x] || '')}">${x}</span>`).join(' ')}</td>
            <td class="ns-act"><button class="btn sm ghost" type="button" data-nsp="${i}">Details</button>${(h.ports || []).some(x => x === 80 || x === 443) ? `<button class="icon-btn" type="button" data-nsw="${esc(h.ip)}" title="Weboberfläche">${ic('ext')}</button>` : ''}<button class="icon-btn" type="button" data-nsk="${i}" title="In Kundenakte übernehmen">${ic('users')}</button></td></tr><tr class="ns-det" hidden><td colspan="6" id="nsD${i}"></td></tr>`; }).join('')}</tbody></table></div></div>`;
      $('#nsCsv', p).hidden = false;
    };
    $('#nsGo', p).onclick = async () => {
      cidr = $('#nsC', p).value.trim();
      const ok = await ctx.confirm({ title: `Netz ${cidr} durchsuchen?`, what: 'Alle Adressen im Netz werden kurz angesprochen (Verbindungsaufbau zu einigen typischen Diensten). Es wird nichts verändert.',
        impact: 'In Firmennetzen nur mit Erlaubnis durchführen: Firewalls und Sicherheitssoftware können das als Netzwerkscan melden. Dauert etwa 20–60 Sekunden.' });
      if (!ok) return;
      out.innerHTML = '<p class="muted">Durchsuche Netz … (bis zu einer Minute)</p>';
      try { last = (await ctx.net.scanSubnet(cidr)) || []; ctx.addAction(`Netz ${cidr} durchsucht: ${last.length} Geräte`, 'info'); draw(); }
      catch (e) { out.innerHTML = chk('warn', 'Durchsuchen nicht möglich', esc(e)); }
    };
    $('#nsCsv', p).onclick = async () => {
      const map = await oui(), csv = ['IP;Name;MAC;Hersteller;Dienste', ...last.map(h => [h.ip, h.name || '', h.mac || '', h.mac ? identify(h.mac, map).vendor : '', (h.ports || []).join(' ')].join(';'))].join('\n');
      const b = new TextEncoder().encode(csv); let s = ''; for (const x of b) s += String.fromCharCode(x); ctx.saveDataURL('netzwerk.csv', 'data:text/csv;base64,' + btoa(s));
    };
    p.addEventListener('click', async e => {
      const w = e.target.closest('[data-nsw]'); if (w) { ctx.open('http://' + w.dataset.nsw); return; }
      const k = e.target.closest('[data-nsk]');
      if (k) { const h = last[+k.dataset.nsk], map = await oui(); ctx.openTool('customers', { addDevice: { name: h.name || h.ip, ip: h.ip, mac: h.mac || '', vendor: h.mac ? identify(h.mac, map).vendor : '' } }); return; }
      const d = e.target.closest('[data-nsp]');
      if (d) {
        const i = +d.dataset.nsp, row = $('#nsD' + i, p), tr = row.parentElement;
        tr.hidden = !tr.hidden; if (tr.hidden || row.innerHTML) return;
        row.innerHTML = '<span class="muted">Frage Gerät ab …</span>';
        try {
          const r = await ctx.net.probe(last[i].ip), u = r.upnp;
          row.innerHTML = [...(r.names || []).map(n => `<b>${esc(n.name)}</b> <span class="muted">(${esc(n.source)})</span>`), u ? `Modell: ${esc([u.manufacturer, u.model_name, u.model_number].filter(Boolean).join(' '))}` : '', r.web_title ? `Weboberfläche: „${esc(r.web_title)}“` : ''].filter(Boolean).join(' · ') || '<span class="muted">Keine weiteren Angaben.</span>';
        } catch (err) { row.textContent = String(err); }
      }
    });
    draw();
  },
};
