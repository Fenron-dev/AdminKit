// Werkzeugkasten: Registry (Gruppen, Reihenfolge, Suche) und Tab-Aufbau.
// #105: Angeheftet, zuletzt benutzt, Tags, Plattformfilter, Synonymsuche,
// eigene Einträge (Spickzettel in Markdown) und Anpassungen an mitgelieferten
// Werkzeugen – gespeichert im Vault (werkzeug/eintraege/tools.json).
import './werkzeug.css';
import { esc, ic } from './ui.js';
import { ICONS } from './icons.js';
import { md } from './markdown.js';
import { getContext } from './platform.adminkit.js';
import { PLATFORMS, platName, parseCollection, mergeEntries, filterEntries, tagCounts, orderGroups, renameTag, splitTags, normPlatforms, uniqueId, importCollection, emptyCollection } from './entries.js';
import pw from './tools/pw.js';
import spell from './tools/spell.js';
import imei from './tools/imei.js';
import ae from './tools/ae.js';
import net from './tools/net.js';
import units from './tools/units.js';
import b64 from './tools/b64.js';
import guide from './tools/guide.js';
import wifi from './tools/wifi.js';
import mail from './tools/mail.js';
import hash from './tools/hash.js';
import dns from './tools/dns.js';
import link from './tools/link.js';
import hw from './tools/hw.js';
import err from './tools/err.js';
import mailcfg from './tools/mailcfg.js';
import time from './tools/time.js';
import list from './tools/list.js';
import qr from './tools/qr.js';
import warranty from './tools/warranty.js';
import router from './tools/router.js';
import certport from './tools/certport.js';
import wol from './tools/wol.js';
import macinfo from './tools/macinfo.js';
import commands from './tools/commands.js';
import capture from './tools/capture.js';
import runbook from './tools/runbook.js';
import infocard from './tools/infocard.js';
import redactTool from './tools/redact.js';
import snippets from './tools/snippets.js';
import timeline from './tools/timeline.js';
import linemon from './tools/linemon.js';
import netscan from './tools/netscan.js';
import printers from './tools/printers.js';
import customers from './tools/customers.js';
import watch from './tools/watch.js';
import { collect, dueSoon } from './watch-util.js';

export const GROUPS = ['Netzwerk & Mail', 'Windows & macOS', 'Geräte & Hardware', 'Sicherheit & Passwörter', 'Text & Daten', 'Für Kunden', 'Rechnen & Abrechnung'];
export const TOOLS = [dns, mail, mailcfg, certport, linemon, netscan, net, wol, commands, runbook, capture, timeline, err, hw, printers, macinfo, warranty, router, imei, pw, link, hash, watch, redactTool, b64, time, list, customers, infocard, snippets, spell, wifi, qr, guide, ae, units];
const KIND = 'tools';
const OWN_ICONS = ['book', 'clipboard', 'wrench', 'monitor', 'network', 'printer', 'mail', 'key', 'shield', 'server', 'phone', 'globe', 'code', 'folder', 'users', 'bug', 'zap', 'list'];

export function registerTool(t) { if (!TOOLS.some(x => x.id === t.id)) TOOLS.push(t); }

// Suche nur über mitgelieferte Werkzeuge (für Aufrufer ohne Vault)
export function searchTools(q) { return filterEntries(mergeEntries(TOOLS, emptyCollection()), { q }); }

let ctx = null, root = null, current = null, cleanup = null;
let coll = emptyCollection(), all = [];
let filter = '', selTags = [], plat = '', tagsOpen = false;
let mode = null; // null = Werkzeug, 'anpassen', 'neu', 'edit:<id>', 'ovr:<id>'

const pins = () => ctx.state.get('wzPins', []);
const recent = () => ctx.state.get('wzRecent', []);
const byId = id => all.find(x => x.id === id);

async function loadColl() {
  try { coll = parseCollection(await ctx.entries.load(KIND)); }
  catch (e) { coll = emptyCollection(); ctx.toast('Eigene Werkzeug-Einträge nicht lesbar: ' + e); }
  all = mergeEntries(TOOLS, coll).map(e => e.own ? ownTool(e) : e);
}

