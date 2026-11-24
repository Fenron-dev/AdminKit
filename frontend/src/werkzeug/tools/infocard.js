// Info-Karte fürs Telefonat (#127): große, gut lesbare Werte zum Vorlesen.
import { $, esc, ic } from '../ui.js';

export default {
  id: 'infocard', name: 'Info-Karte', group: 'Für Kunden', icon: 'monitor', tags: ['Telefon', 'Kunde', 'Fernwartung'],
  keys: 'info karte rechnername computername ip adresse benutzer seriennummer anydesk teamviewer fernwartung id telefon vorlesen', online: false,
  async render(p, ctx) {
    p.innerHTML = `<div class="util wide"><h3>Info-Karte</h3><p class="muted">Lese Angaben …</p></div>`;
    const c = await ctx.infoCard().catch(() => ({}));
    const own = ctx.state.get('infocardExtra', '');
    const rows = [['Rechnername', c.hostname], ['Benutzer', c.user], ['IP-Adresse', (c.ips || []).join(', ')], ['System', c.os], ['Gerät', [c.manufacturer, c.model].filter(Boolean).join(' ')], ['Seriennummer', c.serial], ['AnyDesk-ID', c.anydesk], ['TeamViewer-ID', c.teamviewer]].filter(r => r[1]);
    p.innerHTML = `<div class="util wide"><h3>Info-Karte</h3><p>Zum Vorlesen am Telefon. Klick auf einen Wert kopiert ihn, „Buchstabieren“ öffnet die Buchstabiertafel.</p>
      <div class="ic-card" id="icCard">${rows.map(([k, v]) => `<div class="ic-row"><span>${esc(k)}</span><b class="mono" data-copy="${esc(v)}" title="Kopieren">${esc(v)}</b><button class="icon-btn" type="button" data-icspell="${esc(v)}" title="Buchstabieren">${ic('telephone')}</button></div>`).join('')}
        <div class="ic-row" id="icPub"><span>Öffentliche IP</span><button class="btn sm ghost" type="button" id="icPubBtn">${ic('globe')}Abfragen</button></div></div>
      <label class="field"><span>Eigene Zeile (z. B. Support-Telefon, Ticketnummer)</span><input class="input" id="icExtra" value="${esc(own)}"></label>
      <div class="row"><button class="btn primary" type="button" id="icCopy">${ic('copy')}Alles kopieren</button><button class="btn" type="button" id="icBig">${ic('eye')}Vollbild</button></div></div>`;
    const text = () => rows.map(([k, v]) => `${k}: ${v}`).concat($('#icExtra', p).value ? [$('#icExtra', p).value] : []).join('\n');
    $('#icExtra', p).addEventListener('input', e => ctx.state.set('infocardExtra', e.target.value));
    $('#icCopy', p).onclick = () => ctx.copy(text(), 'Info-Karte kopiert');
    $('#icBig', p).onclick = () => { const el = $('#icCard', p); el.classList.toggle('ic-full'); if (el.classList.contains('ic-full')) el.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.().catch(() => {}); };
    $('#icPubBtn', p).onclick = async () => {
      try { const ip = await ctx.publicIP(); $('#icPub', p).innerHTML = `<span>Öffentliche IP</span><b class="mono" data-copy="${esc(ip)}">${esc(ip)}</b>`; rows.push(['Öffentliche IP', ip]); }
      catch (e) { ctx.toast(String(e).includes('Online') || String(e).includes('freig') ? String(e) : 'Nicht ermittelbar: ' + e); }
    };
    p.addEventListener('click', e => { const s = e.target.closest('[data-icspell]'); if (s) ctx.openTool('spell', { text: s.dataset.icspell }); });
  },
};
