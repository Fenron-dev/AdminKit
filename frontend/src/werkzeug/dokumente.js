// Tab „Dokumente“ (#96): Vorlagen, Anschreiben, Kundendienstzettel … im Vault
// unter dokumente/ (eigene Unterordner). Markdown-Vorlagen mit {{Platzhaltern}}
// werden in der App ausgefüllt und als gebrandetes Dokument gedruckt; alle
// anderen Dateien öffnen mit dem Standardprogramm.
import './werkzeug.css';
import { ListDocuments, CreateDocFolder, RenameDoc, DeleteDoc, ReadDocText, SaveDocText, ImportDocuments, OpenDocument, RevealDocument, GetDocumentInfo } from '../../wailsjs/go/main/App';
import { getContext } from './platform.adminkit.js';
import { $, esc, ic } from './ui.js';
import { md } from './markdown.js';
import { fields, fill, autoValues } from './vorlage.js';
import { viewToggleHTML, getView, setView } from './viewmode.js';

let ctx = null, root = null, tree = { folders: [], files: [], root: '' };
let folder = null;  // null = alle, '' = oberste Ebene, sonst relativer Pfad
let query = '';
let edit = null;    // Inline-Formular: { kind: 'folder'|'rename'|'new', path }
let dirty = null;   // Editor mit ungespeicherten Änderungen

const EXT_ICON = { md: 'book', txt: 'book', pdf: 'receipt', doc: 'clipboard', docx: 'clipboard', odt: 'clipboard', rtf: 'clipboard', pages: 'clipboard',
  xls: 'grid', xlsx: 'grid', ods: 'grid', csv: 'grid', numbers: 'grid', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  zip: 'package', html: 'code', htm: 'code', msg: 'mail', eml: 'mail', pptx: 'layout', ppt: 'layout', key: 'layout' };
const base = p => p.split('/').pop();
const stem = n => n.replace(/\.[^.]+$/, '');
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
const fmtDate = d => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const label = f => f === null ? 'Alle Dokumente' : f === '' ? 'Oberste Ebene' : base(f);

export async function initDokumente(container, deps) {
  root = container;
  ctx = await getContext(deps);
  root.classList.add('wz');
  root.addEventListener('click', onClick);
  await reload();
  showList();
}

async function reload() {
  try { tree = (await ListDocuments()) || tree; tree.folders ||= []; tree.files ||= []; }
  catch (e) { root.innerHTML = `<div class="info-placeholder">Dokumente konnten nicht geladen werden: ${esc(e)}</div>`; }
}

const countIn = f => tree.files.filter(x => x.folder === f || x.folder.startsWith(f + '/')).length;

function layout(main) {
  const depth = f => f.split('/').length - 1;
  root.innerHTML = `<div class="wz-layout">
    <aside class="wz-side">
      <nav>
        <button type="button" class="wz-tab" data-folder="*" aria-selected="${folder === null}">${ic('grid')}<span>Alle Dokumente</span><em>${tree.files.length}</em></button>
        <div class="wz-g">Ordner</div>
        ${tree.files.some(x => x.folder === '') ? `<button type="button" class="wz-tab" data-folder="" aria-selected="${folder === ''}">${ic('folder')}<span>Oberste Ebene</span><em>${tree.files.filter(x => x.folder === '').length}</em></button>` : ''}
        ${tree.folders.map(f => `<button type="button" class="wz-tab dk-f" style="padding-left:${8 + depth(f) * 16}px" data-folder="${esc(f)}" aria-selected="${folder === f}" title="${esc(f)}">${ic('folder')}<span>${esc(base(f))}</span><em>${countIn(f)}</em></button>`).join('')}
        <button type="button" class="wz-tab wz-add" data-dk="newfolder">${ic('plus')}<span>${folder ? 'Unterordner anlegen' : 'Ordner anlegen'}</span></button>
      </nav>
      <p class="note" style="margin-top:14px">Alles liegt im Vault unter <span class="mono">dokumente/</span>. Ordner kannst du auch im Finder/Explorer anlegen.</p>
    </aside>
    <section class="wz-pane" id="dkMain">${main}</section></div>`;
}