async function saveColl(msg) {
  try { await ctx.entries.save(KIND, coll); if (msg) ctx.addAction(msg, 'success'); }
  catch (e) { ctx.toast('Speichern fehlgeschlagen: ' + e); }
  await loadColl();
}

// Eigener Eintrag als Werkzeug: Markdown-Spickzettel
function ownTool(e) {
  return Object.assign(e, {
    icon: ICONS[e.icon] ? e.icon : 'book', keys: '', text: e.text || '',
    render(p) {
      p.innerHTML = `<div class="util wide"><h3>${esc(e.name)}</h3>${e.beschreibung ? `<p>${esc(e.beschreibung)}</p>` : ''}
        <div class="hb-prose wz-own">${e.text ? md(e.text) : '<p class="muted">Noch kein Inhalt. Über „Bearbeiten“ ergänzen.</p>'}</div></div>`;
    },
  });
}

export async function initWerkzeugTab(container, deps) {
  root = container;
  ctx = await getContext(deps);
  ctx.hasTool = id => all.some(t => t.id === id);
  ctx.openTool = (id, args) => { if (args) ctx._prefill[id] = args; select(id); root.querySelector('#wzPane')?.scrollTo?.(0, 0); };
  await loadColl();
  checkDue();
  current = ctx.state.get('lastTool', 'dns');
  plat = ctx.state.get('wzPlat', '');
  root.classList.add('wz');
  root.innerHTML = `<div class="wz-layout">
      <aside class="wz-side"><input type="search" class="input wz-search" id="wzSearch" placeholder="Werkzeug suchen…" autocomplete="off">
        <div id="wzFilt"></div><nav id="wzNav"></nav>
        <div class="wz-sidefoot"><button type="button" class="wz-tab wz-add" data-wz="neu">${ic('plus')}<span>Eigener Eintrag</span></button>
        <button type="button" class="wz-tab wz-add" data-wz="anpassen">${ic('wrench')}<span>Anpassen</span></button></div></aside>
      <section class="wz-pane" id="wzPane"></section>
    </div>`;
  const search = root.querySelector('#wzSearch');
  search.addEventListener('input', e => { filter = e.target.value; renderNav(); });
  search.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = visible()[0]; if (!f) return; if (typeof f.match === 'function' && f.match(filter.trim())) ctx._prefill[f.id] = { q: filter.trim() }; select(f.id); } });
  root.addEventListener('click', onClick);
  renderNav();
  select(current);
}

const visible = () => filterEntries(all, { q: filter, tags: selTags, platform: plat });

function navItem(t, pinned) {
  return `<div class="wz-row"><button type="button" class="wz-tab" data-tool="${esc(t.id)}" aria-selected="${t.id === current && !mode}">${ic(t.icon)}<span>${esc(t.name)}</span>${t.online ? '<em title="braucht Internet">🌐</em>' : ''}${t.own ? '<em title="eigener Eintrag">•</em>' : ''}</button>` +
    `<button type="button" class="icon-btn wz-pin${pinned ? ' on' : ''}" data-pin="${esc(t.id)}" title="${pinned ? 'Lösen' : 'Anheften'}">${ic('star', pinned ? 'filled' : '')}</button></div>`;
}

function renderFilter() {
  const base = filterEntries(all, { platform: plat });
  const counts = tagCounts(base);
  selTags = selTags.filter(t => counts.some(c => c.tag.toLowerCase() === t.toLowerCase()));
  const shown = tagsOpen ? counts : counts.filter((c, i) => i < 8 || selTags.some(t => t.toLowerCase() === c.tag.toLowerCase()));
  root.querySelector('#wzFilt').innerHTML = `<div class="wz-plat">${[['', 'Alle'], ...PLATFORMS].map(([v, l]) => `<button type="button" class="lk-chip${plat === v ? ' on' : ''}" data-plat="${v}">${l}</button>`).join('')}</div>
    <div class="wz-tags">${shown.map(c => `<button type="button" class="lk-chip${selTags.some(t => t.toLowerCase() === c.tag.toLowerCase()) ? ' on' : ''}" data-tag="${esc(c.tag)}">${esc(c.tag)} <em>${c.n}</em></button>`).join('')}
    ${counts.length > 8 ? `<button type="button" class="lk-chip wz-more" data-wz="tagsmore">${tagsOpen ? 'weniger' : `+${counts.length - shown.length} Tags`}</button>` : ''}
    ${selTags.length ? `<button type="button" class="lk-chip wz-more" data-wz="tagsclear">${ic('x')}Filter löschen</button>` : ''}</div>`;
}

