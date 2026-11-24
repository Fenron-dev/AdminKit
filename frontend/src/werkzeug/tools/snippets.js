// Textbausteine (#131): Antworten für Tickets und Mails mit Platzhaltern
// ({Kunde}, {Termin} …). {Datum}, {Uhrzeit}, {Techniker}, {Firma} werden
// automatisch gefüllt. Eigene Bausteine im Vault (Sammlung „textbausteine“).
import { $, esc, ic } from '../ui.js';
import { parseCollection, emptyCollection, splitTags, uniqueId } from '../entries.js';

const KIND = 'textbausteine';
export const SNIPPETS = [
  { id: 'termin', name: 'Terminbestätigung', group: 'Termine', text: 'Hallo {Anrede},\n\nvielen Dank für Ihre Anfrage. Wir bestätigen den Termin am {Termin} bei Ihnen vor Ort bzw. per Fernwartung.\n\nBitte halten Sie, falls möglich, Ihre Zugangsdaten bereit und sorgen Sie dafür, dass der betroffene Rechner eingeschaltet ist.\n\nViele Grüße\n{Techniker}\n{Firma}' },
  { id: 'rueckfrage', name: 'Rückfrage zum Problem', group: 'Tickets', text: 'Hallo {Anrede},\n\ndamit wir Ihnen schnell helfen können, benötigen wir noch ein paar Angaben:\n\n- Seit wann tritt das Problem auf?\n- Betrifft es nur einen Rechner oder mehrere?\n- Gibt es eine Fehlermeldung? (Ein Foto oder Screenshot hilft sehr.)\n\nViele Grüße\n{Techniker}' },
  { id: 'erledigt', name: 'Abschlussmeldung', group: 'Tickets', text: 'Hallo {Anrede},\n\nwir haben das Problem „{Problem}“ am {Datum} behoben.\n\nDurchgeführt: {Maßnahme}\n\nSollte es erneut auftreten, melden Sie sich gerne jederzeit.\n\nViele Grüße\n{Techniker}\n{Firma}' },
  { id: 'fernwartung', name: 'Einladung Fernwartung', group: 'Fernwartung', text: 'Hallo {Anrede},\n\nfür die Fernwartung laden Sie bitte das Programm unter {Link} herunter, starten es und nennen mir die angezeigte ID.\n\nIch sehe nur, was Sie freigeben, und die Verbindung endet, sobald Sie das Programm schließen.\n\nViele Grüße\n{Techniker}' },
  { id: 'phishing', name: 'Warnung vor Phishing-Mail', group: 'Sicherheit', text: 'Hallo zusammen,\n\nderzeit sind betrügerische Mails im Umlauf mit dem Betreff „{Betreff}“. Bitte keine Links darin anklicken, keine Anhänge öffnen und keine Zugangsdaten eingeben.\n\nWer bereits geklickt oder Daten eingegeben hat, meldet sich bitte sofort bei uns – das ist kein Problem, schnelles Handeln aber wichtig.\n\nViele Grüße\n{Techniker}\n{Firma}' },
  { id: 'kennwort', name: 'Kennwort zurückgesetzt', group: 'Konten', text: 'Hallo {Anrede},\n\nIhr Kennwort für {Dienst} wurde zurückgesetzt. Das vorläufige Kennwort teile ich Ihnen telefonisch mit – bitte ändern Sie es bei der ersten Anmeldung.\n\nViele Grüße\n{Techniker}' },
  { id: 'wartung', name: 'Wartungsankündigung', group: 'Termine', text: 'Hallo zusammen,\n\nam {Termin} führen wir Wartungsarbeiten an {System} durch. In dieser Zeit ist {System} voraussichtlich für {Dauer} nicht erreichbar.\n\nBitte speichern Sie vorher Ihre Arbeit und melden sich ab.\n\nViele Grüße\n{Techniker}\n{Firma}' },
];

export const placeholdersOf = t => [...new Set([...String(t).matchAll(/\{([\p{L}\p{N} _-]{1,30})\}/gu)].map(m => m[1]))];
export function fillSnippet(t, vals) { return String(t).replace(/\{([\p{L}\p{N} _-]{1,30})\}/gu, (m, n) => (vals[n] ?? '').trim() || m); }
export function autoValues(ctx, now = new Date()) {
  const b = ctx?.branding || {};
  return { Datum: now.toLocaleDateString('de-DE'), Uhrzeit: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), Techniker: b.technician_name || '', Firma: b.company_name || '' };
}

