// Verbindungs-Langzeittest (#124): Router, Internet und DNS über längere Zeit
// prüfen, Aussetzer aufzeichnen und eingrenzen. Messung läuft im Backend weiter.
import { $, esc, ic, chk } from '../ui.js';
import { outages, stats, diagnose, toCSV } from '../linemon-util.js';

const COL = { gw: '#2563eb', net: '#16a34a', dns: '#f59e0b', own: '#a855f7' };
let data = { targets: [], samples: {}, running: false, started: 0, stopped: 0 }, last = 0, timer = 0;

function chart(cv, win) {
  const c = cv.getContext('2d'), W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = 240 * devicePixelRatio, dp = devicePixelRatio;
  c.clearRect(0, 0, W, H);
  const now = data.running ? Date.now() : (data.stopped || Date.now()), t0 = Math.max(data.started, now - win), pad = 34 * dp;
  const all = data.targets.flatMap(t => (data.samples[t.id] || []).filter(s => s.ok && s.t >= t0).map(s => s.ms));
  const ymax = Math.max(20, Math.min(1000, (all.sort((a, b) => a - b)[Math.floor(all.length * 0.98)] || 20) * 1.3));
  const X = t => pad + (t - t0) / Math.max(1, now - t0) * (W - pad - 8 * dp), Y = ms => H - 18 * dp - Math.min(ms, ymax) / ymax * (H - 30 * dp);
  c.strokeStyle = 'rgba(128,128,128,.25)'; c.fillStyle = 'rgba(128,128,128,.9)'; c.font = `${11 * dp}px system-ui`; c.lineWidth = dp;
  for (const f of [0, 0.5, 1]) { const y = Y(ymax * f); c.beginPath(); c.moveTo(pad, y); c.lineTo(W, y); c.stroke(); c.fillText(Math.round(ymax * f) + ' ms', 2, y - 2); }
  c.fillText(new Date(t0).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), pad, H - 4); c.textAlign = 'right'; c.fillText(new Date(now).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), W - 4, H - 4); c.textAlign = 'left';
  for (const t of data.targets) {
    const L = (data.samples[t.id] || []).filter(s => s.t >= t0), col = COL[t.id] || '#888';
    c.strokeStyle = col; c.lineWidth = 1.5 * dp; c.beginPath(); let pen = false;
    for (const s of L) { if (!s.ok) { pen = false; continue; } const x = X(s.t), y = Y(s.ms); pen ? c.lineTo(x, y) : c.moveTo(x, y); pen = true; }
    c.stroke();
    c.fillStyle = '#e11d48'; for (const s of L) if (!s.ok) c.fillRect(X(s.t) - dp, 4 * dp + data.targets.indexOf(t) * 5 * dp, 2.5 * dp, 4 * dp);
  }
}

