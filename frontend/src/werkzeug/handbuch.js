// Handbuch (#94): Die Kapitel stehen weiterhin als statisches HTML im
// Hilfe-Tab (index.html, .help-section). Dieses Modul liest sie beim ersten
// Öffnen aus und stellt sie im Stil des Wikis dar: Kategorien in der
// Seitenleiste, Suche, Karten- oder Listenansicht, Kapitel als Artikel.
import './werkzeug.css';
import { getContext } from './platform.adminkit.js';
import { $, $$, esc, ic } from './ui.js';
import { viewToggleHTML, getView, setView } from './viewmode.js';

// Kategorie je Kapitel-ID; unbekannte landen unter „Weiteres“.
const CATS = [
  ['Einstieg', ['quickstart', 'farben', 'dashboard', 'tastatur', 'feedback']],
  ['System & Netzwerk', ['system', 'autostart', 'dienste', 'ereignisse', 'prozesse', 'netzwerk', 'usb', 'benutzer', 'profile']],
  ['Software & Werkzeuge', ['software', 'pakete', 'browser', 'werkzeug', 'dokumente']],
  ['Sicherheit & KI', ['vt', 'ki', 'ollama']],
  ['Daten & Export', ['export', 'vault']],
];
const ICON = { 'Einstieg': 'bookopen', 'System & Netzwerk': 'monitor', 'Software & Werkzeuge': 'wrench', 'Sicherheit & KI': 'shield', 'Daten & Export': 'folder', 'Weiteres': 'book' };

let ctx = null, root = null, chapters = [], cat = '', query = '';

