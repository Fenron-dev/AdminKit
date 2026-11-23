// WLAN-QR-Code für beliebige Netze (z. B. neues Gast-WLAN) mit Druckvorlage.
// Aus dem Ideler-Portal übernommen; QR-Erzeugung über das vorhandene
// qrcode-Paket von AdminKit, Druck über das Dokument mit Branding.
import QRCode from 'qrcode';
import { $, esc, ic } from '../ui.js';
import { makePhrase, loadWords } from './pw.js';

export const wifiEsc = s => String(s).replace(/([\\;,:"])/g, '\\$1');
export const wifiString = W => `WIFI:T:${W.enc};S:${wifiEsc(W.ssid)};${W.enc === 'nopass' ? '' : `P:${wifiEsc(W.pw)};`}${W.hidden ? 'H:true;' : ''};`;

const qrSVG = text => QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#0A1626', light: '#ffffff' } });

function cardHTML(W, svg) {
  return `<div class="wifi-card" id="wifiCard"><div class="wc-qr">${svg}</div><div class="wc-t">${esc(W.title || 'WLAN')}</div>
    <dl><dt>Netzwerk</dt><dd>${esc(W.ssid)}</dd>${W.enc !== 'nopass' && W.show ? `<dt>Passwort</dt><dd class="mono">${esc(W.pw)}</dd>` : ''}</dl>
    <p>Kamera-App öffnen, auf den Code richten und „Verbinden“ tippen.</p></div>`;
}

// Druckvorlage als eigenständiges Dokument (Inline-Styles, da ohne App-CSS)
function printHTML(W, svg) {
  return `<div style="text-align:center;font-family:Arial,Helvetica,sans-serif;color:#0A1626">
    <div style="width:280px;margin:0 auto">${svg}</div>
    <div style="font-size:30px;font-weight:800;margin:14px 0 18px">${esc(W.title || 'WLAN')}</div>
    <div style="font-size:14px;color:#5A6B7D">Netzwerk</div><div style="font-size:22px;font-weight:700;margin-bottom:12px">${esc(W.ssid)}</div>
    ${W.enc !== 'nopass' && W.show ? `<div style="font-size:14px;color:#5A6B7D">Passwort</div><div style="font-size:22px;font-weight:700;font-family:Consolas,monospace;word-break:break-all">${esc(W.pw)}</div>` : ''}
    <p style="font-size:13px;color:#5A6B7D;margin-top:22px">Kamera-App öffnen, auf den Code richten und „Verbinden“ tippen.</p></div>`;
}

async function cardPNG(W) {
  const url = await QRCode.toDataURL(wifiString(W), { errorCorrectionLevel: 'M', margin: 4, width: 680, color: { dark: '#0A1626', light: '#ffffff' } });
  const img = new Image(); img.src = url; await img.decode();
  const Wd = 900, H = 1240, cv = document.createElement('canvas'); cv.width = Wd; cv.height = H; const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, Wd, H); c.drawImage(img, (Wd - 680) / 2, 70, 680, 680);
  const oy = 70 + 680; c.textAlign = 'center';
  c.fillStyle = '#0A1626'; c.font = '800 58px system-ui,sans-serif'; c.fillText(W.title || 'WLAN', Wd / 2, oy + 90);
  c.fillStyle = '#5A6B7D'; c.font = '500 30px system-ui,sans-serif'; c.fillText('Netzwerk', Wd / 2, oy + 160);
  c.fillStyle = '#0A1626'; c.font = '700 40px system-ui,sans-serif'; c.fillText(W.ssid, Wd / 2, oy + 210);
  if (W.enc !== 'nopass' && W.show) {
    c.fillStyle = '#5A6B7D'; c.font = '500 30px system-ui,sans-serif'; c.fillText('Passwort', Wd / 2, oy + 280);
    c.fillStyle = '#0A1626'; c.font = '600 40px Consolas,monospace'; c.fillText(W.pw, Wd / 2, oy + 330);
  }
  c.fillStyle = '#5A6B7D'; c.font = '400 26px system-ui,sans-serif'; c.fillText('Kamera-App öffnen, auf den Code richten und „Verbinden“ tippen.', Wd / 2, H - 50);
  return cv.toDataURL('image/png');
}

export default {
  id: 'wifi', name: 'WLAN-QR-Code', group: 'Für Kunden', tags: ['WLAN', 'QR-Code', 'Kunde', 'Drucken'], icon: 'wifi',
  keys: 'wlan wifi qr code gast drucken router', online: false,
  render(p, ctx) {
    // Passwort wird nie gespeichert; Vorbelegung z. B. aus dem Netzwerk-Tab
    const W = Object.assign({ ssid: '', pw: '', enc: 'WPA', hidden: false, show: true, title: 'WLAN für Gäste' }, ctx.state.get('wifi', {}), { pw: '' }, ctx.takePrefill('wifi') || {});
    p.innerHTML = `<div class="util"><h3>WLAN-QR-Code</h3><p>Handy-Kamera auf den Code richten, schon ist das Gerät verbunden. Funktioniert mit aktuellen iPhones und Android-Geräten.</p>
      <form class="stack" id="wfForm" autocomplete="off" onsubmit="return false">
        <label class="field"><span>Überschrift auf der Karte</span><input name="title" class="input" value="${esc(W.title)}" maxlength="40"></label>
        <label class="field"><span>Netzwerkname (SSID)</span><input name="ssid" class="input" value="${esc(W.ssid)}" maxlength="32" placeholder="z. B. Praxis-Gast" spellcheck="false"></label>
        <label class="field"><span>Verschlüsselung</span><select class="input" name="enc">${[['WPA', 'WPA2 / WPA3 (Standard)'], ['WEP', 'WEP (veraltet)'], ['nopass', 'Offen, ohne Passwort']].map(([v, l]) => `<option value="${v}"${W.enc === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="field" id="wfPwF"><span>Passwort</span><div class="row" style="flex-wrap:nowrap"><input name="pw" class="input mono-in" value="${esc(W.pw)}" maxlength="63" spellcheck="false"><button class="btn" type="button" id="wfGen" title="Merkbares Passwort erzeugen">${ic('refresh')}Erzeugen</button></div></div>
        <label class="check"><input type="checkbox" name="show"${W.show ? ' checked' : ''}>Passwort auf der Karte anzeigen</label>
        <label class="check"><input type="checkbox" name="hidden"${W.hidden ? ' checked' : ''}>Verstecktes Netzwerk (SSID wird nicht ausgestrahlt)</label>
        <p class="note">Das Passwort wird nicht gespeichert. Netzwerkname und Überschrift merkt sich AdminKit für das nächste Mal.</p>
      </form>
      <div class="stack"><div id="wfCard"></div><div class="row"><button class="btn primary" type="button" id="wfPrint">${ic('download')}Druckvorlage erzeugen</button><button class="btn" type="button" id="wfPng">${ic('image')}Als Bild speichern</button></div><p class="form-err" id="wfErr"></p></div></div>`;
    const f = $('#wfForm', p);
    let seq = 0;
    const draw = async () => {
      const fd = new FormData(f);
      Object.assign(W, { title: fd.get('title'), ssid: fd.get('ssid'), enc: fd.get('enc'), pw: fd.get('pw'), show: !!fd.get('show'), hidden: !!fd.get('hidden') });
      ctx.state.set('wifi', { title: W.title, ssid: W.ssid, enc: W.enc, show: W.show, hidden: W.hidden });
      $('#wfPwF', p).hidden = W.enc === 'nopass';
      $('#wfErr', p).textContent = !W.ssid ? '' : W.enc === 'WPA' && W.pw && W.pw.length < 8 ? 'WPA-Passwörter haben mindestens 8 Zeichen.' : '';
      if (!W.ssid) { $('#wfCard', p).innerHTML = `<div class="panel empty">${ic('wifi')}<p>Netzwerkname eingeben, dann erscheint hier die Karte mit QR-Code.</p></div>`; return; }
      const my = ++seq, svg = await qrSVG(wifiString(W));
      if (my === seq) $('#wfCard', p).innerHTML = cardHTML(W, svg);
    };
    f.addEventListener('input', draw);
    $('#wfGen', p).onclick = async () => { f.pw.value = makePhrase({ n: 3, sep: '-', cap: true, num: true }, await loadWords('de')).pw; draw(); };
    $('#wfPrint', p).onclick = async () => {
      if (!W.ssid) return ctx.toast('Erst einen Netzwerknamen eingeben.');
      ctx.print('wlan', W.title || 'WLAN', printHTML(W, await qrSVG(wifiString(W))), { card: true, workTitle: 'WLAN-Karte erstellt', workDetail: W.ssid });
    };
    $('#wfPng', p).onclick = async () => { if (!W.ssid) return ctx.toast('Erst einen Netzwerknamen eingeben.'); ctx.saveDataURL(`WLAN-${W.ssid.replace(/[^\w-]+/g, '_')}.png`, await cardPNG(W)); };
    draw();
  },
};
