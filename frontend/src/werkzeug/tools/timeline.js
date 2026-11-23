// „Was ist passiert?“ (#123): Ereignisse der letzten Tage als Zeitleiste mit
// Erklärung aus den Fehlercode-Daten (#106). Nur lesend.
import { $, esc, ic, chk } from '../ui.js';
import { mdInline } from '../markdown.js';
import { CODES } from '../data/errcodes.js';

// Erklärung zu Ereignis-ID + Quelle (gleiche ID kann je Quelle etwas anderes heißen)
export function explain(e) {
  const L = CODES.filter(c => c.k === 'event' && [].concat(c.c).includes(e.event_id));
  if (!L.length) return null;
  const src = (e.source || '').toLowerCase();
  return L.find(c => (c.src || '').toLowerCase().split(/[ /]+/).some(w => w.length > 2 && src.includes(w))) || L[0];
}
export const CATS = [
  ['bsod', 'Bluescreens / Kernel-Panics', e => e.event_id === 1001 && /bugcheck|wer-system/i.test(e.source) || e.source === 'Kernel-Panic'],
  ['restart', 'Unerwartete Neustarts', e => [41, 6008].includes(e.event_id) && !/shutdown/i.test(e.source) || (e.source === 'Shutdown' && e.level < 4)],
  ['crash', 'Programmabstürze', e => [1000, 1002, 1026].includes(e.event_id) || e.source === 'Absturz'],
  ['update', 'Fehlgeschlagene Updates', e => e.event_id === 20 && /windowsupdate/i.test(e.source)],
  ['service', 'Dienstfehler', e => [7000, 7001, 7009, 7031, 7034].includes(e.event_id)],
  ['disk', 'Datenträger / Hardware', e => [7, 51, 153, 129, 55, 98, 17, 18, 19].includes(e.event_id) && !/windowsupdate/i.test(e.source)],
];
export function summarize(list) {
  const out = CATS.map(([id, label, f]) => ({ id, label, n: list.filter(f).length })).filter(c => c.n);
  const apps = {};
  for (const e of list) if ([1000, 1002].includes(e.event_id)) { const m = e.message.match(/(?:anwendung|application)(?:\s+name)?:\s*([^\s,]+\.exe)|^([^\s:]+\.exe)/i); const a = (m?.[1] || m?.[2] || "").toLowerCase(); if (a) apps[a] = (apps[a] || 0) + 1; }
  return { cats: out, apps: Object.entries(apps).sort((a, b) => b[1] - a[1]).slice(0, 5) };
}
const LV = { 1: 'err', 2: 'err', 3: 'warn', 4: 'info' };
let last = null, days = 7;

