// Speicher & Tempo – aus dem Ideler-Portal übernommen.
import { $, esc, nf, pnum, segHTML, onSeg, sel } from '../ui.js';

const DEFAULTS = { sub: 'store', sv: '1', su: 'TB', pv: '100', pu: 'Mbit/s', fv: '50', fu: 'GB', lv: '100', lu: 'Mbit/s', real: true };
export const BYT = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };
export const BPS = { 'kbit/s': 1e3, 'Mbit/s': 1e6, 'Gbit/s': 1e9, 'KB/s': 8e3, 'MB/s': 8e6, 'GB/s': 8e9 };
export const fmtTime = s => {
  if (!isFinite(s)) return '–'; if (s < 1) return 'unter 1 Sek.'; if (s < 60) return Math.round(s) + ' Sek.';
  const m = Math.floor(s / 60), ss = Math.round(s % 60);
  if (s < 3600) return m >= 10 ? `${m} Min.` : `${m} Min. ${ss} Sek.`;
  const h = Math.floor(s / 3600), mm = Math.round((s % 3600) / 60); if (s < 86400) return `${h} Std. ${mm} Min.`;
  const d = Math.floor(s / 86400); return `${d} ${d === 1 ? 'Tag' : 'Tage'} ${Math.round((s % 86400) / 3600)} Std.`;
};
// Übertragungsdauer in Sekunden
export const transferSeconds = (bytes, bps, realistic) => bytes * 8 / (bps * (realistic ? 0.85 : 1));

