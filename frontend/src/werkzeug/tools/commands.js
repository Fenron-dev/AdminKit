// Befehle-Starter (#110): Einstellungen/Konsolen öffnen und Befehle mit Ausgabe
// ausführen – mit Hilfeseite, Auswertung (Ampel), Plattform-Varianten und eigenen
// Befehlen (Vault, Sammlung „befehle“). Verändernde Befehle nur nach Bestätigung
// mit Auswirkungen. execute() wird auch vom Wiki genutzt (#118).
import { $, esc, ic } from '../ui.js';
import { md, mdInline } from '../markdown.js';
import { COMMANDS, CMD_GROUPS } from '../data/commands.js';
import { evaluate, placeholders, fillCommand } from './cmdeval.js';
import { parseCollection, emptyCollection, splitTags, uniqueId, PLATFORMS, platName } from '../entries.js';

const KIND = 'befehle';
let coll = emptyCollection();
const results = {}; // letzte Ergebnisse je Befehl (nur im Speicher)

export async function loadCommands(ctx) {
  try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
  return allCommands();
}
export const allCommands = () => coll.entries.map(e => Object.assign({ own: true }, e)).concat(COMMANDS);
export const variant = (c, os) => c.v?.[os] || null;
export const cmdText = v => v ? (v.cmd || [v.target, ...(v.args || [])].join(' ')) : '';
const LEVEL_IC = { ok: 'check', warn: 'alert', err: 'x', info: 'info' };

// Öffnet bzw. führt aus. Bestätigung bei verändernden Befehlen (oder force=true, z. B.
// für Befehle direkt aus Wiki-Text). Liefert { result, evals } oder null (abgebrochen).
export async function execute(ctx, c, values = {}, { force = false, origin = '' } = {}) {
  const v = variant(c, ctx.os);
  if (!v) { ctx.toast(`„${c.name}“ gibt es für ${platName(ctx.os)} nicht`); return null; }
  if (c.kind === 'open') {
    try { await ctx.cmd.open(v.target, v.args || []); ctx.addAction(`Geöffnet: ${c.name}`, 'info'); return { result: { output: '', opened: true }, evals: [] }; }
    catch (e) { ctx.toast('Öffnen nicht möglich: ' + e); return null; }
  }
  let command;
  try { command = fillCommand(v.cmd, values); } catch (e) { ctx.toast(e.message); return null; }
  if (c.change || force) {
    const ok = await ctx.confirm({
      title: `${c.name} ausführen?`,
      what: `Befehl${v.admin ? ' (mit Administratorrechten)' : ''}: ${command}${origin ? `\nHerkunft: ${origin}` : ''}`,
      impact: c.change ? (c.impact || 'Dieser Befehl verändert Einstellungen am System.') : 'Der Befehl stammt aus einem Dokument und wird so ausgeführt, wie er dort steht. Nur fortfahren, wenn du ihn verstehst.',
    });
    if (!ok) return null;
  }
  let result;
  try { result = await ctx.cmd.run({ command, shell: v.shell || '', admin: !!v.admin, timeout_sec: v.timeout || 60 }); }
  catch (e) { result = { output: '', error: String(e), exit_code: -1 }; }
  ctx.addAction(`${c.name}: ${result.external ? 'im Admin-Fenster gestartet' : result.error ? 'Fehler' : 'ausgeführt'}`, result.error ? 'warning' : 'success');
  return { result, command, evals: evaluate(c, result) };
}