function renderNav() {
  renderFilter();
  const list = visible(), P = pins(), pinSet = new Set(P);
  const nav = root.querySelector('#wzNav');
  let html = '';
  if (!filter && !selTags.length) {
    const pinned = P.map(byId).filter(t => t && list.includes(t));
    if (pinned.length) html += `<div class="wz-g">${ic('pin')}Angeheftet</div>` + pinned.map(t => navItem(t, true)).join('');
    const rec = recent().map(byId).filter(t => t && list.includes(t) && !pinSet.has(t.id)).slice(0, 5);
    if (rec.length) html += `<div class="wz-g">${ic('clock')}Zuletzt benutzt</div>` + rec.map(t => navItem(t, false)).join('');
  }
  html += orderGroups(list, GROUPS, coll).map(g => {
    const items = list.filter(t => (t.group || 'Eigene') === g);
    return items.length ? `<div class="wz-g">${esc(g)}</div>` + items.map(t => navItem(t, pinSet.has(t.id))).join('') : '';
  }).join('');
  nav.innerHTML = html || `<p class="muted" style="padding:8px">Kein Werkzeug gefunden.${all.some(t => t.hidden) ? ' Ausgeblendete Werkzeuge findest du unter „Anpassen“.' : ''}</p>`;
}

function toolbar(t) {
  const P = new Set(pins());
  return `<div class="wz-toolbar"><div class="lk-tags">${(t.platforms || []).map(p => `<small class="wz-platt">${esc(platName(p))}</small>`).join('')}${(t.tags || []).map(x => `<small>${esc(x)}</small>`).join('')}</div>
    <div class="row"><button class="icon-btn${P.has(t.id) ? ' on' : ''}" type="button" data-pin="${esc(t.id)}" title="${P.has(t.id) ? 'Lösen' : 'Anheften'}">${ic('star', P.has(t.id) ? 'filled' : '')}</button>
    <button class="icon-btn" type="button" data-wz="${t.own ? 'edit' : 'ovr'}" title="${t.own ? 'Bearbeiten' : 'Gruppe, Tags, Ausblenden'}">${ic('pencil')}</button></div></div>`;
}

export function select(id) {
  const t = byId(id) && !byId(id).hidden ? byId(id) : (visible()[0] || all[0]);
  if (cleanup) { try { cleanup(); } catch (_) { /* ignorieren */ } cleanup = null; }
  mode = null;
  current = t.id;
  ctx.state.set('lastTool', t.id);
  ctx.state.set('wzRecent', [t.id, ...recent().filter(x => x !== t.id)].slice(0, 8));
  renderNav();
  const pane = root.querySelector('#wzPane');
  pane.innerHTML = toolbar(t) + '<div id="wzBody"></div>';
  const r = t.render(pane.querySelector('#wzBody'), ctx);
  // Asynchrone Werkzeuge liefern ihre Aufräumfunktion als Promise
  Promise.resolve(r).then(fn => { if (typeof fn === 'function') { if (current === t.id && !mode) cleanup = fn; else fn(); } }).catch(() => {});
}

function showMode(m) {
  if (cleanup) { try { cleanup(); } catch (_) { /* ignorieren */ } cleanup = null; }
  mode = m;
  renderNav();
  const pane = root.querySelector('#wzPane');
  if (m === 'anpassen') pane.innerHTML = customizeHTML();
  else if (m === 'neu' || m.startsWith('edit:')) pane.innerHTML = ownFormHTML(m === 'neu' ? null : byId(m.slice(5)));
  else if (m.startsWith('ovr:')) pane.innerHTML = ovrFormHTML(byId(m.slice(4)));
  pane.querySelectorAll('form').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); submitForm(f); }));
  if (m !== 'anpassen') pane.querySelector('form input:not([type=checkbox])')?.focus();
  pane.scrollTo?.(0, 0);
}