export default {
  id: 'units', name: 'Speicher & Tempo', group: 'Rechnen & Abrechnung', tags: ['Rechner', 'Speicher', 'Netzwerk'], icon: 'gauge',
  keys: 'gb gib tb mbit mbits geschwindigkeit download dauer speicher', online: false,
  render(p, ctx) {
    const UN = Object.assign({}, DEFAULTS, ctx.state.get('units', {}));
    p.innerHTML = `<div class="util wide"><h3>Speicher &amp; Tempo</h3><p>Rechnet Speichergrößen und Geschwindigkeiten um und macht sie für Kundschaft verständlich.</p>
      ${segHTML('un', [['store', 'Speichergröße'], ['speed', 'Geschwindigkeit'], ['time', 'Übertragungsdauer']], UN.sub)}<div id="unBox"></div></div>`;
    const box = $('#unBox', p);
    const draw = () => {
      ctx.state.set('units', UN);
      if (UN.sub === 'store') box.innerHTML = `<div class="un-in"><input class="input" id="sv" inputmode="decimal" value="${esc(UN.sv)}" aria-label="Wert">${sel('su', Object.keys(BYT), UN.su)}</div><div id="unOut"></div>`;
      else if (UN.sub === 'speed') box.innerHTML = `<div class="un-in"><input class="input" id="pv" inputmode="decimal" value="${esc(UN.pv)}" aria-label="Wert">${sel('pu', Object.keys(BPS), UN.pu)}</div><div id="unOut"></div>`;
      else box.innerHTML = `<div class="un-in"><label class="field"><span>Dateigröße</span><div class="row" style="flex-wrap:nowrap"><input class="input" id="fv" inputmode="decimal" value="${esc(UN.fv)}">${sel('fu', ['MB', 'GB', 'TB', 'MiB', 'GiB'], UN.fu)}</div></label>
        <label class="field"><span>Leitung</span><div class="row" style="flex-wrap:nowrap"><input class="input" id="lv" inputmode="decimal" value="${esc(UN.lv)}">${sel('lu', Object.keys(BPS), UN.lu)}</div></label>
        <label class="check" style="align-self:end;padding-bottom:12px"><input type="checkbox" id="real"${UN.real ? ' checked' : ''}>Realistisch (ca. 85 % der Nennleistung)</label></div><div id="unOut"></div>`;
      box.querySelectorAll('input,select').forEach(el => el.addEventListener('input', () => { UN[el.id] = el.type === 'checkbox' ? el.checked : el.value; calc(); }));
      calc();
    };
    function calc() {
      ctx.state.set('units', UN); const out = $('#unOut', box);
      if (UN.sub === 'store') {
        const v = pnum(UN.sv); if (isNaN(v)) return out.innerHTML = ''; const b = v * BYT[UN.su];
        const dec = ['KB', 'MB', 'GB', 'TB'].map(u => [u, b / BYT[u]]), bin = ['KiB', 'MiB', 'GiB', 'TiB'].map(u => [u, b / BYT[u]]);
        const winGB = b / 1024 ** 3, winTB = b / 1024 ** 4;
        out.innerHTML = `<div class="un-cols"><div><h4>So rechnet der Hersteller <small>(1 KB = 1.000 Byte)</small></h4><dl class="kv">${dec.map(([u, x]) => `<dt>${u}</dt><dd>${nf(x, 3)}</dd>`).join('')}</dl></div>
          <div><h4>So zeigt Windows es an <small>(1 KB = 1.024 Byte)</small></h4><dl class="kv">${bin.map(([u, x]) => `<dt>${u} <small class="muted">(Windows: „${u.replace('i', '')}“)</small></dt><dd>${nf(x, 3)}</dd>`).join('')}</dl></div></div>
          <div class="explain"><strong>Für die Kundschaft erklärt</strong><p>Ein Speicher mit <b>${nf(v, 3)} ${UN.su}</b> wird unter Windows mit etwa <b>${winTB >= 1 ? nf(winTB, 2) + ' TB' : nf(winGB, 1) + ' GB'}</b> angezeigt. Es fehlt nichts: Hersteller rechnen mit 1.000, Windows mit 1.024. Bei Gigabyte macht das rund 7 % aus, bei Terabyte rund 9 %.</p>
          <div class="cmp"><div><span>Herstellerangabe</span><i style="width:100%"></i><b>${nf(b / 1e9, 1)} GB</b></div><div><span>Anzeige in Windows</span><i style="width:${Math.min(100, winGB / (b / 1e9) * 100)}%"></i><b>${nf(winGB, 1)} GB</b></div></div></div>`;
      } else if (UN.sub === 'speed') {
        const v = pnum(UN.pv); if (isNaN(v)) return out.innerHTML = ''; const bps = v * BPS[UN.pu];
        out.innerHTML = `<dl class="kv">${Object.keys(BPS).map(u => `<dt>${u}</dt><dd>${nf(bps / BPS[u], 3)}</dd>`).join('')}</dl>
          <div class="explain"><strong>Für die Kundschaft erklärt</strong><p>Internetanbieter geben die Leitung in <b>Megabit</b> pro Sekunde an, Browser und Download-Programme zeigen meist <b>Megabyte</b> pro Sekunde. Ein Byte hat 8 Bit. Eine Leitung mit <b>${nf(bps / 1e6, 1)} Mbit/s</b> lädt also höchstens <b>${nf(bps / 8e6, 1)} MB/s</b>, in der Praxis etwas weniger.</p></div>`;
      } else {
        const fb = pnum(UN.fv) * BYT[UN.fu], bps = pnum(UN.lv) * BPS[UN.lu]; if (isNaN(fb) || isNaN(bps) || !bps) return out.innerHTML = '';
        const t = transferSeconds(fb, bps, UN.real);
        const lines = [16, 50, 100, 250, 500, 1000].map(m => m * 1e6); if (!lines.some(l => Math.abs(l - bps) < 1)) lines.push(bps); lines.sort((a, b) => a - b);
        const times = lines.map(l => transferSeconds(fb, l, UN.real)), mx = Math.max(...times);
        out.innerHTML = `<div class="un-res"><span>Dauer bei ${nf(bps / 1e6, 1)} Mbit/s</span><b>${fmtTime(t)}</b></div>
          <div class="bars">${lines.map((l, i) => `<div class="bar${Math.abs(l - bps) < 1 ? ' me' : ''}"><span>${nf(l / 1e6, 1)} Mbit/s</span><i style="width:${Math.max(1.5, times[i] / mx * 100)}%"></i><b>${fmtTime(times[i])}</b></div>`).join('')}</div>
          <p class="note">Beim Hochladen zählt die Upload-Geschwindigkeit, die bei DSL- und Kabelanschlüssen meist deutlich kleiner ist. WLAN, ein langsamer Server oder andere Geräte im Netz bremsen zusätzlich.</p>`;
      }
    }
    onSeg(p, 'un', v => { UN.sub = v; draw(); }); draw();
  },
};