let coll = emptyCollection(), sel = 'termin', vals = {}, q = '';
export default {
  id: 'snippets', name: 'Textbausteine', group: 'Für Kunden', icon: 'chat', tags: ['Mail', 'Ticket', 'Kunde', 'Text'],
  keys: 'textbaustein vorlage antwort mail ticket kunde termin rückfrage abschluss phishing warnung', online: false,
  async render(p, ctx) {
    try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
    const all = () => coll.entries.map(e => Object.assign({ own: true }, e)).concat(SNIPPETS);
    p.innerHTML = `<div class="util wide"><h3>Textbausteine</h3><p>Vorlage wählen, Lücken füllen, kopieren. <span class="mono">{Datum}</span>, <span class="mono">{Techniker}</span> und <span class="mono">{Firma}</span> füllen sich selbst (Einstellungen → Branding).</p>
      <div class="sn-grid"><div><input class="input" id="snQ" type="search" placeholder="Suchen" value="${esc(q)}"><div id="snList" class="sn-list"></div><button class="btn sm" type="button" id="snNew">${ic('plus')}Eigener Baustein</button></div>
        <div id="snMain"></div></div></div>`;
    const list = () => { const w = q.toLowerCase(); $('#snList', p).innerHTML = all().filter(s => !w || [s.name, s.group, (s.tags || []).join(' '), s.text].join(' ').toLowerCase().includes(w)).map(s => `<button type="button" class="wz-tab" data-sn="${esc(s.id)}" aria-selected="${s.id === sel}"><span>${esc(s.name)}</span><em>${esc(s.group || '')}</em></button>`).join(''); };
    const main = () => {
      const s = all().find(x => x.id === sel) || all()[0]; if (!s) return; sel = s.id;
      const auto = autoValues(ctx), ph = placeholdersOf(s.text).filter(n => !(n in auto) || !auto[n]);
      $('#snMain', p).innerHTML = `<div class="er-head"><b>${esc(s.name)}</b>${s.own ? `<span class="tag">eigener Baustein</span><button class="icon-btn" type="button" data-snx="edit" title="Bearbeiten">${ic('pencil')}</button>` : ''}</div>
        ${ph.length ? `<div class="cm-ph">${ph.map(n => `<label class="field"><span>${esc(n)}</span><input class="input" data-snv="${esc(n)}" value="${esc(vals[n] || '')}"></label>`).join('')}</div>` : ''}
        <textarea class="input sn-out" id="snOut" rows="14"></textarea>
        <div class="row"><button class="btn primary" type="button" data-snx="copy">${ic('copy')}Kopieren</button><span class="muted" id="snLeft"></span></div>`;
      out();
    };
    const out = () => { const s = all().find(x => x.id === sel); const t = fillSnippet(s.text, Object.assign({}, autoValues(ctx), vals)); $('#snOut', p).value = t; const left = placeholdersOf(t); $('#snLeft', p).textContent = left.length ? `Noch offen: ${left.join(', ')}` : ''; };
    const form = o => {
      const x = o || { name: '', group: 'Eigene', tags: [], text: '' };
      $('#snMain', p).innerHTML = `<form class="lk-form" id="snF"><div class="lk-grid"><label class="field"><span>Name</span><input class="input" name="name" required value="${esc(x.name)}"></label><label class="field"><span>Gruppe</span><input class="input" name="group" value="${esc(x.group)}"></label>
        <label class="field"><span>Tags</span><input class="input" name="tags" value="${esc((x.tags || []).join(', '))}"></label></div>
        <label class="field"><span>Text – Platzhalter in geschweiften Klammern, z. B. {Kunde}</span><textarea class="input" name="text" rows="12" required>${esc(x.text)}</textarea></label>
        <div class="row"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-snx="cancel">Abbrechen</button>${o ? `<button class="btn lk-del" type="button" data-snx="del">${ic('trash')}Löschen</button>` : ''}</div></form>`;
      $('#snF', p).addEventListener('submit', async e => {
        e.preventDefault(); const fd = new FormData(e.target), n = { name: String(fd.get('name')).trim(), group: String(fd.get('group')).trim() || 'Eigene', tags: splitTags(fd.get('tags')), text: String(fd.get('text')) };
        if (o) Object.assign(coll.entries.find(y => y.id === o.id), n); else { n.id = uniqueId('eigen-' + n.name, new Set(all().map(y => y.id))); coll.entries.push(n); sel = n.id; }
        try { await ctx.entries.save(KIND, coll); } catch (err) { ctx.toast(String(err)); return; }
        list(); main();
      });
    };
    p.addEventListener('input', e => { if (e.target.id === 'snQ') { q = e.target.value; list(); return; } const v = e.target.dataset.snv; if (v) { vals[v] = e.target.value; out(); } });
    p.addEventListener('click', async e => {
      const b = e.target.closest('[data-sn]'); if (b) { sel = b.dataset.sn; list(); main(); return; }
      const x = e.target.closest('[data-snx]'); if (!x) return;
      const cur = coll.entries.find(y => y.id === sel);
      if (x.dataset.snx === 'copy') ctx.copy($('#snOut', p).value, 'Text kopiert');
      else if (x.dataset.snx === 'edit') form(cur);
      else if (x.dataset.snx === 'cancel') main();
      else if (x.dataset.snx === 'del') {
        if (!await ctx.confirm({ title: `„${cur.name}“ löschen?`, what: 'Der eigene Textbaustein wird aus dem Vault gelöscht.', impact: 'Er fehlt danach für alle, die diesen Vault nutzen.' })) return;
        coll.entries = coll.entries.filter(y => y.id !== cur.id); sel = SNIPPETS[0].id;
        try { await ctx.entries.save(KIND, coll); } catch (err) { ctx.toast(String(err)); }
        list(); main();
      }
    });
    $('#snNew', p).onclick = () => form(null);
    list(); main();
  },
};