const groupList = () => `<datalist id="wzGroups">${orderGroups(all, GROUPS, coll).concat(GROUPS).filter((g, i, a) => a.indexOf(g) === i).map(g => `<option value="${esc(g)}">`).join('')}</datalist>`;
const tagList = () => `<datalist id="wzTagList">${tagCounts(all).map(c => `<option value="${esc(c.tag)}">`).join('')}</datalist>`;

function ownFormHTML(e) {
  const x = e || { name: '', group: 'Eigene', tags: selTags.slice(), platforms: plat ? [plat] : [], icon: 'book', beschreibung: '', text: '' };
  return `<form class="panel lk-form wz-form" data-form="own" data-id="${esc(e?.id || '')}">
    <strong>${e ? 'Eigenen Eintrag bearbeiten' : 'Eigener Eintrag'}</strong>
    <p class="muted">Ein Spickzettel in Markdown: Abläufe, Zugangswege, Befehle zum Kopieren, Links. Liegt im Vault und ist für alle im Team sichtbar, die den Vault nutzen.</p>
    <div class="lk-grid">
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(x.name)}" required maxlength="60"></label>
      <label class="field"><span>Gruppe</span><input class="input" name="group" value="${esc(x.group)}" list="wzGroups" maxlength="40">${groupList()}</label>
      <label class="field"><span>Tags, mit Komma getrennt</span><input class="input" name="tags" value="${esc(x.tags.join(', '))}" list="wzTagList">${tagList()}</label>
      <label class="field"><span>Symbol</span><select class="input" name="icon">${OWN_ICONS.map(i => `<option${i === x.icon ? ' selected' : ''}>${i}</option>`).join('')}</select></label>
      <label class="field"><span>Kurzbeschreibung</span><input class="input" name="beschreibung" value="${esc(x.beschreibung || '')}" maxlength="160"></label>
    </div>
    <div class="field"><span>Plattform (keine Auswahl = alle)</span><div class="lk-bereiche">${PLATFORMS.map(([v, l]) => `<label class="check"><input type="checkbox" name="platforms" value="${v}"${x.platforms.includes(v) ? ' checked' : ''}>${l}</label>`).join('')}</div></div>
    <label class="field"><span>Inhalt (Markdown)</span><textarea class="input mono" name="text" rows="14" spellcheck="false" placeholder="## Schritte&#10;1. …&#10;&#10;\`\`\`&#10;ipconfig /all&#10;\`\`\`">${esc(x.text || '')}</textarea></label>
    <div class="row"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-wz="cancel">Abbrechen</button>
      ${e ? `<button class="btn lk-del" type="button" data-wz="delete">${ic('trash')}Löschen</button>` : ''}</div>
  </form>`;
}

function ovrFormHTML(t) {
  if (!t) return '';
  const base = TOOLS.find(x => x.id === t.id);
  return `<form class="panel lk-form wz-form" data-form="ovr" data-id="${esc(t.id)}">
    <strong>„${esc(t.name)}“ anpassen</strong>
    <p class="muted">Mitgelieferte Werkzeuge bleiben unverändert. Deine Anpassungen liegen im Vault und lassen sich jederzeit zurücksetzen.</p>
    <div class="lk-grid">
      <label class="field"><span>Gruppe (Standard: ${esc(base.group)})</span><input class="input" name="group" value="${esc(t.group)}" list="wzGroups" maxlength="40">${groupList()}</label>
      <label class="field"><span>Zusätzliche Tags, mit Komma getrennt</span><input class="input" name="tags" value="${esc(t.extraTags.join(', '))}" list="wzTagList">${tagList()}</label>
    </div>
    <p class="muted">Mitgelieferte Tags: ${(base.tags || []).map(x => `<span class="tag">${esc(x)}</span>`).join(' ') || '–'}</p>
    <label class="check"><input type="checkbox" name="hidden"${t.hidden ? ' checked' : ''}>In der Liste ausblenden</label>
    <div class="row"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-wz="cancel">Abbrechen</button>
      ${coll.overrides[t.id] ? `<button class="btn" type="button" data-wz="reset">Zurücksetzen</button>` : ''}</div>
  </form>`;
}

