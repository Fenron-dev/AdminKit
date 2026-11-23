// QR-Codes (#115): Link, Kontakt (vCard), Telefon, SMS, E-Mail, Text – mit
// Beschriftung, PNG/SVG und Druckbogen mit mehreren Aufklebern pro Seite
// (z. B. Support-Kontakt auf Geräte kleben). WLAN bleibt im eigenen Werkzeug.
import QRCode from 'qrcode';
import { $, esc, ic } from '../ui.js';

export const TYPES = { url: 'Link', vcard: 'Kontakt', tel: 'Telefon', sms: 'SMS', mail: 'E-Mail', text: 'Text' };
const vEsc = s => String(s || '').replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
const telClean = s => String(s || '').replace(/[^\d+]/g, '');

export function qrPayload(t, d) {
  switch (t) {
    case 'url': { const u = String(d.url || '').trim(); return u && !/^[a-z][a-z0-9+.-]*:/i.test(u) ? 'https://' + u : u; }
    case 'tel': return d.tel ? 'tel:' + telClean(d.tel) : '';
    case 'sms': return d.tel ? `SMSTO:${telClean(d.tel)}:${d.msg || ''}` : '';
    case 'mail': { if (!d.mail) return ''; const q = [d.subject && 'subject=' + encodeURIComponent(d.subject), d.body && 'body=' + encodeURIComponent(d.body)].filter(Boolean).join('&'); return 'mailto:' + d.mail.trim() + (q ? '?' + q : ''); }
    case 'vcard': {
      if (!d.fn && !d.ln && !d.org) return '';
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(d.ln)};${vEsc(d.fn)};;;`, `FN:${vEsc([d.fn, d.ln].filter(Boolean).join(' ') || d.org)}`];
      if (d.org) L.push('ORG:' + vEsc(d.org));
      if (d.title) L.push('TITLE:' + vEsc(d.title));
      if (d.tel) L.push('TEL;TYPE=WORK,VOICE:' + telClean(d.tel));
      if (d.mobile) L.push('TEL;TYPE=CELL:' + telClean(d.mobile));
      if (d.mail) L.push('EMAIL;TYPE=WORK:' + d.mail.trim());
      if (d.web) L.push('URL:' + d.web.trim());
      if (d.street || d.city) L.push(`ADR;TYPE=WORK:;;${vEsc(d.street)};${vEsc(d.city)};;${vEsc(d.zip)};${vEsc(d.country)}`);
      if (d.note) L.push('NOTE:' + vEsc(d.note));
      L.push('END:VCARD');
      return L.join('\r\n');
    }
    default: return String(d.text || '');
  }
}

const FIELDS = {
  url: [['url', 'Adresse', 'z. B. support.firma.de/fernwartung']],
  tel: [['tel', 'Telefonnummer', '+49 …']],
  sms: [['tel', 'Telefonnummer', '+49 …'], ['msg', 'Nachricht (vorausgefüllt)', '']],
  mail: [['mail', 'E-Mail-Adresse', 'support@firma.de'], ['subject', 'Betreff (optional)', 'Supportanfrage'], ['body', 'Text (optional)', '']],
  vcard: [['fn', 'Vorname', ''], ['ln', 'Nachname', ''], ['org', 'Firma', ''], ['title', 'Funktion', ''], ['tel', 'Telefon', ''], ['mobile', 'Mobil', ''], ['mail', 'E-Mail', ''], ['web', 'Webseite', ''], ['street', 'Straße', ''], ['zip', 'PLZ', ''], ['city', 'Ort', ''], ['country', 'Land', ''], ['note', 'Notiz', '']],
  text: [['text', 'Text', '']],
};
const PER_PAGE = { 1: '1 pro Seite', 4: '4 pro Seite', 8: '8 pro Seite', 12: '12 pro Seite', 24: '24 pro Seite (klein)' };
const COLORS = { dark: '#0A1626', light: '#ffffff' };

export default {
  id: 'qr', name: 'QR-Codes', group: 'Für Kunden', icon: 'grid', tags: ['QR-Code', 'Kunde', 'Drucken', 'Aufkleber'],
  keys: 'qr qrcode code link url kontakt vcard visitenkarte telefon sms email aufkleber etikett drucken', online: false,
  render(p, ctx) {
    const S = Object.assign({ type: 'url', data: {}, caption: '', sub: '', per: 4 }, ctx.state.get('qr', {}));
    if (!S.data.org && ctx.branding.company_name) S.data.org = ctx.branding.company_name;
    p.innerHTML = `<div class="util wide"><h3>QR-Codes</h3><p>QR-Code für einen Link, Kontakt, Telefonnummer, SMS, E-Mail oder Text – etwa als Aufkleber mit Support-Kontakt am Gerät. Für WLAN gibt es ein eigenes Werkzeug.</p>
      <div class="lst-modes">${Object.entries(TYPES).map(([v, l]) => `<button type="button" class="lk-chip${S.type === v ? ' on' : ''}" data-qt="${v}">${l}</button>`).join('')}</div>
      <div class="qr-grid"><form class="stack" id="qrF" autocomplete="off" onsubmit="return false"><div id="qrFields" class="lk-grid"></div>
        <div class="lk-grid"><label class="field"><span>Beschriftung (unter dem Code)</span><input class="input" name="caption" value="${esc(S.caption)}" maxlength="60" placeholder="z. B. IT-Support"></label>
        <label class="field"><span>Zweite Zeile (optional)</span><input class="input" name="sub" value="${esc(S.sub)}" maxlength="80" placeholder="z. B. Mo–Fr 8–17 Uhr"></label></div></form>
        <div class="stack"><div id="qrPrev" class="qr-prev"></div><p class="note" id="qrInfo"></p></div></div>
      <div class="row"><label class="field"><span>Druckbogen</span><select class="input" id="qrPer">${Object.entries(PER_PAGE).map(([v, l]) => `<option value="${v}"${+S.per === +v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <button class="btn primary" type="button" id="qrPrint">${ic('download')}Druckvorlage erzeugen</button><button class="btn" type="button" id="qrPng">${ic('image')}Als PNG</button><button class="btn" type="button" id="qrSvg">${ic('code')}Als SVG</button></div></div>`;
    const f = $('#qrF', p), prev = $('#qrPrev', p), info = $('#qrInfo', p);
    const drawFields = () => { $('#qrFields', p).innerHTML = FIELDS[S.type].map(([k, l, ph]) => `<label class="field"><span>${l}</span>${k === 'body' || k === 'note' || k === 'text' ? `<textarea class="input" name="d_${k}" rows="3" placeholder="${esc(ph)}">${esc(S.data[k] || '')}</textarea>` : `<input class="input" name="d_${k}" value="${esc(S.data[k] || '')}" placeholder="${esc(ph)}" spellcheck="false">`}</label>`).join(''); };
    const svgOf = txt => QRCode.toString(txt, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: COLORS });
    let seq = 0;
    const draw = async () => {
      const fd = new FormData(f);
      for (const [k] of FIELDS[S.type]) S.data[k] = String(fd.get('d_' + k) ?? '');
      S.caption = String(fd.get('caption') || ''); S.sub = String(fd.get('sub') || '');
      ctx.state.set('qr', S);
      const txt = qrPayload(S.type, S.data), my = ++seq;
      if (!txt) { prev.innerHTML = `<div class="panel empty">${ic('grid')}<p>Angaben ausfüllen, dann erscheint hier der QR-Code.</p></div>`; info.textContent = ''; return; }
      let svg; try { svg = await svgOf(txt); } catch (e) { prev.innerHTML = `<div class="chk warn"><div><strong>Zu viel Inhalt für einen QR-Code</strong><div class="chk-b">${esc(e.message || e)}</div></div></div>`; return; }
      if (my !== seq) return;
      prev.innerHTML = `<div class="qr-card">${svg}${S.caption ? `<b>${esc(S.caption)}</b>` : ''}${S.sub ? `<span>${esc(S.sub)}</span>` : ''}</div>`;
      info.textContent = `${txt.length} Zeichen${txt.length > 300 ? ' – viel Inhalt macht den Code dicht; zum Drucken lieber größer wählen' : ''}`;
    };
    const label = (svg, size) => `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Arial,Helvetica,sans-serif;color:#0A1626;padding:6px;break-inside:avoid">
      <div style="width:${size}mm;height:${size}mm">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
      ${S.caption ? `<div style="font-weight:700;font-size:${size > 40 ? 16 : 11}px;margin-top:4px">${esc(S.caption)}</div>` : ''}${S.sub ? `<div style="font-size:${size > 40 ? 12 : 9}px;color:#5A6B7D">${esc(S.sub)}</div>` : ''}</div>`;
    p.addEventListener('click', e => { const b = e.target.closest('[data-qt]'); if (!b) return; S.type = b.dataset.qt; p.querySelectorAll('[data-qt]').forEach(x => x.classList.toggle('on', x === b)); drawFields(); draw(); });
    f.addEventListener('input', draw);
    $('#qrPer', p).onchange = e => { S.per = +e.target.value; ctx.state.set('qr', S); };
    const need = () => { const t = qrPayload(S.type, S.data); if (!t) ctx.toast('Erst Angaben ausfüllen.'); return t; };
    $('#qrPrint', p).onclick = async () => {
      const t = need(); if (!t) return;
      const per = +S.per, cols = per === 1 ? 1 : per <= 8 ? 2 : per === 12 ? 3 : 4, size = { 1: 110, 4: 60, 8: 42, 12: 38, 24: 26 }[per];
      const svg = await svgOf(t);
      const body = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8mm 6mm">${Array.from({ length: per }, () => label(svg, size)).join('')}</div>`;
      ctx.print('qr', S.caption || 'QR-Code', body, { workTitle: 'QR-Code erstellt', workDetail: TYPES[S.type] + (S.caption ? ': ' + S.caption : '') });
    };
    $('#qrPng', p).onclick = async () => {
      const t = need(); if (!t) return;
      const url = await QRCode.toDataURL(t, { errorCorrectionLevel: 'M', margin: 2, width: 800, color: COLORS });
      if (!S.caption && !S.sub) { ctx.saveDataURL('qr-code.png', url); return; }
      const img = new Image(); img.src = url; await img.decode();
      const H = 800 + (S.caption ? 90 : 0) + (S.sub ? 60 : 0) + 30, cv = document.createElement('canvas'); cv.width = 800; cv.height = H; const c = cv.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, 800, H); c.drawImage(img, 0, 0); c.textAlign = 'center'; c.fillStyle = COLORS.dark;
      if (S.caption) { c.font = '700 54px system-ui,sans-serif'; c.fillText(S.caption, 400, 860); }
      if (S.sub) { c.fillStyle = '#5A6B7D'; c.font = '400 34px system-ui,sans-serif'; c.fillText(S.sub, 400, S.caption ? 920 : 860); }
      ctx.saveDataURL('qr-code.png', cv.toDataURL('image/png'));
    };
    $('#qrSvg', p).onclick = async () => {
      const t = need(); if (!t) return;
      const b = new TextEncoder().encode(await svgOf(t)); let s = ''; for (const x of b) s += String.fromCharCode(x);
      ctx.saveDataURL('qr-code.svg', 'data:image/svg+xml;base64,' + btoa(s));
    };
    drawFields(); draw();
  },
};
