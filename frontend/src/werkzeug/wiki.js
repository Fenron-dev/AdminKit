// Wiki-Artikel (#92): Markdown-Dateien im Vault (vault/wiki/), Editor mit
// Vorschau, Bilder als Dateien (wiki/_bilder/<artikel>/), Sonderblöcke aus dem
// Portal. Kein Login – wer den Vault hat, darf lesen und schreiben.
import './werkzeug.css';
import { ListWikiArticles, GetWikiArticle, SaveWikiArticle, DeleteWikiArticle, SaveWikiImage } from '../../wailsjs/go/main/App';
import { getContext } from './platform.adminkit.js';
import { $, $$, esc, ic } from './ui.js';
import { md, setImages, plain } from './markdown.js';
import { ILLU } from './data/illu.js';
import { viewToggleHTML, getView, setView } from './viewmode.js';

let ctx = null, root = null, list = [], cat = '', query = '';
let editing = null; // Artikel im Editor (null = keiner)

const fmtDate = d => { const x = new Date(d); return isNaN(x) || x.getFullYear() < 2000 ? '' : x.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }); };

export async function initWikiArticles(container, deps) {
  root = container;
  ctx = await getContext(deps);
  root.classList.add('wz');
  root.addEventListener('click', onClick);
  await reload();
  showList();
}

async function reload() {
  try { list = (await ListWikiArticles()) || []; }
  catch (e) { root.innerHTML = `<div class="info-placeholder">Wiki konnte nicht geladen werden: ${esc(e)}</div>`; list = []; }
}

function cats() {
  const m = {}; list.forEach(a => { m[a.kategorie] = (m[a.kategorie] || 0) + 1; });
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], 'de'));
}

function layout(main) {
  root.innerHTML = `<div class="wz-layout">
    <aside class="wz-side">
      <button class="btn primary" type="button" data-wk="new" style="width:100%;justify-content:center;margin-bottom:10px">${ic('pencil')}Neuer Artikel</button>
      <nav><button type="button" class="wz-tab" data-cat="" aria-selected="${!cat}">${ic('grid')}<span>Alle Artikel</span><em>${list.length}</em></button>
      <div class="wz-g">Kategorien</div>
      ${cats().map(([c, n]) => `<button type="button" class="wz-tab" data-cat="${esc(c)}" aria-selected="${cat === c}">${ic('book')}<span>${esc(c)}</span><em>${n}</em></button>`).join('')}</nav>
      <p class="note" style="margin-top:14px">Artikel liegen als Markdown im Vault unter <span class="mono">wiki/</span> und lassen sich auch mit Obsidian öffnen.</p>
    </aside>
    <section class="wz-pane" id="wkMain">${main}</section></div>`;
}