export function evalHTML(evals) {
  return evals.length ? `<div class="cm-evals">${evals.map(e => `<div class="cm-ev ${e.level}">${ic(LEVEL_IC[e.level] || 'info')}<div><b>${esc(e.title)}</b>${e.text ? `<span>${mdInline(e.text)}</span>` : ''}</div></div>`).join('')}</div>` : '';
}
export function resultHTML(r, command) {
  const codes = [...new Set((r.result.output || '').match(/0x[0-9a-f]{8}/gi) || [])].slice(0, 3);
  return `${evalHTML(r.evals)}${r.result.output ? `<div class="cm-out"><div class="cm-out-h"><span class="mono">${esc(command || '')}</span><span class="muted">${r.result.millis != null ? `${(r.result.millis / 1000).toLocaleString('de-DE')} s · ` : ''}Code ${r.result.exit_code ?? 0}</span>
    <button class="icon-btn" type="button" data-copy="${esc(r.result.output)}" title="Ausgabe kopieren">${ic('copy')}</button></div><pre class="srv">${esc(r.result.output)}</pre></div>` : ''}
    ${codes.length ? `<button class="btn sm ghost" type="button" data-cmerr="${esc(codes.join(' '))}">${ic('bug')}${esc(codes.join(', '))} nachschlagen</button>` : ''}
    ${r.result.output ? `<button class="btn sm ghost" type="button" data-aiexplain="${esc(`Befehl: ${command || ''}\n\n${r.result.output.slice(0, 20000)}`)}">${ic('chat')}Erklären lassen (KI)</button>` : ''}`;
}

function helpHTML(c, v) {
  const h = c.help || {};
  return `<div class="cm-help">${h.zweck ? `<p>${mdInline(h.zweck)}</p>` : ''}
    ${h.params?.length ? `<dl class="kv mc-kv">${h.params.map(([n, d]) => `<dt class="mono">${esc(n)}</dt><dd>${mdInline(d)}</dd>`).join('')}</dl>` : ''}
    ${h.ausgabe ? `<p><b>Was die Ausgabe bedeutet:</b> ${mdInline(h.ausgabe)}</p>` : ''}${h.md ? `<div class="hb-prose">${md(h.md)}</div>` : ''}
    ${c.change ? `<p><b>Auswirkungen:</b> ${mdInline(c.impact || '')}</p>` : ''}
    ${c.ev || c.rules?.length ? '<p class="note">Die Ausgabe wird nach dem Ausführen automatisch bewertet.</p>' : ''}
    ${Object.entries(c.v || {}).map(([os, x]) => `<p class="muted">${esc(platName(os))}: <span class="mono">${esc(cmdText(x))}</span>${x.shell === 'powershell' ? ' (PowerShell)' : ''}${x.admin ? ' · Administratorrechte' : ''}</p>`).join('')}</div>`;
}

const F = { q: '', group: '', allOs: false };