function showList() {
  dirty = null;
  const isFolder = folder !== null && folder !== '';
  layout(`<div class="lk-head"><div><h3>${esc(label(folder))}${isFolder ? ` <button class="icon-btn" type="button" data-dk="rename" data-path="${esc(folder)}" title="Ordner umbenennen">${ic('pencil')}</button><button class="icon-btn" type="button" data-dk="delete" data-path="${esc(folder)}" title="Ordner löschen (nur leer)">${ic('trash')}</button>` : ''}</h3>
      <p class="muted">${folder === null ? 'Vorlagen, Anschreiben und Formulare des Teams.' : 'dokumente/' + esc(folder)}</p></div>
      <div class="row"><input type="search" class="input" id="dkQ" placeholder="Dokumente durchsuchen" value="${esc(query)}" autocomplete="off">${viewToggleHTML(getView(ctx, 'dokumente'))}</div></div>
    <div class="row dk-actions">
      <button class="btn sm primary" type="button" data-dk="new">${ic('pencil')}Neue Vorlage</button>
      <button class="btn sm" type="button" data-dk="import">${ic('download')}Dateien importieren</button>
      <button class="btn sm" type="button" data-dk="reveal" data-path="${esc(folder || '')}">${ic('folder')}Im ${/Mac/.test(navigator.platform || '') ? 'Finder' : 'Explorer'} öffnen</button>
    </div>
    <div id="dkEdit"></div>
    <div id="dkList"></div>`);
  $('#dkQ', root).addEventListener('input', e => { query = e.target.value; drawList(); });
  renderEdit();
  drawList();
}

function drawList() {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  // Ohne Suche: nur dieser Ordner; mit Suche: auch Unterordner
  const inScope = f => folder === null || f.folder === folder || (!!query && (folder === '' || f.folder.startsWith(folder + '/')));
  const L = tree.files.filter(f => inScope(f) && words.every(w => f.path.toLowerCase().includes(w)));
  const el = $('#dkList', root);
  if (!L.length) {
    el.innerHTML = `<div class="panel empty">${ic('folder')}<p>${query ? `Nichts gefunden zu „${esc(query)}“.` : 'Dieser Ordner ist leer. Lege eine Vorlage an oder importiere Dateien.'}</p></div>`;
    return;
  }
  const acts = f => `<span class="dk-acts">
      <button class="icon-btn" type="button" data-dk="reveal" data-path="${esc(f.path)}" title="Im Ordner zeigen">${ic('folder')}</button>
      <button class="icon-btn" type="button" data-dk="rename" data-path="${esc(f.path)}" title="Umbenennen">${ic('pencil')}</button>
      <button class="icon-btn" type="button" data-dk="delete" data-path="${esc(f.path)}" title="Löschen">${ic('trash')}</button></span>`;
  const where = f => folder === null || query ? (f.folder || 'Oberste Ebene') : '';
  el.innerHTML = getView(ctx, 'dokumente') === 'list'
    ? `<div class="art-list dk-list">${L.map(f => `<div class="art-row dk-row" data-doc="${esc(f.path)}" role="button" tabindex="0">
        <span class="art-row-t">${ic(EXT_ICON[f.ext] || 'clipboard')} ${esc(stem(f.name))}</span><span class="art-row-x">${esc(where(f))}</span>
        <span class="dk-ext">${esc(f.ext.toUpperCase())}</span><span class="art-row-m">${fmtSize(f.size)} · ${fmtDate(f.modified)}</span>${acts(f)}</div>`).join('')}</div>`
    : `<div class="art-grid dk-grid">${L.map(f => `<div class="art-card dk-card" data-doc="${esc(f.path)}" role="button" tabindex="0">
        <span class="dk-top"><span class="dk-ic">${ic(EXT_ICON[f.ext] || 'clipboard')}</span><span class="dk-ext">${esc(f.ext.toUpperCase())}</span>${acts(f)}</span>
        <h2>${esc(stem(f.name))}</h2><p>${esc(where(f))}${f.editable ? (where(f) ? ' · ' : '') + 'in AdminKit öffnen' : (where(f) ? ' · ' : '') + 'öffnet im Standardprogramm'}</p>
        <span class="art-meta"><span>${fmtSize(f.size)}</span><span>${fmtDate(f.modified)}</span></span></div>`).join('')}</div>`;
}

