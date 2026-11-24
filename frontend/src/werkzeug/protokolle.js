// Protokolle-Tab: Protokolle aus Abläufen (#119) an einem eigenen Ort statt im Wiki.
// Gespeichert werden sie weiterhin als Markdown im Vault (wiki/, Kategorie
// „Protokolle“), damit Bilder/Videos, Kundenakte und bestehende Protokolle
// unverändert funktionieren – das Wiki blendet diese Kategorie nur aus.
import './werkzeug.css';
import { ListWikiArticles, GetWikiArticle, DeleteWikiArticle } from '../../wailsjs/go/main/App';
import { getContext } from './platform.adminkit.js';
import { $, esc, ic } from './ui.js';
import { md, setImages, setMediaBase } from './markdown.js';
import { openMedia } from './media.js';
import { parseCollection } from './entries.js';

export const PROTO_CAT = 'Protokolle';
let ctx = null, root = null, list = [], running = new Map(), filter = '', query = '', current = null;

const fmtDate = d => { const x = new Date(d); return isNaN(x) || x.getFullYear() < 2000 ? '' : x.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const custOf = a => (a.tags || []).filter(t => t !== 'Protokoll').join(', ');

export async function initProtokolle(container, deps, slug) {
  root = container;
  ctx = await getContext(deps);
  root.classList.add('wz');
  root.addEventListener('click', onClick);
  await refresh(slug);
}

// Beim Öffnen des Tabs neu laden (neue Abläufe, abgeschlossene Protokolle)
export async function refresh(slug) {
  if (!root) return;
  if (slug) current = slug;
  try { list = ((await ListWikiArticles()) || []).filter(a => a.kategorie === PROTO_CAT).sort((a, b) => String(b.geaendert || '').localeCompare(String(a.geaendert || ''))); }
  catch (e) { root.innerHTML = `<div class="info-placeholder">Protokolle konnten nicht geladen werden: ${esc(e)}</div>`; return; }
  try { running = new Map(parseCollection(await ctx.entries.load('ablaeufe')).entries.filter(r => !r.finished).map(r => [r.id, r])); }
  catch (_) { running = new Map(); }
  if (current) showProtocol(current); else showList();
}

function layout(main) {
  const n = { '': list.length, run: list.filter(a => running.has(a.slug)).length, done: list.filter(a => !running.has(a.slug)).length };
  const tab = (id, label, icon) => `<button type="button" class="wz-tab" data-pfilter="${id}" aria-selected="${filter === id && !current}">${ic(icon)}<span>${label}</span><em>${n[id]}</em></button>`;
  root.innerHTML = `<div class="wz-layout">
    <aside class="wz-side">
      <button class="btn primary" type="button" data-pk="new" style="width:100%;justify-content:center;margin-bottom:10px">${ic('play')}Ablauf starten</button>
      <nav>${tab('', 'Alle Protokolle', 'grid')}${tab('run', 'In Arbeit', 'clock')}${tab('done', 'Abgeschlossen', 'check')}</nav>
      <p class="note" style="margin-top:14px">Hier landen die Protokolle aus Werkzeugkasten → Abläufe. Sie liegen als Markdown im Vault unter <span class="mono">wiki/</span> (Kategorie „${PROTO_CAT}“), erscheinen aber nicht im Wiki.</p>
    </aside>
    <section class="wz-pane" id="pkMain">${main}</section></div>`;
}

function showList() {
  current = null;
  layout(`<div class="lk-head"><div><h3>Protokolle</h3><p class="muted">Dokumentierte Abläufe – je Kunde, Gerät oder Ticket.</p></div>
      <div class="row"><input type="search" class="input" id="pkQ" placeholder="Protokolle durchsuchen (Titel, Kunde)" value="${esc(query)}" autocomplete="off"></div></div>
    <div id="pkList"></div>`);
  const draw = () => {
    const w = query.toLowerCase().split(/\s+/).filter(Boolean);
    const L = list.filter(a => (!filter || (filter === 'run') === running.has(a.slug)) && w.every(x => (a.titel + ' ' + (a.tags || []).join(' ') + ' ' + a.auszug).toLowerCase().includes(x)));
    $('#pkList', root).innerHTML = L.length ? `<div class="art-list">${L.map(a => `<a class="art-row" href="#" data-pslug="${esc(a.slug)}"><span class="art-row-t">${esc(a.titel)}</span><span class="art-row-x">${esc(custOf(a) || a.auszug)}</span><span class="cat">${running.has(a.slug) ? 'In Arbeit' : 'Abgeschlossen'}</span><span class="art-row-m">${esc(fmtDate(a.geaendert))}</span></a>`).join('')}</div>`
      : `<div class="panel empty">${ic('clipboard')}<p>${query ? `Kein Protokoll enthält „${esc(query)}“.` : 'Noch keine Protokolle. Starte einen Ablauf, dann entsteht hier automatisch eines.'}</p></div>`;
  };
  $('#pkQ', root).addEventListener('input', e => { query = e.target.value; draw(); });
  draw();
}

async function showProtocol(slug) {
  let a;
  try { a = await GetWikiArticle(slug); } catch (e) { ctx.toast('Protokoll nicht gefunden'); return showList(); }
  current = slug;
  setImages(a.images); setMediaBase(a.slug);
  const run = running.get(slug);
  layout(`<div class="crumbs"><a href="#" data-pfilter="">Protokolle</a><span>/</span><span>${run ? 'In Arbeit' : 'Abgeschlossen'}</span></div>
    <div class="article"><article>
      <h1>${esc(a.titel)}</h1>
      <div class="art-top"><span>${a.geaendert ? 'Zuletzt gespeichert ' + esc(fmtDate(a.geaendert)) : ''}${a.autor ? ' von ' + esc(a.autor) : ''}</span>
        ${custOf(a) ? `<span class="tags">${(a.tags || []).filter(t => t !== 'Protokoll').map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}
        <span class="art-acts">${run ? `<button class="btn sm primary" type="button" data-pk="resume">${ic('play')}Fortsetzen</button>` : ''}
          <button class="btn sm" type="button" data-pk="ai">${ic('chat')}KI-Zusammenfassung</button>
          <button class="btn sm" type="button" data-pk="print">${ic('download')}Drucken / PDF</button>
          <button class="btn sm danger" type="button" data-pk="delete">${ic('trash')}Löschen</button></span></div>
      <div class="prose" id="pkProse">${md(a.body)}</div>
    </article><div></div></div>`);
  $('#pkMain', root).scrollTop = 0;
}

async function onClick(e) {
  const t = e.target;
  const open = t.closest('a[data-open]'); if (open) { e.preventDefault(); ctx.open(open.dataset.open); return; }
  const wl = t.closest('a[data-wiki]'); if (wl) { e.preventDefault(); document.dispatchEvent(new CustomEvent('adminkit:open-wiki', { detail: { slug: wl.dataset.wiki } })); return; }
  const row = t.closest('[data-pslug]'); if (row) { e.preventDefault(); showProtocol(row.dataset.pslug); return; }
  const f = t.closest('[data-pfilter]'); if (f) { e.preventDefault(); filter = f.dataset.pfilter; showList(); return; }
  const aix = t.closest('[data-aiexplain]'); if (aix) { import('./ai.js').then(m => m.explainWithAI(ctx, { title: 'Ausgabe erklären', kind: 'Befehlsausgabe', text: aix.dataset.aiexplain })); return; }
  const cmd = t.closest('[data-copy-md]'); if (cmd) { ctx.copy(cmd.dataset.copyMd, 'Konsolenblock kopiert'); return; }
  const cp = t.closest('.code-copy'); if (cp) { ctx.copy(cp.previousElementSibling?.textContent || '', 'Code kopiert'); return; }
  const ce = t.closest('[data-cmerr]'); if (ce) { ctx.openTool?.('err', { q: ce.dataset.cmerr }); return; }
  const mf = t.closest('a.md-file'); if (mf) { e.preventDefault(); openMedia(mf.dataset.media).catch(err => ctx.toast(String(err))); return; }
  const emb = t.closest('.md-embed button'); if (emb) { const box = emb.closest('.md-embed'); box.innerHTML = `<iframe src="${esc(box.dataset.embed)}" title="Video" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`; box.classList.add('on'); return; }
  const b = t.closest('[data-pk]'); if (!b) return;
  const openTool = args => document.dispatchEvent(new CustomEvent('adminkit:open-tool', { detail: { id: 'runbook', args } }));
  const a = list.find(x => x.slug === current);
  switch (b.dataset.pk) {
    case 'new': openTool({}); break;
    case 'resume': openTool({ resume: current }); break;
    case 'print': ctx.print('protokoll', a?.titel || 'Protokoll', $('#pkProse', root).innerHTML, { workTitle: '', workDetail: '' }); break;
    case 'ai': {
      const art = await GetWikiArticle(current);
      const { explainWithAI } = await import('./ai.js');
      explainWithAI(ctx, { title: 'Kundenzusammenfassung', mode: 'summary', text: art.body });
      break;
    }
    case 'delete': {
      const ok = await ctx.confirm({ title: `Protokoll „${a?.titel || current}“ löschen?`, what: `Das Protokoll und seine Bilder/Videos werden aus dem Vault gelöscht (wiki/${current}.md).`, impact: (running.has(current) ? 'Der Ablauf ist noch nicht abgeschlossen; beim Fortsetzen würde das Protokoll neu angelegt. ' : '') + 'Das lässt sich nur über ein Vault-Backup rückgängig machen.' });
      if (!ok) return;
      try { await DeleteWikiArticle(current); ctx.addAction('Protokoll gelöscht: ' + (a?.titel || current), 'success'); current = null; await refresh(); }
      catch (err) { ctx.toast(String(err)); }
      break;
    }
  }
}
