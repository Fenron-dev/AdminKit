// Tab „Links“ (#91): Team-Links aus vault/links/links.yaml, Bereiche, Filter,
// Anheften (pro Vault in werkzeug/state.json), eigene Links. Links öffnen im
// Standardbrowser – dort greifen gespeicherte Anmeldungen und der Passwortmanager.
import './werkzeug.css';
import { GetLinks, SaveLinks } from '../../wailsjs/go/main/App';
import { getContext } from './platform.adminkit.js';
import { ICONS, ic } from './icons.js';
import { esc } from './ui.js';
import { viewToggleHTML, getView, setView } from './viewmode.js';

let ctx = null, deps = null, data = null, root = null;
let bereich = 'all', filter = '', editing = null; // editing: Link-ID oder '' (neu)
const pinListeners = [];

const host = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch (_) { return u; } };
const pins = () => new Set(ctx.state.get('linkPins', []));

export async function loadLinks() {
  if (!data) data = await GetLinks();
  return data;
}

export function onPinsChanged(fn) { pinListeners.push(fn); }

export async function initLinksTab(container, d) {
  deps = d; root = container;
  ctx = await getContext(d);
  root.classList.add('wz');
  try { await loadLinks(); } catch (e) { root.innerHTML = `<div class="info-placeholder">Links konnten nicht geladen werden: ${esc(e)}</div>`; return; }
  root.addEventListener('click', onClick);
  root.addEventListener('input', e => { if (e.target.id === 'lkFilter') { filter = e.target.value; renderList(); } });
  render();
}

function linksIn(id) {
  const p = pins();
  let list = data.links || [];
  if (id === 'pinned') list = list.filter(l => p.has(l.id));
  else if (id !== 'all') list = list.filter(l => (l.bereiche || []).includes(id));
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) list = list.filter(l => { const hay = (l.name + ' ' + (l.beschreibung || '') + ' ' + host(l.url) + ' ' + (l.bereiche || []).map(b => bName(b)).join(' ')).toLowerCase(); return words.every(w => hay.includes(w)); });
  return list;
}
const bName = id => (data.bereiche || []).find(b => b.id === id)?.name || id;

function render() {
  root.innerHTML = `<div class="wz-layout">
    <aside class="wz-side"><nav id="lkNav"></nav></aside>
    <section class="wz-pane">
      <div class="lk-head"><div><h3 id="lkTitle"></h3><p class="muted" id="lkDesc"></p></div>
        <div class="row"><input type="search" class="input" id="lkFilter" placeholder="Links filtern (alle Bereiche)…" value="${esc(filter)}" autocomplete="off">
        ${viewToggleHTML(getView(ctx, 'links'))}<button class="btn" type="button" data-lk="new">${ic('plus')}Link</button></div></div>
      <div id="lkEdit"></div><div id="lkList" class="lk-list"></div>
    </section></div>`;
  renderNav(); renderList();
}

function renderNav() {
  const p = pins();
  const item = (id, name, icon, n) => `<button type="button" class="wz-tab" data-bereich="${esc(id)}" aria-selected="${id === bereich}">${ic(icon)}<span>${esc(name)}</span><em>${n}</em></button>`;
  root.querySelector('#lkNav').innerHTML =
    item('all', 'Alle Links', 'grid', (data.links || []).length) +
    item('pinned', 'Angeheftet', 'pin', (data.links || []).filter(l => p.has(l.id)).length) +
    '<div class="wz-g">Bereiche</div>' +
    (data.bereiche || []).map(b => item(b.id, b.kurz || b.name, b.icon || 'folder', (data.links || []).filter(l => (l.bereiche || []).includes(b.id)).length)).join('');
}