// Inline-Formulare: neuer Ordner, Umbenennen, neue Vorlage
function renderEdit() {
  const box = $('#dkEdit', root);
  if (!box) return;
  if (!edit) { box.innerHTML = ''; return; }
  const t = { folder: [folder ? `Unterordner in „${base(folder)}“` : 'Neuer Ordner', 'Ordnername', ''],
    rename: ['Umbenennen', 'Neuer Name', base(edit.path || '')],
    new: [`Neue Vorlage in „${label(folder === null ? '' : folder)}“`, 'Name der Vorlage', ''] }[edit.kind];
  box.innerHTML = `<form class="panel lk-form dk-form" id="dkForm"><strong>${esc(t[0])}</strong>
    <div class="row"><input class="input" name="n" required maxlength="100" placeholder="${esc(t[1])}" value="${esc(t[2])}">
    <button class="btn primary" type="submit">OK</button><button class="btn" type="button" data-dk="cancel">Abbrechen</button></div>
    ${edit.kind === 'new' ? '<p class="note">Wird als Markdown-Datei (.md) angelegt. Platzhalter wie {{Kunde}} werden beim Ausfüllen abgefragt.</p>' : ''}</form>`;
  const inp = box.querySelector('input');
  inp.focus();
  if (edit.kind === 'rename') { const dot = inp.value.lastIndexOf('.'); inp.setSelectionRange(0, dot > 0 ? dot : inp.value.length); }
  box.querySelector('form').addEventListener('submit', async e => { e.preventDefault(); await submitEdit(inp.value.trim()); });
}

async function submitEdit(name) {
  if (!name) return;
  try {
    if (edit.kind === 'folder') {
      const rel = await CreateDocFolder(folder || '', name);
      ctx.addAction('Dokumente-Ordner angelegt: ' + rel, 'success');
      edit = null; await reload(); folder = rel; showList();
    } else if (edit.kind === 'rename') {
      const old = edit.path, nrel = await RenameDoc(old, name);
      ctx.addAction(`Umbenannt: ${base(old)} → ${base(nrel)}`, 'success');
      if (folder === old) folder = nrel;
      else if (folder && folder.startsWith(old + '/')) folder = nrel + folder.slice(old.length);
      edit = null; await reload(); showList();
    } else if (edit.kind === 'new') {
      const fname = /\.(md|txt)$/i.test(name) ? name : name + '.md';
      const rel = (folder ? folder + '/' : '') + fname;
      if (tree.files.some(f => f.path.toLowerCase() === rel.toLowerCase())) { ctx.toast('Eine Datei mit diesem Namen gibt es schon.'); return; }
      await SaveDocText(rel, `## ${stem(fname)}\n\n**Kunde:** {{Kunde}} · **Datum:** {{Datum}}\n\n{{Inhalt:lang}}\n`);
      edit = null; await reload(); showEditor(rel);
    }
  } catch (e) { ctx.toast(String(e)); }
}

// Platzhalter in der Vorschau sichtbar machen
function previewHTML(text) {
  const marks = {}; fields(text).forEach(f => { marks[f.name] = '⟦' + f.name + '⟧'; });
  return md(fill(text, marks)).replace(/⟦([^⟧]+)⟧/g, '<span class="ph">$1</span>');
}

async function showDoc(rel) {
  let text;
  try { text = await ReadDocText(rel); } catch (e) { ctx.toast(String(e)); return; }
  const f = tree.files.find(x => x.path === rel) || { name: base(rel), folder: '' };
  const fl = fields(text);
  layout(`${crumbs(f)}
    <div class="article"><article>
      <div class="art-top dk-top2"><h1 class="dk-h1">${esc(stem(f.name))}</h1>
        <span class="art-acts">${fl.length ? `<button class="btn sm primary" type="button" data-dk="fill" data-path="${esc(rel)}">${ic('printer')}Ausfüllen &amp; drucken</button>` : `<button class="btn sm primary" type="button" data-dk="print" data-path="${esc(rel)}">${ic('printer')}Drucken</button>`}
        <button class="btn sm" type="button" data-dk="edit" data-path="${esc(rel)}">${ic('pencil')}Bearbeiten</button>
        <button class="btn sm" type="button" data-dk="reveal" data-path="${esc(rel)}">${ic('folder')}Im Ordner zeigen</button></span></div>
      ${fl.length ? `<p class="muted dk-hint">${fl.length} Platzhalter: ${fl.map(x => `<span class="ph">${esc(x.name)}</span>`).join(' ')}</p>` : ''}
      <div class="prose">${previewHTML(text)}</div>
    </article><div></div></div>`);
  $('#dkMain', root).scrollTop = 0;
}