export default {
  id: 'commands', name: 'Befehle & Einstellungen', group: 'Windows & macOS', icon: 'code', tags: ['Windows', 'macOS', 'Befehle', 'Fehlersuche'],
  keys: 'befehl befehle cmd powershell terminal ausführen einstellungen öffnen msc cpl geräte-manager dienste ereignisanzeige ipconfig ping sfc dism chkdsk gpupdate netsh ms-settings systemsteuerung',
  online: false,
  async render(p, ctx) {
    await loadCommands(ctx);
    const elevated = await ctx.cmd.elevated().catch(() => false);
    p.innerHTML = `<div class="util wide"><h3>Befehle & Einstellungen</h3><p>Einstellungen und Verwaltungskonsolen direkt öffnen oder Diagnosebefehle ausführen – mit Hilfe zu jedem Befehl und automatischer Bewertung der Ausgabe. Befehle, die etwas verändern, fragen vorher nach.</p>
      <div class="row"><label class="field" style="flex:1"><span class="sr">Suchen</span><input class="input" id="cmQ" type="search" value="${esc(F.q)}" placeholder="Befehl suchen, z. B. dns, drucker, sfc"></label>
        <label class="check"><input type="checkbox" id="cmAll"${F.allOs ? ' checked' : ''}>Alle Plattformen</label><button class="btn" type="button" id="cmNew">${ic('plus')}Eigener Befehl</button></div>
      <div class="lst-modes" id="cmG"></div>${ctx.os === 'windows' && !elevated ? '<p class="note">AdminKit läuft ohne Administratorrechte: Befehle mit 🛡 öffnen ein eigenes Fenster (Windows fragt nach), die Ausgabe wird dort angezeigt und nicht bewertet.</p>' : ''}
      <div id="cmForm"></div><div id="cmList"></div></div>`;
    const list = $('#cmList', p), form = $('#cmForm', p), vals = {};
    const card = c => {
      const v = variant(c, ctx.os), ph = v?.cmd ? placeholders(v.cmd) : [];
      return `<div class="er-card cm-card${c.own ? ' er-own' : ''}${v ? '' : ' cm-na'}" data-cmid="${esc(c.id)}"><div class="er-head"><b>${esc(c.name)}</b>
        <span class="tag">${c.kind === 'open' ? 'Öffnen' : 'Ausführen'}</span>${c.change ? '<span class="tag cm-chg">verändert</span>' : ''}${v?.admin ? '<span class="tag" title="Administratorrechte">🛡 Admin</span>' : ''}${c.own ? '<span class="tag">eigener Befehl</span>' : ''}
        ${Object.keys(c.v || {}).map(o => `<span class="tag wz-platt">${esc(platName(o))}</span>`).join('')}</div>
        ${v ? `<div class="cm-line"><span class="mono">${esc(cmdText(v))}</span><button class="icon-btn" type="button" data-copy="${esc(cmdText(v))}" title="Befehl kopieren">${ic('copy')}</button></div>` : `<p class="muted">Nicht für ${esc(platName(ctx.os))} verfügbar.</p>`}
        ${ph.length ? `<div class="cm-ph">${ph.map(x => `<label class="field"><span>${esc(x.name)}</span><input class="input mono" data-ph="${esc(x.name)}" value="${esc(vals[c.id]?.[x.name] ?? x.def)}" spellcheck="false"></label>`).join('')}</div>` : ''}
        <div class="row">${v ? `<button class="btn sm${c.change ? '' : ' primary'}" type="button" data-cmrun="${esc(c.id)}">${ic(c.kind === 'open' ? 'ext' : c.change ? 'alert' : 'play')}${c.kind === 'open' ? 'Öffnen' : 'Ausführen'}</button>` : ''}
          <button class="btn sm ghost" type="button" data-cmhelp="${esc(c.id)}">${ic('info')}Hilfe</button><button class="btn sm ghost" type="button" data-copy="${esc(`[[run:${c.id}|${c.name}]]`)}" title="Knopf für einen Wiki-Artikel kopieren">${ic('copy')}Für Wiki</button>
          ${c.own ? `<button class="icon-btn" type="button" data-cmed="${esc(c.id)}" title="Bearbeiten">${ic('pencil')}</button>` : `<button class="icon-btn" type="button" data-cmcopy="${esc(c.id)}" title="Als eigenen Befehl übernehmen und anpassen">${ic('pencil')}</button>`}</div>
        <div class="cm-helpbox" hidden>${helpHTML(c, v)}</div><div class="cm-res">${results[c.id] ? resultHTML(results[c.id], results[c.id].command) : ''}</div></div>`;
    };
    const draw = () => {
      const words = F.q.toLowerCase().split(/\s+/).filter(Boolean);
      const L = allCommands().filter(c => (F.allOs || variant(c, ctx.os)) && (!F.group || c.group === F.group) &&
        words.every(w => [c.name, c.group, (c.tags || []).join(' '), Object.values(c.v || {}).map(cmdText).join(' '), c.help?.zweck || ''].join(' ').toLowerCase().includes(w)));
      const groups = [...new Set([...CMD_GROUPS, ...allCommands().map(c => c.group)])].filter(g => allCommands().some(c => c.group === g && (F.allOs || variant(c, ctx.os))));
      $('#cmG', p).innerHTML = [['', 'Alle'], ...groups.map(g => [g, g])].map(([v, l]) => `<button type="button" class="lk-chip${F.group === v ? ' on' : ''}" data-cmg="${esc(v)}">${esc(l)}</button>`).join('');
      list.innerHTML = groups.map(g => { const G = L.filter(c => c.group === g); return G.length ? `<div class="sub"><h5>${esc(g)} <small>${G.length}</small></h5><div class="cm-grid">${G.map(card).join('')}</div></div>` : ''; }).join('') || '<p class="muted">Kein Befehl passt.</p>';
    };

    const rulesToText = r => (r || []).map(x => x.when === 'number' ? ['zahl', x.pattern, x.op, x.value, x.level, x.text] : [x.when === 'missing' ? 'fehlt' : 'enthält', x.pattern, x.level, x.text]).map(a => a.join(' | ')).join('\n');
    const textToRules = t => String(t || '').split('\n').map(l => l.split('|').map(s => s.trim())).filter(a => a.length >= 3 && a[1]).map(a => a[0].toLowerCase().startsWith('zahl')
      ? { when: 'number', pattern: a[1], op: a[2] || '>', value: a[3] || '0', level: a[4] || 'warn', text: a[5] || '' }
      : { when: a[0].toLowerCase().startsWith('fehlt') ? 'missing' : 'contains', pattern: a[1], level: a[2] || 'info', text: a[3] || '' });
    const showForm = (o, seed) => {
      const x = o || seed || { name: '', group: 'Eigene', tags: [], kind: 'run', v: {}, change: false, impact: '', help: {}, rules: [] };
      const vw = x.v?.windows || {}, vm = x.v?.macos || {};
      form.innerHTML = `<form class="panel lk-form" id="cmF"><strong>${o ? 'Eigenen Befehl bearbeiten' : 'Eigener Befehl'}</strong>
        <div class="lk-grid"><label class="field"><span>Name</span><input class="input" name="name" value="${esc(x.name)}" required maxlength="80"></label>
          <label class="field"><span>Gruppe</span><input class="input" name="group" value="${esc(x.group || 'Eigene')}" list="cmGroups"><datalist id="cmGroups">${CMD_GROUPS.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
          <label class="field"><span>Art</span><select class="input" name="kind"><option value="run"${x.kind !== 'open' ? ' selected' : ''}>Ausführen (Ausgabe anzeigen)</option><option value="open"${x.kind === 'open' ? ' selected' : ''}>Öffnen (Einstellung/Konsole)</option></select></label>
          <label class="field"><span>Tags, mit Komma getrennt</span><input class="input" name="tags" value="${esc((x.tags || []).join(', '))}"></label></div>
        <fieldset class="mc-fs"><legend>Windows (leer = nicht verfügbar)</legend><div class="cm-vrow"><input class="input mono" name="wcmd" value="${esc(cmdText(x.v?.windows))}" placeholder="z. B. ping -n 10 {Ziel|192.168.178.1}" spellcheck="false">
          <select class="input" name="wshell"><option value="cmd">cmd</option><option value="powershell"${vw.shell === 'powershell' ? ' selected' : ''}>PowerShell</option></select><label class="check"><input type="checkbox" name="wadmin"${vw.admin ? ' checked' : ''}>Admin</label></div></fieldset>
        <fieldset class="mc-fs"><legend>macOS (leer = nicht verfügbar)</legend><div class="cm-vrow"><input class="input mono" name="mcmd" value="${esc(cmdText(x.v?.macos))}" placeholder="z. B. ping -c 10 {Ziel|192.168.178.1}" spellcheck="false"><span></span><label class="check"><input type="checkbox" name="madmin"${vm.admin ? ' checked' : ''}>Admin</label></div></fieldset>
        <p class="note">Platzhalter <span class="mono">{Name}</span> oder <span class="mono">{Name|Vorgabe}</span> werden vor dem Start abgefragt. „Öffnen“ erlaubt nur Einstellungsseiten (<span class="mono">ms-settings:…</span>, <span class="mono">x-apple.systempreferences:…</span>), <span class="mono">.msc</span>, <span class="mono">.cpl</span>, <span class="mono">app:Name</span> (macOS) und Windows-Verwaltungsprogramme.</p>
        <label class="check"><input type="checkbox" name="change"${x.change ? ' checked' : ''}>Verändert etwas am System (vor dem Ausführen nachfragen)</label>
        <label class="field"><span>Mögliche Auswirkungen (Pflicht, wenn der Befehl etwas verändert)</span><textarea class="input" name="impact" rows="2">${esc(x.impact || '')}</textarea></label>
        <label class="field"><span>Hilfe: Zweck</span><input class="input" name="zweck" value="${esc(x.help?.zweck || '')}"></label>
        <label class="field"><span>Hilfe: Parameter, eine Zeile „Parameter: Bedeutung“</span><textarea class="input" name="params" rows="2">${esc((x.help?.params || []).map(a => a.join(': ')).join('\n'))}</textarea></label>
        <label class="field"><span>Hilfe: Was bedeutet die Ausgabe? (Markdown)</span><textarea class="input" name="ausgabe" rows="2">${esc(x.help?.ausgabe || '')}</textarea></label>
        <label class="field"><span>Bewertung, eine Regel pro Zeile</span><textarea class="input mono" name="rules" rows="3" placeholder="enthält | Zugriff verweigert | err | Als Administrator ausführen&#10;fehlt | Reply from | warn | Keine Antwort&#10;zahl | Verlust = (\\d+)% | > | 0 | warn | {wert} % Verlust">${esc(rulesToText(x.rules))}</textarea></label>
        <div class="row"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-cmx="cancel">Abbrechen</button>${o ? `<button class="btn lk-del" type="button" data-cmx="del" data-id="${esc(o.id)}">${ic('trash')}Löschen</button>` : ''}</div></form>`;
      const f = $('#cmF', form);
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const fd = new FormData(f), kind = String(fd.get('kind')), v = {};
        const mk = (txt, shell, admin) => { const t = String(txt || '').trim(); if (!t) return null; if (kind === 'open') { const [target, ...args] = t.split(/\s+/); return { target, args }; } return Object.assign({ cmd: t }, shell && shell !== 'cmd' ? { shell } : {}, admin ? { admin: true } : {}); };
        const w = mk(fd.get('wcmd'), fd.get('wshell'), fd.get('wadmin')), m = mk(fd.get('mcmd'), '', fd.get('madmin'));
        if (w) v.windows = w; if (m) v.macos = m;
        const e = { name: String(fd.get('name')).trim(), group: String(fd.get('group')).trim() || 'Eigene', kind, tags: splitTags(fd.get('tags')), v, change: !!fd.get('change'), impact: String(fd.get('impact')).trim(),
          help: { zweck: String(fd.get('zweck')).trim(), params: String(fd.get('params')).split('\n').map(l => l.split(/:(.*)/s).map(s => s.trim())).filter(a => a[0]).map(a => [a[0], a[1] || '']), ausgabe: String(fd.get('ausgabe')).trim() },
          rules: textToRules(fd.get('rules')), platforms: Object.keys(v) };
        if (!e.name || !Object.keys(v).length) { ctx.toast('Name und mindestens eine Plattform angeben'); return; }
        if (e.change && !e.impact) { ctx.toast('Bei verändernden Befehlen die möglichen Auswirkungen beschreiben'); return; }
        if (o) Object.assign(coll.entries.find(y => y.id === o.id), e);
        else coll.entries.push(Object.assign({ id: uniqueId('eigen-' + e.name, new Set(allCommands().map(y => y.id))) }, e));
        try { await ctx.entries.save(KIND, coll); ctx.addAction('Befehl gespeichert: ' + e.name, 'success'); } catch (err) { ctx.toast('Speichern fehlgeschlagen: ' + err); return; }
        form.innerHTML = ''; draw();
      });
      f.querySelector('[name=name]').focus();
      p.closest('.wz-pane')?.scrollTo?.(0, 0);
    };

    p.addEventListener('input', e => { const ph = e.target.closest('[data-ph]'); if (ph) { const id = ph.closest('[data-cmid]').dataset.cmid; (vals[id] = vals[id] || {})[ph.dataset.ph] = ph.value; } });
    p.addEventListener('click', async e => {
      const t = e.target;
      const g = t.closest('[data-cmg]'); if (g) { F.group = g.dataset.cmg; draw(); return; }
      const h = t.closest('[data-cmhelp]'); if (h) { const box = h.closest('.cm-card').querySelector('.cm-helpbox'); box.hidden = !box.hidden; return; }
      const er = t.closest('[data-cmerr]'); if (er) { ctx.openTool('err', { q: er.dataset.cmerr }); return; }
      const r = t.closest('[data-cmrun]');
      if (r) {
        const c = allCommands().find(x => x.id === r.dataset.cmrun), box = r.closest('.cm-card').querySelector('.cm-res');
        r.disabled = true; if (c.kind !== 'open') box.innerHTML = '<p class="muted">Läuft …</p>';
        const res = await execute(ctx, c, vals[c.id] || {});
        r.disabled = false;
        if (!res) { box.innerHTML = results[c.id] ? resultHTML(results[c.id], results[c.id].command) : ''; return; }
        if (c.kind !== 'open') { results[c.id] = res; box.innerHTML = resultHTML(res, res.command); }
        return;
      }
      const ed = t.closest('[data-cmed]'); if (ed) { showForm(coll.entries.find(y => y.id === ed.dataset.cmed)); return; }
      const cp = t.closest('[data-cmcopy]'); if (cp) { const b = COMMANDS.find(y => y.id === cp.dataset.cmcopy); showForm(null, JSON.parse(JSON.stringify(Object.assign({}, b, { id: undefined, name: b.name + ' (angepasst)', group: b.group })))); return; }
      const x = t.closest('[data-cmx]'); if (!x) return;
      if (x.dataset.cmx === 'cancel') { form.innerHTML = ''; return; }
      const o = coll.entries.find(y => y.id === x.dataset.id);
      if (!await ctx.confirm({ title: `„${o.name}“ löschen?`, what: 'Der eigene Befehl wird aus dem Vault gelöscht.', impact: 'Er fehlt danach für alle, die diesen Vault nutzen, auch in Wiki-Artikeln, die auf ihn verweisen.' })) return;
      coll.entries = coll.entries.filter(y => y.id !== o.id);
      try { await ctx.entries.save(KIND, coll); } catch (err) { ctx.toast(String(err)); }
      form.innerHTML = ''; draw();
    });
    $('#cmQ', p).addEventListener('input', e => { F.q = e.target.value; draw(); });
    $('#cmAll', p).addEventListener('change', e => { F.allOs = e.target.checked; draw(); });
    $('#cmNew', p).onclick = () => showForm(null);
    draw();
  },
};