function renderList() {
  const b = (data.bereiche || []).find(x => x.id === bereich);
  root.querySelector('#lkTitle').textContent = bereich === 'all' ? 'Alle Links' : bereich === 'pinned' ? 'Angeheftet' : b?.name || '';
  root.querySelector('#lkDesc').textContent = bereich === 'pinned' ? 'Angeheftete Links erscheinen zusätzlich auf dem Dashboard.' : (b?.beschreibung || 'Öffnen im Standardbrowser. Anheften mit dem Stern.');
  const list = linksIn(filter ? 'all' : bereich);
  const p = pins();
  root.querySelector('#lkList').classList.toggle('as-list', getView(ctx, 'links') === 'list');
  root.querySelector('#lkList').innerHTML = list.length ? list.map(l => `
    <div class="lk-row">
      <button class="lk-main" type="button" data-open="${esc(l.id)}" title="${esc(l.url)}">
        <span class="lk-ic">${ic(ICONS[l.icon] ? l.icon : 'link')}</span>
        <span class="lk-txt"><b>${esc(l.name)}${l.eigen ? ' <small class="muted">· eigener Link</small>' : ''}</b><span>${esc(l.beschreibung || '')}</span><em>${esc(host(l.url))}</em></span>
      </button>
      <div class="lk-acts">
        <button class="icon-btn${p.has(l.id) ? ' on' : ''}" type="button" data-pin="${esc(l.id)}" title="${p.has(l.id) ? 'Lösen' : 'Anheften'}">${ic('star', p.has(l.id) ? 'filled' : '')}</button>
        <button class="icon-btn" type="button" data-copyurl="${esc(l.id)}" title="Adresse kopieren">${ic('copy')}</button>
        <button class="icon-btn" type="button" data-edit="${esc(l.id)}" title="Bearbeiten">${ic('pencil')}</button>
      </div>
    </div>`).join('') : `<div class="panel empty">${ic('link')}<p>${filter ? 'Kein Link passt zum Filter.' : bereich === 'pinned' ? 'Noch nichts angeheftet. Mit dem Stern heftest du Links an.' : 'Keine Links in diesem Bereich.'}</p></div>`;
  renderEditor();
}

function renderEditor() {
  const box = root.querySelector('#lkEdit');
  if (editing === null) { box.innerHTML = ''; return; }
  const l = editing === '' ? { name: '', url: 'https://', beschreibung: '', icon: 'link', bereiche: bereich !== 'all' && bereich !== 'pinned' ? [bereich] : [] } : data.links.find(x => x.id === editing);
  if (!l) { editing = null; box.innerHTML = ''; return; }
  const icons = ['link', 'globe', 'folder', 'mail', 'users', 'key', 'lock', 'monitor', 'phone', 'server', 'shield', 'wrench', 'cart', 'store', 'book', 'chat', 'clock', 'download', 'image', 'telephone', 'video', 'code'];
  box.innerHTML = `<form class="panel lk-form" id="lkForm">
    <div class="lk-grid">
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(l.name)}" required></label>
      <label class="field"><span>Adresse</span><input class="input" name="url" value="${esc(l.url)}" required spellcheck="false"></label>
      <label class="field"><span>Beschreibung</span><input class="input" name="beschreibung" value="${esc(l.beschreibung || '')}"></label>
      <label class="field"><span>Symbol</span><select class="input" name="icon">${icons.map(i => `<option${i === l.icon ? ' selected' : ''}>${i}</option>`).join('')}</select></label>
    </div>
    <div class="field"><span>Bereiche</span><div class="lk-bereiche">${(data.bereiche || []).map(b => `<label class="check"><input type="checkbox" name="bereich" value="${esc(b.id)}"${(l.bereiche || []).includes(b.id) ? ' checked' : ''}>${esc(b.name)}</label>`).join('')}</div></div>
    <div class="row"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-lk="cancel">Abbrechen</button>
      ${editing ? `<button class="btn lk-del" type="button" data-lk="delete">${ic('trash')}Löschen</button>` : ''}</div>
  </form>`;
  box.querySelector('#lkForm').addEventListener('submit', e => { e.preventDefault(); saveEditor(new FormData(e.target)); });
  box.querySelector('[name=name]').focus();
}

function slug(s) { return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'link'; }

async function persist(msg) {
  try {
    await SaveLinks(data);
    data = await GetLinks();
    if (msg) ctx.addAction(msg, 'success');
    return true;
  } catch (e) { ctx.toast('Speichern fehlgeschlagen: ' + e); data = await GetLinks(); return false; }
}