function customizeHTML() {
  const groups = orderGroups(all, GROUPS, coll);
  const tags = tagCounts(all);
  const hidden = all.filter(t => t.hidden);
  return `<div class="util wide"><h3>Werkzeugkasten anpassen</h3>
    <p>Reihenfolge der Gruppen, Tags und ausgeblendete Werkzeuge. Alles wird im Vault gespeichert (<span class="mono">werkzeug/eintraege/tools.json</span>).</p>
    <div class="sub"><h5>Gruppen</h5><ol class="wz-glist">${groups.map((g, i) => `<li><span>${esc(g)}</span><span class="row">
      <button class="icon-btn" type="button" data-gmove="${i}:-1" title="Nach oben"${i ? '' : ' disabled'}>↑</button>
      <button class="icon-btn" type="button" data-gmove="${i}:1" title="Nach unten"${i < groups.length - 1 ? '' : ' disabled'}>↓</button></span></li>`).join('')}</ol>
      ${coll.groupOrder.length ? `<button class="btn sm" type="button" data-wz="gorderreset">Standard-Reihenfolge</button>` : ''}
      <p class="note">Gruppen entstehen, sobald ein Eintrag sie benutzt. Gruppe eines Werkzeugs ändern: Werkzeug öffnen → Stift.</p></div>
    <div class="sub"><h5>Tags <small>${tags.length}</small></h5>${tags.length ? `<div class="wz-tagtable">${tags.map(c => `<form class="wz-tagrow" data-form="tag" data-tag="${esc(c.tag)}">
      <span class="lk-chip">${esc(c.tag)} <em>${c.n}</em></span><input class="input" name="to" value="${esc(c.tag)}" maxlength="40" aria-label="Neuer Name für ${esc(c.tag)}">
      <button class="btn sm" type="submit">Umbenennen</button><button class="btn sm lk-del" type="button" data-tagdel="${esc(c.tag)}">${ic('trash')}</button></form>`).join('')}</div>
      <p class="note">Gibt es den neuen Namen schon, werden beide Tags zusammengeführt. Umbenennen gilt auch für mitgelieferte Tags.</p>` : '<p class="muted">Noch keine Tags.</p>'}</div>
    <div class="sub"><h5>Ausgeblendet <small>${hidden.length}</small></h5>${hidden.length ? hidden.map(t => `<div class="wz-hrow">${ic(t.icon)}<span>${esc(t.name)}</span><button class="btn sm" type="button" data-unhide="${esc(t.id)}">Einblenden</button></div>`).join('') : '<p class="muted">Nichts ausgeblendet.</p>'}</div>
    <div class="sub"><h5>Sichern & Teilen</h5><p class="muted">Eigene Einträge und Anpassungen als Datei speichern oder aus einer Datei übernehmen.</p>
      <div class="row"><button class="btn" type="button" data-wz="export">${ic('download')}Exportieren</button><button class="btn" type="button" data-wz="import">${ic('upload')}Importieren</button></div></div>
  </div>`;
}

async function submitForm(f) {
  const fd = new FormData(f), kind = f.dataset.form, id = f.dataset.id;
  if (kind === 'own') {
    const e = { name: String(fd.get('name')).trim(), group: String(fd.get('group')).trim() || 'Eigene', tags: splitTags(fd.get('tags')),
      platforms: normPlatforms(fd.getAll('platforms')), icon: String(fd.get('icon')), beschreibung: String(fd.get('beschreibung')).trim(), text: String(fd.get('text')) };
    if (!e.name) { ctx.toast('Name fehlt'); return; }
    let nid = id;
    if (!id) { nid = uniqueId(e.name, new Set(all.map(x => x.id))); coll.entries.push(Object.assign({ id: nid }, e)); }
    else { const i = coll.entries.findIndex(x => x.id === id); coll.entries[i] = Object.assign({}, coll.entries[i], e); }
    await saveColl((id ? 'Eintrag gespeichert: ' : 'Eintrag angelegt: ') + e.name);
    select(nid);
  } else if (kind === 'ovr') {
    const base = TOOLS.find(x => x.id === id), o = {};
    const g = String(fd.get('group')).trim();
    if (g && g !== base.group) o.group = g;
    const tags = splitTags(fd.get('tags'));
    if (tags.length) o.tags = tags;
    if (fd.get('hidden')) o.hidden = true;
    if (Object.keys(o).length) coll.overrides[id] = o; else delete coll.overrides[id];
    await saveColl('Werkzeug angepasst: ' + base.name);
    if (o.hidden) showMode('anpassen'); else select(id);
  } else if (kind === 'tag') {
    const from = f.dataset.tag, to = String(fd.get('to')).trim();
    if (!to || to === from) return;
    renameTag(coll, from, to);
    await saveColl(`Tag umbenannt: ${from} → ${to}`);
    selTags = selTags.map(t => t.toLowerCase() === from.toLowerCase() ? to : t);
    showMode('anpassen');
  }
}