export default {
  id: 'linemon', name: 'Verbindungs-Langzeittest', group: 'Netzwerk & Mail', icon: 'trend', tags: ['Netzwerk', 'Internet', 'WLAN', 'Fehlersuche'],
  keys: 'internet bricht ab verbindungsabbrüche aussetzer langzeit ping monitor wlan abbrüche provider leitung dauertest', online: false,
  async render(p, ctx) {
    const gw = ((await ctx.gateways().catch(() => [])) || []).find(g => /^\d+\.\d+\.\d+\.\d+$/.test(g)) || '';
    const S = Object.assign({ net: '1.1.1.1', own: '', minutes: 240, win: 900000 }, ctx.state.get('linemon', {}));
    p.innerHTML = `<div class="util wide"><h3>Verbindungs-Langzeittest</h3><p>Pingt über längere Zeit Router und Internet an und prüft DNS. Aussetzer werden aufgezeichnet und eingegrenzt: liegt es am WLAN/Router oder am Anschluss? Läuft im Hintergrund weiter, auch wenn du andere Werkzeuge öffnest.</p>
      <div class="row lm-cfg"><label class="field"><span>Router</span><input class="input mono" id="lmGw" value="${esc(gw)}" placeholder="192.168.178.1"></label><label class="field"><span>Internet</span><input class="input mono" id="lmNet" value="${esc(S.net)}"></label>
        <label class="field"><span>Eigenes Ziel (optional)</span><input class="input mono" id="lmOwn" value="${esc(S.own)}" placeholder="z. B. Server, NAS"></label>
        <label class="field"><span>Höchstdauer</span><select class="input" id="lmMin">${[[30, '30 Minuten'], [60, '1 Stunde'], [240, '4 Stunden'], [480, '8 Stunden'], [1440, '24 Stunden']].map(([v, l]) => `<option value="${v}"${+S.minutes === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <button class="btn primary" type="button" id="lmGo"></button></div>
      <div class="lst-modes" id="lmWin">${[[300000, '5 Min.'], [900000, '15 Min.'], [3600000, '1 Std.'], [0, 'Alles']].map(([v, l]) => `<button type="button" class="lk-chip${S.win === v ? ' on' : ''}" data-lmw="${v}">${l}</button>`).join('')}</div>
      <canvas class="lm-cv" id="lmCv"></canvas><div class="lm-leg" id="lmLeg"></div><div id="lmOut"></div>
      <div class="row"><button class="btn" type="button" id="lmRep">${ic('download')}Bericht (PDF)</button><button class="btn" type="button" id="lmCsv">CSV speichern</button></div></div>`;
    const btn = $('#lmGo', p), out = $('#lmOut', p), cv = $('#lmCv', p);
    const draw = () => {
      btn.innerHTML = data.running ? `${ic('stop')}Stopp` : `${ic('play')}Test starten`;
      if (!p.isConnected) return;
      chart(cv, S.win || Date.now());
      const o = {}, rows = data.targets.map(t => { const s = stats(data.samples[t.id] || []), oo = outages(data.samples[t.id] || []); o[t.id] = oo; return `<tr><th><span class="lm-dot" style="background:${COL[t.id]}"></span>${esc(t.label)}</th><td>${s.n}</td><td>${s.avg} ms</td><td>${s.p95} ms</td><td class="${s.loss > 1 ? 'lm-bad' : ''}">${s.loss} %</td><td>${oo.length}</td></tr>`; }).join('');
      $('#lmLeg', p).innerHTML = data.started ? `<span class="muted">${data.running ? 'Läuft seit' : 'Gelaufen'} ${new Date(data.started).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${data.stopped ? ' bis ' + new Date(data.stopped).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''} · rote Striche = Aussetzer</span>` : '';
      if (!data.targets.length) { out.innerHTML = ''; return; }
      const d = diagnose(o), all = data.targets.flatMap(t => o[t.id].map(x => ({ ...x, label: t.label }))).sort((a, b) => b.start - a.start).slice(0, 20);
      out.innerHTML = `<div class="table"><table class="mc-t"><thead><tr><th>Ziel</th><th>Messungen</th><th>Ø</th><th>95 %</th><th>Verlust</th><th>Aussetzer</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${chk(d.level, d.level === 'ok' ? 'Bisher stabil' : 'Auswertung', esc(d.text))}
        ${all.length ? `<div class="sub"><h5>Letzte Aussetzer</h5><ul class="plain">${all.map(x => `<li><span class="mono">${new Date(x.start).toLocaleTimeString('de-DE')}</span> ${esc(x.label)}: ${Math.max(1, Math.round((x.end - x.start) / 1000) + 1)} s${x.open ? ' (läuft noch)' : ''}</li>`).join('')}</ul></div>` : ''}`;
    };
    const poll = async () => {
      try {
        const st = await ctx.net.monitor.status(last);
        data.running = st.running; data.started = st.started; data.stopped = st.stopped; data.targets = st.targets || [];
        for (const [id, L] of Object.entries(st.samples || {})) { data.samples[id] = (data.samples[id] || []).concat(L); if (L.length) last = Math.max(last, L[L.length - 1].t); }
        draw();
      } catch (_) { /* Backend nicht bereit */ }
      clearTimeout(timer); if (p.isConnected) timer = setTimeout(poll, data.running ? 2000 : 8000);
    };
    btn.onclick = async () => {
      if (data.running) { await ctx.net.monitor.stop(); ctx.addAction('Verbindungstest beendet', 'info'); setTimeout(poll, 400); return; }
      const g = $('#lmGw', p).value.trim(), n = $('#lmNet', p).value.trim(), own = $('#lmOwn', p).value.trim(), minutes = +$('#lmMin', p).value;
      Object.assign(S, { net: n, own, minutes }); ctx.state.set('linemon', S);
      const T = [g && { id: 'gw', kind: 'ping', host: g, label: 'Router ' + g }, n && { id: 'net', kind: 'ping', host: n, label: 'Internet ' + n }, { id: 'dns', kind: 'dns', host: 'google.de', label: 'DNS' }, own && { id: 'own', kind: 'ping', host: own, label: own }].filter(Boolean);
      try { await ctx.net.monitor.start(T, minutes); data = { targets: T, samples: {}, running: true, started: Date.now(), stopped: 0 }; last = 0; ctx.addAction('Verbindungstest gestartet', 'info'); poll(); }
      catch (e) { ctx.toast(String(e)); }
    };
    p.addEventListener('click', e => { const w = e.target.closest('[data-lmw]'); if (w) { S.win = +w.dataset.lmw; ctx.state.set('linemon', S); p.querySelectorAll('[data-lmw]').forEach(b => b.classList.toggle('on', b === w)); draw(); } });
    $('#lmCsv', p).onclick = () => { if (!data.targets.length) return; const b = new TextEncoder().encode(toCSV(data.targets, data.samples)); let s = ''; for (const x of b) s += String.fromCharCode(x); ctx.saveDataURL('verbindungstest.csv', 'data:text/csv;base64,' + btoa(s)); };
    $('#lmRep', p).onclick = () => {
      if (!data.targets.length) return;
      const img = (chart(cv, 0), cv.toDataURL('image/png')); draw();
      ctx.print('verbindungstest', 'Verbindungstest', `<p>Zeitraum: ${new Date(data.started).toLocaleString('de-DE')} – ${new Date(data.stopped || Date.now()).toLocaleString('de-DE')}</p><img src="${img}" style="width:100%;border:1px solid #ddd">${out.innerHTML}`, { workTitle: 'Verbindungstest durchgeführt', workDetail: diagnose(Object.fromEntries(data.targets.map(t => [t.id, outages(data.samples[t.id] || [])]))).text });
    };
    data.samples = {}; last = 0; poll();
    return () => clearTimeout(timer);
  },
};