const catOf = id => (CATS.find(c => c[1].includes(id)) || ['Weiteres'])[0];
const slugify = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Kapitel aus dem statischen HTML lesen
function parse(src) {
  return $$('.help-section', src).map((sec, n) => {
    const h = $('h3', sec);
    const title = (h?.textContent || 'Kapitel ' + (n + 1)).trim();
    const id = (sec.id || '').replace(/^help-/, '') || slugify(title.split(/[–&]/)[0]);
    const body = sec.cloneNode(true);
    body.querySelector('h3')?.remove();
    // Prose-Stil statt der alten Hilfe-Tabellen; Tabellen scrollbar einpacken
    $$('table', body).forEach(t => { t.classList.remove('help-table'); const w = document.createElement('div'); w.className = 'table'; t.replaceWith(w); w.appendChild(t); });
    // Zwischenüberschriften als h3, damit sie ins Inhaltsverzeichnis kommen
    $$('h4', body).forEach((h4, i) => { const x = document.createElement('h3'); x.innerHTML = h4.innerHTML; x.id = 'hb-' + id + '-' + i; h4.replaceWith(x); });
    // Text mit Trennern zwischen Zellen/Listenpunkten (sonst „KürzelAktion…“)
    const parts = el => $$('p, li, th, td', el).filter(x => !x.querySelector('p, li')).map(x => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const text = parts(body).join(' · ') || body.textContent.replace(/\s+/g, ' ').trim();
    const firstEl = $('p, li', body);
    const first = firstEl ? firstEl.textContent.replace(/\s+/g, ' ').trim() : $$('td', body).map(x => x.textContent.trim()).join(' · ') || text;
    return { id, title, cat: catOf(id), html: body.innerHTML, text, excerpt: first.length > 170 ? first.slice(0, 167) + '…' : first };
  });
}

export async function initHandbuch(container, deps) {
  root = container;
  const src = container.querySelector('.help-content');
  // Nach Bereich ordnen (stabil), damit „vor/zurück“ im Bereich bleibt
  const rank = c => { const i = CATS.findIndex(x => x[0] === c.cat); return i < 0 ? CATS.length : i; };
  chapters = parse(src || container).map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
  ctx = await getContext(deps);
  root.innerHTML = '';
  root.className = 'wz werkzeug-root';
  root.addEventListener('click', onClick);
  showList();
}

function cats() {
  const order = CATS.map(c => c[0]).concat('Weiteres');
  return order.map(c => [c, chapters.filter(x => x.cat === c).length]).filter(c => c[1]);
}

function layout(main) {
  root.innerHTML = `<div class="wz-layout">
    <aside class="wz-side">
      <nav><button type="button" class="wz-tab" data-hcat="" aria-selected="${!cat}">${ic('grid')}<span>Alle Kapitel</span><em>${chapters.length}</em></button>
      <div class="wz-g">Bereiche</div>
      ${cats().map(([c, n]) => `<button type="button" class="wz-tab" data-hcat="${esc(c)}" aria-selected="${cat === c}">${ic(ICON[c] || 'book')}<span>${esc(c)}</span><em>${n}</em></button>`).join('')}</nav>
      <p class="note" style="margin-top:14px">Eigenes Team-Wissen gehört ins Wiki – das Handbuch beschreibt AdminKit selbst.</p>
    </aside>
    <section class="wz-pane" id="hbMain">${main}</section></div>`;
}

function filtered() {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return chapters.filter(c => (!cat || c.cat === cat) && words.every(w => (c.title + ' ' + c.text).toLowerCase().includes(w)));
}

function showList() {
  layout(`<div class="lk-head"><div><h3>${cat ? esc(cat) : 'Handbuch'}</h3><p class="muted">${cat ? 'Kapitel in diesem Bereich.' : 'Alle Bereiche, Tabs und Funktionen von AdminKit erklärt.'}</p></div>
      <div class="row"><input type="search" class="input" id="hbQ" placeholder="Handbuch durchsuchen" value="${esc(query)}" autocomplete="off">${viewToggleHTML(getView(ctx, 'handbuch'))}</div></div>
    <div id="hbList"></div>`);
  $('#hbQ', root).addEventListener('input', e => { query = e.target.value; drawList(); });
  drawList();
}

function drawList() {
  const L = filtered();
  const asList = getView(ctx, 'handbuch') === 'list';
  const el = $('#hbList', root);
  if (!L.length) { el.innerHTML = `<div class="panel empty">${ic('bookopen')}<p>Kein Kapitel enthält „${esc(query)}“.</p></div>`; return; }
  el.innerHTML = asList
    ? `<div class="art-list no-meta">${L.map(c => `<a class="art-row" href="#" data-hb="${esc(c.id)}"><span class="art-row-t">${esc(c.title)}</span><span class="art-row-x">${esc(c.excerpt)}</span><span class="cat">${esc(c.cat)}</span></a>`).join('')}</div>`
    : `<div class="art-grid">${L.map(c => `<a class="art-card" href="#" data-hb="${esc(c.id)}"><span class="cat">${esc(c.cat)}</span><h2>${esc(c.title)}</h2><p>${esc(c.excerpt)}</p></a>`).join('')}</div>`;
}

function showChapter(id) {
  const i = chapters.findIndex(c => c.id === id);
  if (i < 0) return;
  const c = chapters[i], prev = chapters[i - 1], next = chapters[i + 1];
  const tmp = document.createElement('div'); tmp.innerHTML = c.html;
  const heads = $$('h3[id]', tmp);
  layout(`<div class="crumbs"><a href="#" data-hcat="">Handbuch</a><span>/</span><a href="#" data-hcat="${esc(c.cat)}">${esc(c.cat)}</a></div>
    <div class="article"><article>
      <h1>${esc(c.title)}</h1>
      <div class="prose hb-prose">${c.html}</div>
      <div class="hb-nav">${prev ? `<button class="btn" type="button" data-hb="${esc(prev.id)}">← ${esc(prev.title)}</button>` : '<span></span>'}${next ? `<button class="btn" type="button" data-hb="${esc(next.id)}">${esc(next.title)} →</button>` : ''}</div>
    </article>
    ${heads.length > 1 ? `<nav class="toc" aria-label="Inhalt"><strong>Auf dieser Seite</strong>${heads.map(h => `<button type="button" data-scroll="${h.id}">${esc(h.textContent)}</button>`).join('')}</nav>` : '<div></div>'}
    </div>`);
  cat = c.cat;
  // Seitenleiste zeigt den Bereich des Kapitels
  $$('[data-hcat]', root).forEach(b => b.matches('.wz-tab') && b.setAttribute('aria-selected', b.dataset.hcat === cat));
  $('#hbMain', root).scrollTop = 0;
}

function onClick(e) {
  const t = e.target;
  const v = t.closest('[data-view]'); if (v) { setView(ctx, 'handbuch', v.dataset.view, root); drawList(); return; }
  const hb = t.closest('[data-hb]'); if (hb) { e.preventDefault(); showChapter(hb.dataset.hb); return; }
  const c = t.closest('[data-hcat]'); if (c) { e.preventDefault(); cat = c.dataset.hcat; showList(); return; }
  const sc = t.closest('[data-scroll]'); if (sc) { $('#' + CSS.escape(sc.dataset.scroll), root)?.scrollIntoView({ behavior: 'smooth' }); return; }
  // Alte Verweise im Text (#help-xyz) öffnen das passende Kapitel
  const a = t.closest('a[href^="#help-"]'); if (a) { e.preventDefault(); showChapter(a.getAttribute('href').slice(6)); }
}

// Für Sprünge aus anderen Tabs
export function openChapter(id) { if (root) showChapter(id); }