function b64utf8(s) { const b = new TextEncoder().encode(s); let bin = ''; for (const x of b) bin += String.fromCharCode(x); return btoa(bin); }

async function onClick(e) {
  const t = e.target;
  // Kopier-Knöpfe aller Werkzeuge (data-copy)
  const cp = t.closest('[data-copy]'); if (cp) { ctx.copy(cp.dataset.copy); return; }
  const aix = t.closest('[data-aiexplain]'); if (aix) { import('./ai.js').then(m => m.explainWithAI(ctx, { title: 'Ausgabe erklären', kind: 'Befehlsausgabe', text: aix.dataset.aiexplain })); return; }
  const lk = t.closest('.wz-own a[data-open]'); if (lk) { e.preventDefault(); ctx.open(lk.dataset.open); return; }
  if (t.closest('.wz-own a[href="#"]')) { e.preventDefault(); return; }
  const tool = t.closest('[data-tool]'); if (tool) { select(tool.dataset.tool); return; }
  const pin = t.closest('[data-pin]');
  if (pin) {
    const id = pin.dataset.pin, P = pins();
    ctx.state.set('wzPins', P.includes(id) ? P.filter(x => x !== id) : [...P, id]);
    renderNav();
    if (!mode && id === current) { const bar = root.querySelector('.wz-toolbar'); if (bar) bar.outerHTML = toolbar(byId(id)); }
    return;
  }
  const pl = t.closest('[data-plat]'); if (pl) { plat = pl.dataset.plat; ctx.state.set('wzPlat', plat); renderNav(); return; }
  const tg = t.closest('#wzFilt [data-tag]');
  if (tg) { const v = tg.dataset.tag, has = selTags.some(x => x.toLowerCase() === v.toLowerCase()); selTags = has ? selTags.filter(x => x.toLowerCase() !== v.toLowerCase()) : [...selTags, v]; renderNav(); return; }
  const gm = t.closest('[data-gmove]');
  if (gm) {
    const [i, d] = gm.dataset.gmove.split(':').map(Number), g = orderGroups(all, GROUPS, coll);
    [g[i], g[i + d]] = [g[i + d], g[i]];
    coll.groupOrder = g; await saveColl(); showMode('anpassen'); return;
  }
  const uh = t.closest('[data-unhide]');
  if (uh) { const o = coll.overrides[uh.dataset.unhide]; if (o) { delete o.hidden; if (!Object.keys(o).length) delete coll.overrides[uh.dataset.unhide]; } await saveColl(); showMode('anpassen'); return; }
  const td = t.closest('[data-tagdel]');
  if (td) {
    const tag = td.dataset.tagdel, n = tagCounts(all).find(c => c.tag === tag)?.n || 0;
    const ok = await ctx.confirm({ title: `Tag „${tag}“ entfernen?`, what: `Der Tag wird bei ${n} Eintr${n === 1 ? 'ag' : 'ägen'} entfernt. Die Einträge selbst bleiben erhalten.`, impact: 'Filter und Suche über diesen Tag finden die Einträge danach nicht mehr. Mitgelieferte Tags kommen über „Umbenennen“ zurück, eigene müssen neu vergeben werden.' });
    if (!ok) return;
    renameTag(coll, tag, ''); selTags = selTags.filter(x => x.toLowerCase() !== tag.toLowerCase());
    await saveColl('Tag entfernt: ' + tag); showMode('anpassen'); return;
  }
  const a = t.closest('[data-wz]'); if (!a) return;
  const act = a.dataset.wz;
  if (act === 'neu' || act === 'anpassen') showMode(act);
  else if (act === 'edit') showMode('edit:' + current);
  else if (act === 'ovr') showMode('ovr:' + current);
  else if (act === 'cancel') select(current);
  else if (act === 'tagsmore') { tagsOpen = !tagsOpen; renderFilter(); }
  else if (act === 'tagsclear') { selTags = []; renderNav(); }
  else if (act === 'gorderreset') { coll.groupOrder = []; await saveColl(); showMode('anpassen'); }
  else if (act === 'reset') { const id = mode.slice(4); delete coll.overrides[id]; await saveColl('Anpassung zurückgesetzt: ' + byId(id).name); select(id); }
  else if (act === 'delete') {
    const id = mode.slice(5), x = byId(id);
    const ok = await ctx.confirm({ title: `„${x.name}“ löschen?`, what: 'Der eigene Eintrag wird aus dem Vault gelöscht.', impact: 'Der Inhalt ist danach weg, auch für alle anderen, die diesen Vault nutzen. Vorher ggf. unter „Anpassen“ exportieren.' });
    if (!ok) return;
    coll.entries = coll.entries.filter(y => y.id !== id);
    ctx.state.set('wzPins', pins().filter(y => y !== id));
    await saveColl('Eintrag gelöscht: ' + x.name); select('');
  } else if (act === 'export') {
    await ctx.saveDataURL('adminkit-werkzeug.json', 'data:application/json;base64,' + b64utf8(JSON.stringify(coll, null, 2)));
  } else if (act === 'import') {
    const f = await ctx.files.openText('Werkzeug-Einträge importieren', '*.json');
    if (!f) return;
    const inc = parseCollection(f.content);
    if (!inc.entries.length && !Object.keys(inc.overrides).length && !Object.keys(inc.tagAlias).length) { ctx.toast('Keine Einträge in der Datei gefunden'); return; }
    const ok = await ctx.confirm({ title: 'Einträge importieren?', what: `${inc.entries.length} eigene Einträge werden ergänzt, ${Object.keys(inc.overrides).length} Anpassungen und ${Object.keys(inc.tagAlias).length} Tag-Änderungen übernommen.`, impact: 'Gleichnamige Einträge bleiben erhalten, importierte bekommen dann eine neue Kennung. Anpassungen an mitgelieferten Werkzeugen werden durch die importierten ersetzt.' });
    if (!ok) return;
    const r = importCollection(coll, inc, TOOLS.map(x => x.id));
    await saveColl(`Importiert: ${r.added} Einträge, ${r.overrides} Anpassungen`); showMode('anpassen');
  }
}