async function saveEditor(fd) {
  const l = { name: String(fd.get('name')).trim(), url: String(fd.get('url')).trim(), beschreibung: String(fd.get('beschreibung')).trim(), icon: String(fd.get('icon')), bereiche: fd.getAll('bereich').map(String) };
  if (!/^https?:\/\/[^\s/]+/i.test(l.url)) { ctx.toast('Nur http(s)-Adressen erlaubt'); return; }
  if (!l.bereiche.length) { ctx.toast('Mindestens einen Bereich wählen'); return; }
  if (editing === '') {
    let id = slug(l.name), n = 2; const used = new Set(data.links.map(x => x.id));
    while (used.has(id)) id = slug(l.name) + '-' + (n++);
    data.links.push(Object.assign({ id, eigen: true }, l));
  } else {
    const i = data.links.findIndex(x => x.id === editing);
    data.links[i] = Object.assign({}, data.links[i], l);
  }
  const name = l.name;
  if (await persist((editing === '' ? 'Link angelegt: ' : 'Link gespeichert: ') + name)) { editing = null; renderNav(); renderList(); }
}

async function onClick(e) {
  const t = e.target;
  const v = t.closest('.view-toggle [data-view]'); if (v) { setView(ctx, 'links', v.dataset.view, root); renderList(); return; }
  const b = t.closest('[data-bereich]'); if (b) { bereich = b.dataset.bereich; editing = null; filter = ''; render(); return; }
  const o = t.closest('[data-open]'); if (o) { const l = data.links.find(x => x.id === o.dataset.open); if (l) ctx.open(l.url); return; }
  const pn = t.closest('[data-pin]'); if (pn) { togglePin(pn.dataset.pin); return; }
  const cu = t.closest('[data-copyurl]'); if (cu) { const l = data.links.find(x => x.id === cu.dataset.copyurl); if (l) ctx.copy(l.url, 'Adresse kopiert'); return; }
  const ed = t.closest('[data-edit]'); if (ed) { editing = ed.dataset.edit; renderEditor(); root.querySelector('#lkEdit').scrollIntoView({ block: 'nearest' }); return; }
  const a = t.closest('[data-lk]'); if (!a) return;
  if (a.dataset.lk === 'new') { editing = ''; renderEditor(); }
  if (a.dataset.lk === 'cancel') { editing = null; renderEditor(); }
  if (a.dataset.lk === 'delete') {
    const l = data.links.find(x => x.id === editing);
    const ok = await ctx.confirm({ title: `Link „${l.name}“ löschen?`, what: `Der Link wird aus vault/links/links.yaml entfernt.\n${l.url}`, impact: l.eigen ? '' : 'Mitgelieferte Links bleiben gelöscht und kommen bei Updates nicht zurück.' });
    if (!ok) return;
    data.links = data.links.filter(x => x.id !== editing);
    if (await persist('Link gelöscht: ' + l.name)) { editing = null; renderNav(); renderList(); }
  }
}

export async function togglePin(id) {
  const p = pins();
  if (p.has(id)) p.delete(id); else p.add(id);
  ctx.state.set('linkPins', [...p]);
  if (root) { renderNav(); renderList(); }
  pinListeners.forEach(fn => { try { fn(); } catch (_) { /* ignorieren */ } });
}

// Leiste mit angehefteten Links auf dem Dashboard
export async function renderPinnedBar(el, d) {
  if (!el) return;
  ctx = ctx || await getContext(d);
  try { await loadLinks(); } catch (_) { el.classList.add('hidden'); return; }
  const draw = () => {
    const p = pins();
    const list = (data.links || []).filter(l => p.has(l.id));
    el.classList.toggle('hidden', !list.length);
    el.innerHTML = `<span class="pinned-links-label">📌 Links</span>` + list.map(l => `<button type="button" class="pinned-link" data-open="${esc(l.id)}" title="${esc(l.beschreibung || l.url)}">${ic(ICONS[l.icon] ? l.icon : 'link')}<span>${esc(l.name)}</span></button>`).join('');
  };
  el.classList.add('wz');
  el.onclick = e => { const o = e.target.closest('[data-open]'); if (o) { const l = data.links.find(x => x.id === o.dataset.open); if (l) ctx.open(l.url); } };
  onPinsChanged(draw);
  draw();
}

export function getLinksData() { return data; }