export default {
  id: 'timeline', name: 'Was ist passiert?', group: 'Windows & macOS', icon: 'clock', tags: ['Fehlersuche', 'Ereignisanzeige', 'Absturz'],
  keys: 'ereignisse ereignisanzeige eventlog absturz bluescreen neustart abgestürzt zeitleiste was ist passiert kernel panic log', online: false,
  render(p, ctx) {
    p.innerHTML = `<div class="util wide"><h3>Was ist passiert?</h3><p>Liest die wichtigen Ereignisse der letzten Tage – Bluescreens, unerwartete Neustarts, Programmabstürze, Update- und Dienstfehler, Datenträgerwarnungen – und erklärt sie. Es wird nichts verändert.</p>
      <div class="row"><label class="field"><span>Zeitraum</span><select class="input" id="tlD">${[1, 3, 7, 14, 30].map(d => `<option value="${d}"${d === days ? ' selected' : ''}>${d === 1 ? 'letzter Tag' : `letzte ${d} Tage`}</option>`).join('')}</select></label>
        <button class="btn primary" type="button" id="tlGo">${ic('search')}Auswerten</button><button class="btn" type="button" id="tlCopy" hidden>${ic('copy')}Als Bericht kopieren</button></div>
      <div id="tlOut" aria-live="polite"></div></div>`;
    const out = $('#tlOut', p);
    const draw = () => {
      if (!last) return;
      if (!last.length) { out.innerHTML = chk('ok', 'Keine auffälligen Ereignisse', `In den letzten ${days} Tagen wurden keine der gesuchten Ereignisse gefunden.`); return; }
      const s = summarize(last), byDay = {};
      for (const e of last) { const d = new Date(e.time).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' }); (byDay[d] = byDay[d] || []).push(e); }
      out.innerHTML = `<div class="sub"><h5>Zusammenfassung <small>${last.length} Ereignisse</small></h5><div class="chks">${s.cats.map(c => chk(['bsod', 'restart', 'disk'].includes(c.id) ? 'err' : 'warn', `${c.n}× ${c.label}`)).join('') || chk('info', 'Nur Hinweise, keine Fehler')}</div>
        ${s.apps.length ? `<p class="note">Am häufigsten abgestürzt: ${s.apps.map(([a, n]) => `<span class="mono">${esc(a)}</span> (${n}×)`).join(', ')}</p>` : ''}</div>
        ${Object.entries(byDay).map(([d, L]) => `<div class="sub"><h5>${esc(d)}</h5><div class="tl-list">${L.map(e => { const x = explain(e); return `<details class="tl-e ${LV[e.level] || 'info'}"><summary><span class="mono">${new Date(e.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span><b>${esc(x?.t || e.source)}</b><span class="muted">${esc(e.source)}${e.event_id ? ' · ' + e.event_id : ''}</span></summary>
          <div class="tl-b"><p class="mono tl-msg">${esc(e.message)}</p>${x ? `<p>${esc(x.w)}</p>${x.f?.length ? `<ul>${x.f.map(f => `<li>${mdInline(f)}</li>`).join('')}</ul>` : ''}` : ''}
          ${/0x[0-9a-f]{8}/i.test(e.message) ? `<button class="btn sm ghost" type="button" data-tlerr="${esc((e.message.match(/0x[0-9a-f]{8}/gi) || []).slice(0, 3).join(' '))}">${ic('bug')}Codes nachschlagen</button>` : ''}
          <button class="btn sm ghost" type="button" data-tlai="${esc(last.indexOf(e))}">${ic('chat')}Erklären lassen (KI)</button></div></details>`; }).join('')}</div></div>`).join('')}`;
      $('#tlCopy', p).hidden = false;
    };
    const report = () => [`# Ereignisse der letzten ${days} Tage`, '', ...summarize(last).cats.map(c => `- ${c.n}× ${c.label}`), '', ...last.map(e => `- ${new Date(e.time).toLocaleString('de-DE')} – ${explain(e)?.t || e.source} (${e.source} ${e.event_id || ''}): ${e.message.slice(0, 200)}`)].join('\n');
    $('#tlGo', p).onclick = async () => {
      days = +$('#tlD', p).value; out.innerHTML = '<p class="muted">Lese Ereignisse … (kann bis zu einer Minute dauern)</p>';
      try { last = (await ctx.eventTimeline(days)) || []; draw(); ctx.addAction(`Ereignisse ausgewertet (${days} Tage, ${last.length})`, 'info'); }
      catch (e) { out.innerHTML = chk('warn', 'Ereignisse nicht lesbar', esc(e)); }
    };
    $('#tlCopy', p).onclick = () => ctx.copy(report(), 'Bericht kopiert');
    p.addEventListener('click', async e => {
      const er = e.target.closest('[data-tlerr]'); if (er) { ctx.openTool('err', { q: er.dataset.tlerr }); return; }
      const ai = e.target.closest('[data-tlai]');
      if (ai) { const ev = last[+ai.dataset.tlai], x = explain(ev); const { explainWithAI } = await import('../ai.js'); explainWithAI(ctx, { title: 'Ereignis erklären', kind: 'Windows-/macOS-Ereignis', text: `${ev.source} Ereignis-ID ${ev.event_id}, ${new Date(ev.time).toLocaleString('de-DE')}\n${ev.message}${x ? `\n\nBekannte Bedeutung: ${x.t}. ${x.w}` : ''}` }); }
    });
    draw();
  },
};