// Ablauf-Wächter (#129): einmal täglich fällige Fristen ins Aktionsprotokoll
async function checkDue() {
  const today = new Date().toISOString().slice(0, 10);
  if (ctx.state.get('watchNotified', '') === today) return;
  try {
    const w = parseCollection(await ctx.entries.load('waechter')).entries, k = parseCollection(await ctx.entries.load('kunden')).entries;
    const due = dueSoon(collect(w, k));
    if (due.length) ctx.addAction(`Ablauf-Wächter: ${due.length} Frist${due.length > 1 ? 'en' : ''} in den nächsten 14 Tagen (${due.slice(0, 3).map(x => x.name).join(', ')}${due.length > 3 ? ' …' : ''})`, 'warning');
    ctx.state.set('watchNotified', today);
  } catch (_) { /* ohne Vault */ }
}

// Für Befehlspalette/Verknüpfungen aus anderen Tabs
export function openTool(id, args) { if (root && ctx) ctx.openTool(id, args); }

// Einträge für die Befehlspalette (mitgeliefert + eigene, ohne ausgeblendete)
export async function paletteTools(deps) {
  const c = await getContext(deps);
  let cl = emptyCollection();
  try { cl = parseCollection(await c.entries.load(KIND)); } catch (_) { /* ohne Vault nur mitgelieferte */ }
  const P = new Set(c.state.get('wzPins', []));
  return mergeEntries(TOOLS, cl).filter(t => !t.hidden).map(t => ({ id: t.id, name: t.name, group: t.group, online: !!t.online, own: !!t.own, pinned: P.has(t.id),
    keys: [t.keys || '', (t.tags || []).join(' '), (t.platforms || []).map(platName).join(' '), t.beschreibung || '', (t.text || '').slice(0, 2000)].join(' ') }));
}
