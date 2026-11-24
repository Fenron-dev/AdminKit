// Arbeitszeit & AE – aus dem Ideler-Portal übernommen.
// Standard für Einheit/Rundung kommt aus config.yaml (billing.*).
import { $, esc, ic, nf, pnum } from '../ui.js';

export const hm = s => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : NaN; };
export function rowMin(r) { const s = hm(r.s), e = hm(r.e); if (isNaN(s) || isNaN(e)) return NaN; let d = e - s; if (d < 0) d += 1440; return Math.max(0, d - (pnum(r.p) || 0)); }
// mode: up = angefangene AE voll, round = kaufmännisch, exact = mit Nachkommastellen
export function aeOf(m, unit, mode) {
  const u = Math.max(1, +unit || 10);
  if (isNaN(m)) return NaN; if (m <= 0) return 0;
  if (mode === 'up') return Math.ceil(m / u - 1e-9);
  if (mode === 'round') return Math.round(m / u);
  return Math.round(m / u * 100) / 100;
}
export const fmtDur = m => { if (isNaN(m)) return '–'; const h = Math.floor(m / 60), mm = Math.round(m % 60); return h ? `${h} Std. ${mm} Min.` : `${mm} Min.`; };
const eur = v => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

let rows = [{ s: '09:00', e: '09:47', p: '0' }];
let filledFor = null; // Session, deren Einsatzzeit schon vorbelegt wurde