function crumbs(f, extra) {
  return `<div class="crumbs"><a href="#" data-folder="*">Dokumente</a>${f.folder ? f.folder.split('/').map((s, i, a) => `<span>/</span><a href="#" data-folder="${esc(a.slice(0, i + 1).join('/'))}">${esc(s)}</a>`).join('') : ''}${extra ? `<span>/</span><span>${esc(extra)}</span>` : ''}</div>`;
}

async function showFill(rel) {
  let text, info;
  try { text = await ReadDocText(rel); info = await GetDocumentInfo(); } catch (e) { ctx.toast(String(e)); return; }
  const f = tree.files.find(x => x.path === rel) || { name: base(rel), folder: '' };
  const auto = autoValues(info), fl = fields(text);
  layout(`${crumbs(f, 'Ausfüllen')}
    <form id="dkFill" class="dk-fill" autocomplete="off">
      <div class="dk-fields"><h3>${esc(stem(f.name))}</h3>
        ${fl.map(x => `<label class="field"><span>${esc(x.name)}</span>${x.long
          ? `<textarea class="input" name="${esc(x.name)}" rows="4" placeholder="${esc(x.def)}">${esc(auto[x.name] || '')}</textarea>`
          : `<input class="input" name="${esc(x.name)}" value="${esc(auto[x.name] || '')}" placeholder="${esc(x.def)}">`}</label>`).join('')}
        <p class="note">Leere Felder bekommen die Vorgabe (grau), sonst bleiben sie leer. Logo, Firma und Kunde der Session kommen automatisch in den Kopf.</p>
        <div class="row"><button class="btn primary" type="submit">${ic('printer')}Dokument erzeugen</button><button class="btn" type="button" data-doc-back="${esc(rel)}">Zurück</button></div>
      </div>
      <div class="dk-prev prose" id="dkPrev"></div>
    </form>`);
  const form = $('#dkFill', root), prev = $('#dkPrev', root);
  const values = () => Object.fromEntries(new FormData(form).entries());
  const up = () => { prev.innerHTML = md(fill(text, values())); };
  form.addEventListener('input', up);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const title = stem(f.name) + (values().Kunde ? ' – ' + values().Kunde : '');
    const p = await ctx.print('vorlage', title, md(fill(text, values())), ctx.session ? { workTitle: 'Dokument erstellt: ' + stem(f.name) } : {});
    if (p) ctx.toast('Dokument erzeugt und im Browser geöffnet – dort drucken oder als PDF speichern.');
  });
  up();
  form.querySelector('input,textarea')?.focus();
}

async function showEditor(rel) {
  let text;
  try { text = await ReadDocText(rel); } catch (e) { ctx.toast(String(e)); return; }
  const f = tree.files.find(x => x.path === rel) || { name: base(rel), folder: '' };
  dirty = { rel, orig: text };
  layout(`${crumbs(f, 'Bearbeiten')}
    <form id="dkEd">
      <div class="ed-split"><textarea class="input" id="dkBody" spellcheck="true" aria-label="Vorlage in Markdown">${esc(text)}</textarea><div class="ed-prev prose" id="dkEdPrev"></div></div>
      <div class="ed-foot"><span>Markdown · Platzhalter: {{Feld}}, {{Feld|Vorgabe}}, {{Feld:lang}} · Strg + S speichert</span>
        <span class="row"><button class="btn" type="button" data-doc-back="${esc(rel)}">Abbrechen</button><button class="btn primary" type="submit">${ic('check')}Speichern</button></span></div>
    </form>`);
  const ta = $('#dkBody', root), prev = $('#dkEdPrev', root); let tm;
  const up = () => { prev.innerHTML = previewHTML(ta.value) || '<p class="muted">Die Vorschau erscheint hier.</p>'; };
  ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(up, 120); });
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#dkEd', root).requestSubmit(); }
    if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); }
  });
  $('#dkEd', root).addEventListener('submit', async e => {
    e.preventDefault();
    try { await SaveDocText(rel, ta.value); ctx.addAction('Vorlage gespeichert: ' + f.name, 'success'); dirty = null; await reload(); showDoc(rel); }
    catch (err) { ctx.toast('Speichern fehlgeschlagen: ' + err); }
  });
  up();
  ta.focus();
}