// Aktionsknopf aus Markdown ([[run:…]], [[open:…]], [[cmd:…]]) ausführen (#118/#119).
// Ergebnis erscheint unter dem Absatz; Event „adminkit:cmdresult“ für Abläufe.
export async function runActionButton(ctx, btn, origin) {
  await loadCommands(ctx);
  const kind = btn.dataset.act, arg = btn.dataset.arg || '', label = btn.textContent.trim();
  let c, values = {}, force = false;
  if (kind === 'run') {
    const [id, q] = arg.split('?');
    c = allCommands().find(x => x.id === id);
    if (!c) { ctx.toast(`Befehl „${id}“ gibt es nicht (mehr).`); return null; }
    for (const [k, v] of new URLSearchParams(q || '')) values[k] = v;
  } else if (kind === 'open') {
    c = { name: label, kind: 'open', v: { [ctx.os]: { target: arg } } };
  } else {
    const os = btn.dataset.os;
    if (os && os !== ctx.os) { ctx.toast(`Dieser Befehl ist für ${platName(os)}.`); return null; }
    const cmd = arg.replace(/^(win|windows|mac|macos|linux):/i, '');
    c = { name: label, kind: 'run', v: { [ctx.os]: { cmd, shell: ctx.os === 'windows' && /^\s*(Get-|Set-|\$)/.test(cmd) ? 'powershell' : '' } } };
    force = true;
  }
  if (!variant(c, ctx.os)) { ctx.toast(`„${c.name}“ gibt es für ${platName(ctx.os)} nicht.`); return null; }
  btn.disabled = true;
  const res = await execute(ctx, c, values, { force, origin });
  btn.disabled = false;
  if (!res || res.result.opened) return res;
  const host = btn.closest('p, li, td, .callout') || btn;
  let box = host.nextElementSibling?.classList.contains('wk-runres') ? host.nextElementSibling : null;
  if (!box) { box = document.createElement('div'); box.className = 'wk-runres'; host.after(box); }
  box.innerHTML = resultHTML(res, res.command) + (res.result.output ? `<button class="btn sm ghost" type="button" data-copy-md="${esc('```console\n$ ' + res.command + '\n' + res.result.output + '\n```')}">${ic('copy')}Als Konsolenblock kopieren</button>` : '');
  document.dispatchEvent(new CustomEvent('adminkit:cmdresult', { detail: { command: res.command, name: c.name, result: res.result, evals: res.evals, source: btn } }));
  return res;
}