function showList() {
  editing = null;
  layout(`<div class="lk-head"><div><h3>${cat ? esc(cat) : 'Wissen'}</h3><p class="muted">${cat ? 'Artikel in dieser Kategorie.' : 'Das gesammelte Wissen des Teams.'}</p></div>
      <div class="row"><input type="search" class="input" id="wkQ" placeholder="Artikel durchsuchen" value="${esc(query)}" autocomplete="off">${viewToggleHTML(getView(ctx, 'wiki'))}</div></div>
    <div id="wkList"></div>`);
  const draw = () => {
    const q = query.toLowerCase().trim();
    const L = list.filter(a => (!cat || a.kategorie === cat) && (!q || (a.titel + ' ' + a.kategorie + ' ' + (a.tags || []).join(' ') + ' ' + a.auszug).toLowerCase().includes(q)));
    const meta = a => [a.geaendert ? 'Aktualisiert ' + fmtDate(a.geaendert) : '', a.autor ? 'von ' + a.autor : ''].filter(Boolean).join(' ');
    $('#wkList', root).innerHTML = L.length && getView(ctx, 'wiki') === 'list'
      ? `<div class="art-list">${L.map(a => `<a class="art-row" href="#" data-slug="${esc(a.slug)}"><span class="art-row-t">${esc(a.titel)}</span><span class="art-row-x">${esc(a.auszug)}</span><span class="cat">${esc(a.kategorie)}</span><span class="art-row-m">${esc(meta(a))}</span></a>`).join('')}</div>`
      : L.length ? `<div class="art-grid">${L.map(a => `<a class="art-card" href="#" data-slug="${esc(a.slug)}"><span class="cat">${esc(a.kategorie)}</span><h2>${esc(a.titel)}</h2><p>${esc(a.auszug)}</p><span class="art-meta"><span>${a.geaendert ? 'Aktualisiert ' + esc(fmtDate(a.geaendert)) : ''}</span><span>${a.autor ? 'von ' + esc(a.autor) : ''}</span></span></a>`).join('')}</div>`
      : `<div class="panel empty">${ic('bookopen')}<p>${q ? `Kein Artikel enthält „${esc(q)}“.` : 'Hier gibt es noch keine Artikel.'}</p></div>`;
  };
  $('#wkQ', root).addEventListener('input', e => { query = e.target.value; draw(); });
  $$('.view-toggle [data-view]', root).forEach(b => b.addEventListener('click', () => { setView(ctx, 'wiki', b.dataset.view, root); draw(); }));
  draw();
}