async function leave() {
  if (!dirty) return true;
  const ta = $('#dkBody', root);
  if (ta && ta.value !== dirty.orig) {
    const ok = await ctx.confirm({ title: 'Ungespeicherte Änderungen verwerfen?', what: 'Die Vorlage wurde geändert, aber noch nicht gespeichert.', impact: '' });
    if (!ok) return false;
  }
  dirty = null;
  return true;
}

async function openDoc(rel) {
  const f = tree.files.find(x => x.path === rel);
  if (f && f.editable) return showDoc(rel);
  try { await OpenDocument(rel); } catch (e) { ctx.toast('Öffnen fehlgeschlagen: ' + e); }
}

async function onClick(e) {
  const t = e.target;
  const v = t.closest('.view-toggle [data-view]'); if (v) { setView(ctx, 'dokumente', v.dataset.view, root); drawList(); return; }
  const fo = t.closest('[data-folder]'); if (fo) { e.preventDefault(); if (!(await leave())) return; folder = fo.dataset.folder === '*' ? null : fo.dataset.folder; edit = null; query = ''; showList(); return; }
  const back = t.closest('[data-doc-back]'); if (back) { if (!(await leave())) return; showDoc(back.dataset.docBack); return; }
  const a = t.closest('[data-dk]');
  if (!a) { const d = t.closest('[data-doc]'); if (d) openDoc(d.dataset.doc); return; }
  e.stopPropagation();
  const p = a.dataset.path;
  switch (a.dataset.dk) {
    case 'newfolder': if (!(await leave())) return; if (!$('#dkEdit', root)) showList(); edit = { kind: 'folder' }; renderEdit(); break;
    case 'new': edit = { kind: 'new' }; renderEdit(); break;
    case 'rename': if (!$('#dkEdit', root)) showList(); edit = { kind: 'rename', path: p }; renderEdit(); break;
    case 'cancel': edit = null; renderEdit(); break;
    case 'reveal': try { await (!p || tree.folders.includes(p) ? OpenDocument(p || '') : RevealDocument(p)); } catch (err) { ctx.toast(String(err)); } break;
    case 'import': {
      try {
        const added = await ImportDocuments(folder || '');
        if (added && added.length) { ctx.addAction(`${added.length} Datei(en) in die Dokumente übernommen`, 'success'); await reload(); drawList(); }
      } catch (err) { ctx.toast('Import: ' + err); await reload(); drawList(); }
      break;
    }
    case 'delete': {
      const isDir = tree.folders.includes(p);
      if (isDir && countIn(p) > 0) { ctx.toast('Der Ordner ist nicht leer – erst die Dateien darin verschieben oder löschen.'); return; }
      const ok = await ctx.confirm({ title: `${isDir ? 'Ordner' : 'Datei'} „${base(p)}“ löschen?`, what: `dokumente/${p} wird aus dem Vault gelöscht.`, impact: 'Das lässt sich nur über ein Vault-Backup rückgängig machen.' });
      if (!ok) return;
      try {
        await DeleteDoc(p); ctx.addAction('Gelöscht: dokumente/' + p, 'success');
        if (isDir && folder === p) folder = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : null;
        await reload(); showList();
      } catch (err) { ctx.toast(String(err)); }
      break;
    }
    case 'edit': showEditor(p); break;
    case 'fill': showFill(p); break;
    case 'print': {
      try { const text = await ReadDocText(p); await ctx.print('vorlage', stem(base(p)), md(text), {}); } catch (err) { ctx.toast(String(err)); }
      break;
    }
  }
}