export default {
  id: 'ae', name: 'Arbeitszeit & AE', group: 'Rechnen & Abrechnung', tags: ['Abrechnung', 'Zeit'], icon: 'clock',
  keys: 'arbeitseinheit ae minuten stunden abrechnung rechner', online: false,
  render(p, ctx) {
    const bill = ctx.config.billing || {};
    const AE = Object.assign({ unit: bill.ae_minutes || 10, mode: bill.rounding === 'nearest' ? 'round' : 'up', price: '', vat: true }, ctx.state.get('aeOpts', {}));
    p.innerHTML = `<div class="util wide"><h3>Arbeitszeit &amp; AE</h3><p>Rechnet Einsatzzeiten in Arbeitseinheiten um. Jeder Einsatz wird einzeln gerundet, die Summe ergibt sich aus den gerundeten Einsätzen.</p>
      <div class="ae-set"><label class="field"><span>1 AE entspricht</span><div class="unit-in"><input class="input" id="aeUnit" inputmode="numeric" value="${esc(AE.unit)}"><span>Minuten</span></div></label>
        <label class="field"><span>Rundung</span><select class="input" id="aeMode">${[['up', 'Angefangene AE voll berechnen'], ['round', 'Kaufmännisch runden'], ['exact', 'Exakt mit Nachkommastellen']].map(([v, l]) => `<option value="${v}"${AE.mode === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Preis pro AE netto (optional)</span><div class="unit-in"><input class="input" id="aePrice" inputmode="decimal" value="${esc(AE.price)}" placeholder="0,00"><span>€</span></div></label>
        <label class="check" style="align-self:end;padding-bottom:12px"><input type="checkbox" id="aeVat"${AE.vat ? ' checked' : ''}>19 % USt. ausweisen</label></div>
      <div class="ae-quick"><span>Schnell umrechnen:</span><input class="input" id="aeQ" inputmode="numeric" value="35" aria-label="Minuten"><span>Minuten =</span><b id="aeQo"></b></div>
      <div class="panel ae-tab" style="overflow:auto"><table><thead><tr><th>Beginn</th><th>Ende</th><th>Pause (Min.)</th><th>Dauer</th><th>AE</th><th></th></tr></thead><tbody id="aeRows"></tbody></table>
        <div style="padding:12px 14px" class="row"><button class="btn sm" type="button" id="aeAdd">${ic('plus')}Einsatz hinzufügen</button><button class="btn sm" type="button" id="aeSess" hidden>${ic('clock')}Einsatzzeit der Session übernehmen</button></div></div>
      <div class="ae-sum" id="aeSum"></div></div>`;
    const rowsEl = $('#aeRows', p);
    let sessionActive = false;
    // Laufende Session: Einsatzzeit (Session-Start bis jetzt) vorbelegen
    ctx.sessionTiming().then(t => {
      if (!t || !t.active) return;
      sessionActive = true;
      const b = $('#aeSess', p); if (b) b.hidden = false;
      const hhmm = d => d.toTimeString().slice(0, 5);
      const fill = () => { rows = [{ s: hhmm(new Date(t.start)), e: hhmm(new Date()), p: '0' }]; drawRows(); };
      if (b) b.onclick = fill;
      if (filledFor !== t.start) { filledFor = t.start; fill(); } else calc();
    }).catch(() => {});
    const drawRows = () => {
      rowsEl.innerHTML = rows.map((r, i) => `<tr data-i="${i}"><td><input class="input" type="time" data-f="s" value="${esc(r.s)}" aria-label="Beginn"></td><td><input class="input" type="time" data-f="e" value="${esc(r.e)}" aria-label="Ende"></td>
        <td><input class="input" data-f="p" inputmode="numeric" value="${esc(r.p)}" style="max-width:90px" aria-label="Pause in Minuten"></td><td data-out="d"></td><td data-out="a" class="ae-n"></td>
        <td>${rows.length > 1 ? `<button class="icon-btn" type="button" data-del="${i}" aria-label="Einsatz entfernen">${ic('trash')}</button>` : ''}</td></tr>`).join('');
      calc();
    };
    function calc() {
      ctx.state.set('aeOpts', { unit: AE.unit, mode: AE.mode, price: AE.price, vat: AE.vat });
      let tm = 0, ta = 0; const lines = [];
      rows.forEach((r, i) => {
        const m = rowMin(r), a = aeOf(m, AE.unit, AE.mode), tr = rowsEl.children[i];
        if (tr) { tr.querySelector('[data-out=d]').textContent = fmtDur(m); tr.querySelector('[data-out=a]').textContent = isNaN(a) ? '–' : nf(a); }
        if (!isNaN(m)) { tm += m; ta += a; lines.push(`${r.s}–${r.e}${pnum(r.p) ? ` (Pause ${pnum(r.p)} Min.)` : ''}: ${fmtDur(m)} = ${nf(a)} AE`); }
      });
      ta = Math.round(ta * 100) / 100; const pr = pnum(AE.price); let money = '';
      if (pr > 0) {
        const net = ta * pr, vat = AE.vat ? net * .19 : 0;
        money = `<div class="ae-money"><span>Netto</span><b>${eur(net)}</b>${AE.vat ? `<span>zzgl. 19 % USt.</span><b>${eur(vat)}</b><span>Brutto</span><b class="tot">${eur(net + vat)}</b>` : ''}</div>`;
        lines.push(`Summe: ${nf(ta)} AE × ${eur(pr)} = ${eur(net)} netto${AE.vat ? `, ${eur(net + vat)} brutto` : ''}`);
      } else lines.push(`Summe: ${fmtDur(tm)} = ${nf(ta)} AE`);
      $('#aeSum', p).innerHTML = `<div class="ae-big"><b>${nf(ta)}</b><span>AE gesamt</span></div><div class="ae-det"><span>${fmtDur(tm)}</span><span>${nf(tm / 60)} Stunden (dezimal)</span><span>1 AE = ${esc(AE.unit)} Min.</span></div>${money}
        <div class="row"><button class="btn" type="button" id="aeCopy">${ic('copy')}Für die Arbeitserfassung kopieren</button>${sessionActive ? `<button class="btn" type="button" id="aeRep">${ic('clipboard')}In den Bericht übernehmen</button>` : ''}</div>`;
      $('#aeCopy', p).onclick = () => ctx.copy(lines.join('\n'), 'Zusammenfassung kopiert');
      const rep = $('#aeRep', p);
      if (rep) rep.onclick = () => ctx.recordWork('Einsatzdauer', `${fmtDur(tm)} = ${nf(ta)} AE (1 AE = ${AE.unit} Min.)`);
      const q = pnum($('#aeQ', p).value); $('#aeQo', p).textContent = isNaN(q) ? '–' : `${nf(aeOf(q, AE.unit, AE.mode))} AE`;
    }
    rowsEl.addEventListener('input', e => { const f = e.target.dataset.f, i = +e.target.closest('tr').dataset.i; if (f) { rows[i][f] = e.target.value; calc(); } });
    rowsEl.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { rows.splice(+b.dataset.del, 1); drawRows(); } });
    $('#aeAdd', p).onclick = () => { const last = rows[rows.length - 1]; rows.push({ s: last?.e || '', e: '', p: '0' }); drawRows(); rowsEl.lastElementChild.querySelector('[data-f=e]').focus(); };
    $('#aeUnit', p).oninput = e => { AE.unit = Math.max(1, parseInt(e.target.value) || 10); calc(); };
    $('#aeMode', p).onchange = e => { AE.mode = e.target.value; calc(); };
    $('#aePrice', p).oninput = e => { AE.price = e.target.value; calc(); };
    $('#aeVat', p).onchange = e => { AE.vat = e.target.checked; calc(); };
    $('#aeQ', p).oninput = calc;
    drawRows();
  },
};