async function showArticle(slug) {
  let a;
  try { a = await GetWikiArticle(slug); } catch (e) { ctx.toast('Artikel nicht gefunden'); return showList(); }
  setImages(a.images);
  const html = md(a.body);
  const tmp = document.createElement('div'); tmp.innerHTML = html; const heads = $$('h2', tmp);
  layout(`<div class="crumbs"><a href="#" data-cat="">Wissen</a><span>/</span><a href="#" data-cat="${esc(a.kategorie)}">${esc(a.kategorie)}</a></div>
    <div class="article"><article>
      <h1>${esc(a.titel)}</h1>
      <div class="art-top"><span>${a.geaendert ? 'Aktualisiert ' + esc(fmtDate(a.geaendert)) : ''}${a.autor ? ' von ' + esc(a.autor) : ''}${a.vorgabe ? ' · mitgelieferter Artikel' : ''}</span>
        ${(a.tags || []).length ? `<span class="tags">${a.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}
        <span class="art-acts"><button class="btn sm" type="button" data-wk="edit" data-slug="${esc(a.slug)}">${ic('pencil')}Bearbeiten</button><button class="btn sm danger" type="button" data-wk="delete" data-slug="${esc(a.slug)}">${ic('trash')}Löschen</button></span></div>
      <div class="prose" id="wkProse">${html}</div>
      ${a.erstellt && fmtDate(a.erstellt) ? `<p class="muted" style="margin-top:40px;font-size:13px">Erstellt am ${esc(fmtDate(a.erstellt))}.</p>` : ''}
    </article>
    ${heads.length > 1 ? `<nav class="toc" aria-label="Inhalt"><strong>Auf dieser Seite</strong>${heads.map(h => `<button type="button" data-scroll="${h.id}">${esc(h.textContent)}</button>`).join('')}</nav>` : '<div></div>'}
    </div>`);
  $('#wkMain', root).scrollTop = 0;
}

function showEditor(a) {
  const isNew = !a;
  editing = a ? Object.assign({}, a) : { slug: '', titel: '', kategorie: cat || '', tags: [], body: '', images: {} };
  const imgs = Object.assign({}, editing.images || {});
  layout(`<form id="edForm" autocomplete="off">
    <div class="crumbs"><a href="#" data-cat="">Wissen</a><span>/</span><span>${isNew ? 'Neuer Artikel' : 'Bearbeiten'}</span></div>
    <div class="ed-meta">
      <label class="field ed-title"><span>Titel</span><input class="input" name="title" required maxlength="100" value="${esc(editing.titel)}" placeholder="Worum geht es?"></label>
      <label class="field"><span>Kategorie</span><input class="input" name="cat" required list="wkCats" maxlength="40" value="${esc(editing.kategorie)}" placeholder="z. B. Hosting"><datalist id="wkCats">${cats().map(c => `<option value="${esc(c[0])}">`).join('')}</datalist></label>
      <label class="field"><span>Schlagwörter, mit Komma getrennt</span><input class="input" name="tags" value="${esc((editing.tags || []).join(', '))}" placeholder="dns, ssl"></label>
    </div>
    <div class="ed-bar" role="toolbar" aria-label="Formatierung">
      <button type="button" data-md="bold" title="Fett (Strg+B)"><b>B</b></button><button type="button" data-md="italic" title="Kursiv (Strg+I)"><i>I</i></button><button type="button" data-md="code" title="Code">${ic('code')}</button>
      <span class="sep"></span><button type="button" data-md="h2" title="Überschrift">H2</button><button type="button" data-md="h3" title="Unterüberschrift">H3</button>
      <span class="sep"></span><button type="button" data-md="ul" title="Liste">${ic('list')}</button><button type="button" data-md="task" title="Checkliste">${ic('check')}</button><button type="button" data-md="link" title="Link">${ic('link')}</button><button type="button" data-md="table" title="Tabelle">${ic('grid')}</button>
      <span class="sep"></span><button type="button" data-md="tip" title="Tipp-Kasten">Tipp</button><button type="button" data-md="warn" title="Warnung">Warnung</button><button type="button" data-md="pre" title="Codeblock">{ }</button>
      <span class="sep"></span><button type="button" data-md="img" title="Bild einfügen (Screenshots auch mit Strg + V)">${ic('image')}Bild</button><button type="button" data-md="flow" title="Ablauf-Diagramm">Ablauf</button><button type="button" data-md="cmp" title="Vergleichstabelle">Vergleich</button><button type="button" data-md="illu" title="Fertige Illustration">Illustration</button><input type="file" id="edImg" accept="image/*" hidden>
      <button type="button" class="tog" data-md="preview" title="Vorschau ein- oder ausblenden">${ic('eye')}Vorschau</button>
    </div>
    <div class="ed-split" id="edSplit"><textarea class="input" id="edBody" name="body" spellcheck="true" aria-label="Artikeltext in Markdown" placeholder="Schreib los. Markdown wird unterstützt, die Vorschau aktualisiert sich beim Tippen.">${esc(editing.body)}</textarea><div class="ed-prev prose" id="edPrev"></div></div>
    <div class="ed-foot"><span>Strg + S speichert. Hilfe im Artikel „So schreibst du Wiki-Artikel“.</span>
      <span class="row"><button class="btn" type="button" data-wk="cancel">Abbrechen</button><button class="btn primary" type="submit">${ic('check')}${isNew ? 'Artikel speichern' : 'Änderungen speichern'}</button></span></div>
  </form>`);
  const ta = $('#edBody', root), prev = $('#edPrev', root); let tm;
  const up = () => { setImages(imgs); prev.innerHTML = md(ta.value) || '<p class="muted">Die Vorschau erscheint hier.</p>'; };
  const addImg = async file => {
    if (!file || !/^image\//.test(file.type)) return;
    if (!editing.slug) { ctx.toast('Bitte den Artikel zuerst einmal speichern, dann Bilder einfügen.'); return; }
    try {
      const data = await imgToData(file);
      const rel = await SaveWikiImage(editing.slug, file.name || 'bild', data);
      imgs[rel] = data;
      insertAt(ta, (ta.selectionStart > 0 && ta.value[ta.selectionStart - 1] !== '\n' ? '\n\n' : '') + `![Bild](${rel})\n`, '');
      ctx.toast(`Bild gespeichert (${Math.round(data.length * 0.75 / 1024)} KB)`);
    } catch (e) { ctx.toast('Das Bild konnte nicht gespeichert werden: ' + e); }
  };
  $('#edImg', root).onchange = e => { addImg(e.target.files[0]); e.target.value = ''; };
  ta.addEventListener('paste', e => { const it = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith('image/')); if (it) { e.preventDefault(); addImg(it.getAsFile()); } });
  ta.addEventListener('dragover', e => e.preventDefault());
  ta.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f && f.type.startsWith('image/')) { e.preventDefault(); addImg(f); } });
  $('#edForm', root).addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(up, 120); });
  $('.ed-bar', root).addEventListener('click', e => { const b = e.target.closest('[data-md]'); if (!b) return; mdAction(b.dataset.md, ta); up(); });
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); mdAction('bold', ta); up(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); mdAction('italic', ta); up(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#edForm', root).requestSubmit(); }
    if (e.key === 'Tab') { e.preventDefault(); insertAt(ta, '  ', ''); }
  });
  $('#edForm', root).addEventListener('submit', e => { e.preventDefault(); save(new FormData(e.target)); });
  up();
  setTimeout(() => (isNew ? $('#edForm [name=title]', root) : ta).focus(), 30);
}

async function save(fd) {
  const a = {
    slug: editing.slug, titel: String(fd.get('title')).trim(), kategorie: String(fd.get('cat')).trim(),
    tags: String(fd.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean), body: String(fd.get('body')),
  };
  if (!a.titel || !a.kategorie) { ctx.toast('Titel und Kategorie fehlen noch.'); return; }
  if (!a.body.trim()) { ctx.toast('Der Artikel ist noch leer.'); return; }
  try {
    const slug = await SaveWikiArticle(a);
    ctx.addAction('Wiki-Artikel gespeichert: ' + a.titel, 'success');
    await reload();
    cat = a.kategorie;
    showArticle(slug);
  } catch (e) { ctx.toast('Speichern fehlgeschlagen: ' + e); }
}

function insertAt(ta, before, after = '', ph = '') {
  const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph;
  ta.setRangeText(before + sel + after, s, e, 'end');
  if (!ta.value.slice(s, e).length && ph) { ta.selectionStart = s + before.length; ta.selectionEnd = s + before.length + sel.length; }
  ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
}
function linePrefix(ta, p) {
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1;
  ta.setRangeText(v.slice(ls, e).split('\n').map(l => p + l).join('\n'), ls, e, 'end');
  ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
}
function mdAction(k, ta) {
  const nl = () => { const s = ta.selectionStart; return s > 0 && ta.value[s - 1] !== '\n' ? '\n\n' : ''; };
  switch (k) {
    case 'bold': return insertAt(ta, '**', '**', 'fetter Text');
    case 'italic': return insertAt(ta, '*', '*', 'kursiver Text');
    case 'code': return insertAt(ta, '`', '`', 'code');
    case 'h2': return linePrefix(ta, '## ');
    case 'h3': return linePrefix(ta, '### ');
    case 'ul': return linePrefix(ta, '- ');
    case 'task': return linePrefix(ta, '- [ ] ');
    case 'link': return insertAt(ta, '[', '](https://)', 'Linktext');
    case 'table': return insertAt(ta, nl() + '| Spalte A | Spalte B |\n|---|---|\n| ', '| Wert |\n', 'Wert');
    case 'tip': return insertAt(ta, nl() + '> [!TIPP] Überschrift\n> ', '\n', 'Ein hilfreicher Hinweis.');
    case 'warn': return insertAt(ta, nl() + '> [!WARNUNG]\n> ', '\n', 'Worauf man achten muss.');
    case 'pre': return insertAt(ta, nl() + '```bash\n', '\n```\n', 'befehl --option');
    case 'img': return $('#edImg', root).click();
    case 'flow': return insertAt(ta, nl() + '```ablauf\n', '\nZweiter Schritt | Kurze Erklärung\nDritter Schritt | Kurze Erklärung\n```\n', 'Erster Schritt | Kurze Erklärung');
    case 'cmp': return insertAt(ta, nl() + '```vergleich\n | Variante A | Variante B\n', '\nBequem | - umständlich | + ein Klick\n```\n', 'Sicher | + ja | - nein');
    case 'illu': ctx.toast('Verfügbar: ' + Object.keys(ILLU).join(', ')); return insertAt(ta, nl() + '```illustration\n', '\nBildunterschrift\n```\n', Object.keys(ILLU)[0]);
    case 'preview': $('#edSplit', root).classList.toggle('no-prev'); return;
  }
}

// Bilder verkleinern (max. 1400 px) und als WebP/JPEG speichern
async function imgToData(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 1400; let w = img.naturalWidth, h = img.naturalHeight; if (w > max) { h = Math.round(h * max / w); w = max; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    let d = c.toDataURL('image/webp', 0.82); if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', 0.82);
    return d;
  } finally { URL.revokeObjectURL(url); }
}

async function onClick(e) {
  const t = e.target;
  const open = t.closest('a[data-open]'); if (open) { e.preventDefault(); ctx.open(open.dataset.open); return; }
  const wl = t.closest('a[data-wiki]'); if (wl) { e.preventDefault(); showArticle(wl.dataset.wiki); return; }
  const card = t.closest('[data-slug]:not([data-wk])'); if (card) { e.preventDefault(); showArticle(card.dataset.slug); return; }
  const c = t.closest('[data-cat]'); if (c && !editing) { e.preventDefault(); cat = c.dataset.cat; query = ''; showList(); return; }
  if (c && editing) { e.preventDefault(); if (await leaveEditor()) { cat = c.dataset.cat; showList(); } return; }
  const sc = t.closest('[data-scroll]'); if (sc) { $('#' + CSS.escape(sc.dataset.scroll), root)?.scrollIntoView({ behavior: 'smooth' }); return; }
  const cp = t.closest('.code-copy'); if (cp) { ctx.copy(cp.previousElementSibling?.textContent || '', 'Code kopiert'); return; }
  const b = t.closest('[data-wk]'); if (!b) return;
  switch (b.dataset.wk) {
    case 'new': if (await leaveEditor()) showEditor(null); break;
    case 'cancel': if (await leaveEditor()) showList(); break;
    case 'edit': { try { showEditor(await GetWikiArticle(b.dataset.slug)); } catch (err) { ctx.toast(String(err)); } break; }
    case 'delete': {
      const a = list.find(x => x.slug === b.dataset.slug);
      const ok = await ctx.confirm({ title: `Artikel „${a?.titel || b.dataset.slug}“ löschen?`, what: `Die Datei wiki/${b.dataset.slug}.md und die Bilder des Artikels werden aus dem Vault gelöscht.`, impact: a?.vorgabe ? 'Mitgelieferte Artikel kommen danach nicht automatisch zurück.' : 'Das lässt sich nur über ein Vault-Backup rückgängig machen.' });
      if (!ok) return;
      try { await DeleteWikiArticle(b.dataset.slug); ctx.addAction('Wiki-Artikel gelöscht: ' + (a?.titel || b.dataset.slug), 'success'); await reload(); showList(); }
      catch (err) { ctx.toast(String(err)); }
      break;
    }
  }
}

async function leaveEditor() {
  if (!editing) return true;
  const ta = $('#edBody', root);
  if (ta && ta.value !== (editing.body || '')) {
    const ok = await ctx.confirm({ title: 'Ungespeicherte Änderungen verwerfen?', what: 'Der Artikel wurde geändert, aber noch nicht gespeichert.', impact: '' });
    if (!ok) return false;
  }
  editing = null;
  return true;
}

// Für die Befehlspalette
export async function wikiPaletteItems(deps, openArticle) {
  if (!ctx) ctx = await getContext(deps);
  const L = await ListWikiArticles();
  return (L || []).map(a => ({ group: 'Wiki', icon: '📄', title: a.titel, sub: a.kategorie + ((a.tags || []).length ? ', ' + a.tags.join(', ') : ''), keys: a.auszug, run: () => openArticle(a.slug) }));
}
export function openArticle(slug) { if (root) showArticle(slug); }
export { plain };
