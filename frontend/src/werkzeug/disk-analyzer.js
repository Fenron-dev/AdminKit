// Disk-Analyzer (#98): Startpunkt wählen, Fortschritt, Ordnerliste mit
// Drill-Down, Kachelansicht (Treemap), größte Ordner/Dateien, Aktionen.
import './werkzeug.css';
import { GetDiskScanRoots, PickDiskScanFolder, StartDiskScan, CancelDiskScan, GetDiskScanStatus, GetDiskNodeChildren, GetDiskTopFiles, GetDiskHotspots, DiskMoveToTrash, RevealFile } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { getContext } from './platform.adminkit.js';
import { $, esc, ic } from './ui.js';
import { drawTreemap, hitTest } from './treemap.js';

const CAT = {
  system: { label: 'System', color: '#64748B' },
  app: { label: 'Programme', color: '#3B82F6' },
  cache: { label: 'Cache / Temp', color: '#F59E0B' },
  user: { label: 'Benutzerdaten', color: '#22C55E' },
  other: { label: 'Sonstiges', color: '#A855F7' },
};
const catOf = c => CAT[c] || CAT.other;

export const fmtBytes = b => {
  if (!b || b < 1024) return (b || 0) + ' B';
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
  return b.toFixed(b >= 100 ? 0 : 1).replace('.', ',') + ' ' + u[i];
};
const fmtNum = n => Number(n || 0).toLocaleString('de-DE');
const isMac = /Mac/.test(navigator.platform || '');

let ctx = null, root = null, roots = [], dir = null, hideSystem = true, tab = 'hot';
let rects = [], hover = null, selected = null, resizeObs = null, running = false, scanRoot = '';

export async function initDiskAnalyzer(container, deps) {
  root = container;
  ctx = await getContext(deps);
  hideSystem = ctx.state.get('disk.hideSystem', true);
  root.classList.add('wz');
  root.innerHTML = `<div class="da">
    <div class="da-bar">
      <select class="input" id="daRoot" aria-label="Startpunkt"></select>
      <button class="btn primary" type="button" id="daGo">${ic('search')}Analysieren</button>
      <button class="btn danger hidden" type="button" id="daStop">${ic('x')}Abbrechen</button>
      <label class="check da-sys"><input type="checkbox" id="daSys"${hideSystem ? ' checked' : ''}>Systembereiche ausblenden</label>
    </div>
    <div class="da-progress hidden" id="daProg"><div class="da-track"><span id="daFill"></span></div><span id="daProgText"></span></div>
    <div id="daBody"><div class="panel empty">${ic('gauge')}<p>Ordner oder Laufwerk wählen und „Analysieren“ klicken.<br>
      <span class="muted">Die Analyse liest nur Größen – es wird nichts verändert. ${isMac ? 'macOS fragt ggf. nach Zugriff auf Schreibtisch, Dokumente usw.; ohne Freigabe fehlen diese Ordner.' : 'Für das komplette Systemlaufwerk AdminKit als Administrator starten, sonst fehlen geschützte Ordner.'}</span></p></div></div>
  </div>`;
  $('#daGo', root).addEventListener('click', start);
  $('#daStop', root).addEventListener('click', () => CancelDiskScan());
  $('#daSys', root).addEventListener('change', e => { hideSystem = e.target.checked; ctx.state.set('disk.hideSystem', hideSystem); if (dir) openDir(dir.path); });
  $('#daRoot', root).addEventListener('change', async e => {
    if (e.target.value !== '__pick') return;
    const p = await PickDiskScanFolder().catch(() => '');
    if (p) { roots.push({ path: p, label: p }); fillRoots(p); } else fillRoots(roots[0]?.path);
  });
  root.addEventListener('click', onClick);
  EventsOn('diskscan:progress', showProgress);
  EventsOn('diskscan:done', onDone);
  roots = (await GetDiskScanRoots().catch(() => [])) || [];
  fillRoots(ctx.state.get('disk.root', roots[0]?.path));
  // Ergebnis eines früheren Laufs (seit App-Start) direkt zeigen
  const st = await GetDiskScanStatus().catch(() => null);
  if (st?.running) { setRunning(true); showProgress(st); } else if (st?.done) { $('#daProg', root).classList.remove('hidden'); showProgress(st, true); openDir(''); }
}

function fillRoots(sel) {
  const opt = r => `<option value="${esc(r.path)}"${r.path === sel ? ' selected' : ''}>${esc(r.label)}${r.total ? ` – ${fmtBytes(r.total - r.free)} von ${fmtBytes(r.total)} belegt` : ''}${r.label !== r.path ? ` (${esc(r.path)})` : ''}</option>`;
  $('#daRoot', root).innerHTML = roots.map(opt).join('') + '<option value="__pick">Anderen Ordner wählen…</option>';
}

async function start() {
  const p = $('#daRoot', root).value;
  if (!p || p === '__pick') return;
  ctx.state.set('disk.root', p);
  dir = null; selected = null;
  try {
    await StartDiskScan(p);
    setRunning(true);
    $('#daBody', root).innerHTML = `<div class="loading">Analysiere ${esc(p)} …</div>`;
  } catch (e) { ctx.toast(String(e)); }
}

function setRunning(on) {
  running = on;
  $('#daGo', root).classList.toggle('hidden', on);
  $('#daStop', root).classList.toggle('hidden', !on);
  $('#daRoot', root).disabled = on;
  $('#daProg', root).classList.remove('hidden');
}

function showProgress(st, finished) {
  if (st.root) scanRoot = st.root;
  const used = st.volume_total - st.volume_free;
  const pct = st.whole_volume && used > 0 ? Math.min(100, st.bytes / used * 100) : null;
  const fill = $('#daFill', root);
  fill.style.width = finished ? '100%' : pct != null ? pct.toFixed(1) + '%' : '';
  fill.classList.toggle('indet', !finished && pct == null);
  const secs = Math.round((st.elapsed_ms || 0) / 1000);
  $('#daProgText', root).textContent = `${fmtBytes(st.bytes)} · ${fmtNum(st.files)} Dateien · ${fmtNum(st.dirs)} Ordner · ${secs} s` +
    (st.errors ? ` · ${fmtNum(st.errors)} nicht lesbar` : '') + (st.canceled ? ' · abgebrochen' : '') +
    (finished && st.volume_total ? ` · Laufwerk: ${fmtBytes(st.volume_free)} frei von ${fmtBytes(st.volume_total)}` : '');
}

function onDone(st) {
  setRunning(false);
  showProgress(st, true);
  if (st.canceled) { $('#daBody', root).innerHTML = `<div class="panel empty">${ic('x')}<p>Analyse abgebrochen.</p></div>`; return; }
  ctx.addAction(`Speicher analysiert: ${st.root} – ${fmtBytes(st.bytes)} in ${fmtNum(st.files)} Dateien (im Bericht enthalten)`, 'success');
  openDir('');
}

async function openDir(path) {
  try { dir = await GetDiskNodeChildren(path, hideSystem); }
  catch (e) { ctx.toast(String(e)); return; }
  selected = null;
  renderBody();
}

function crumbs() {
  const parts = [];
  // Pfad relativ zur Wurzel des Scans in Etappen zerlegen
  const sep = dir.path.includes('\\') ? '\\' : '/';
  const rootPath = scanRoot;
  let rel = dir.path.startsWith(rootPath) ? dir.path.slice(rootPath.length) : '';
  rel = rel.split(sep).filter(Boolean);
  parts.push(`<a href="#" data-dir="">${esc(rootPath)}</a>`);
  let acc = rootPath;
  rel.forEach((seg, i) => {
    acc = acc.endsWith(sep) ? acc + seg : acc + sep + seg;
    parts.push(i === rel.length - 1 ? `<span>${esc(seg)}</span>` : `<a href="#" data-dir="${esc(acc)}">${esc(seg)}</a>`);
  });
  return parts.join('<span class="sep">/</span>');
}

function actions(it) {
  if (it.rest) return '';
  const reveal = `<button class="icon-btn" type="button" data-reveal="${esc(it.path)}" title="Im ${isMac ? 'Finder' : 'Explorer'} zeigen">${ic('folder')}</button>`;
  const trash = it.locked || it.category === 'system' ? `<span class="icon-btn da-lock" title="Geschützt – System- oder Hauptordner">${ic('lock')}</span>`
    : `<button class="icon-btn" type="button" data-trash="${esc(it.path)}" title="In den Papierkorb">${ic('trash')}</button>`;
  return reveal + trash;
}

function renderBody() {
  const items = dir.items || [];
  const max = items[0]?.size || 1;
  $('#daBody', root).innerHTML = `
    <div class="da-crumbs">${dir.parent ? `<button class="icon-btn" type="button" data-dir="${esc(dir.parent)}" title="Eine Ebene höher">${ic('arrowleft')}</button>` : ''}<span>${crumbs()}</span>
      <b>${fmtBytes(dir.size)}</b><span class="muted">${fmtNum(dir.files)} Dateien · ${fmtNum(dir.dirs)} Ordner</span></div>
    ${dir.unreadable ? '<p class="note">Dieser Ordner war nicht vollständig lesbar (fehlende Rechte).</p>' : ''}
    <div class="da-main">
      <div class="da-list" id="daList">${items.length ? items.map((it, i) => `
        <div class="da-row${it.is_dir ? ' dir' : ''}${it.rest ? ' rest' : ''}" data-i="${i}" ${it.is_dir ? `data-dir="${esc(it.path)}"` : ''} title="${esc(it.path || it.name)}">
          <span class="da-dot" style="background:${catOf(it.category).color}"></span>
          <span class="da-name">${ic(it.is_dir ? 'folder' : it.rest ? 'list' : 'clipboard')}<span>${esc(it.name)}</span></span>
          <span class="da-barw"><span class="da-barf" style="width:${Math.max(1, it.size / max * 100)}%;background:${catOf(it.category).color}"></span></span>
          <span class="da-size">${fmtBytes(it.size)}</span>
          <span class="da-pct">${it.pct >= 0.1 ? it.pct.toFixed(1).replace('.', ',') + ' %' : '<0,1 %'}</span>
          <span class="da-acts">${actions(it)}</span>
        </div>`).join('') : `<div class="panel empty"><p>${hideSystem ? 'Leer – oder nur Systembereiche (Filter oben).' : 'Leer.'}</p></div>`}</div>
      <div class="da-map"><canvas id="daCanvas"></canvas><div class="da-tip hidden" id="daTip"></div>
        <div class="da-legend">${Object.entries(CAT).map(([k, c]) => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join('')}</div></div>
    </div>
    <div class="da-tabs seg" role="tablist"><button type="button" data-tab="hot" aria-pressed="${tab === 'hot'}">Größte Ordner</button><button type="button" data-tab="files" aria-pressed="${tab === 'files'}">Größte Dateien</button></div>
    <div id="daTop"><div class="loading">Lade…</div></div>`;
  setupCanvas();
  renderTop();
}

function setupCanvas() {
  const cv = $('#daCanvas', root);
  if (!cv) return;
  const draw = () => {
    rects = drawTreemap(cv, (dir?.items || []).filter(it => it.size > 0), {
      colorOf: it => catOf(it.category).color,
      labelOf: it => [it.name, fmtBytes(it.size)],
      highlight: selected,
      textColor: '#fff',
    });
  };
  draw();
  resizeObs?.disconnect();
  resizeObs = new ResizeObserver(draw);
  resizeObs.observe(cv);
  const tip = $('#daTip', root);
  cv.onmousemove = e => {
    const r = cv.getBoundingClientRect(), it = hitTest(rects, e.clientX - r.left, e.clientY - r.top);
    if (it !== hover) { hover = it; }
    if (!it) { tip.classList.add('hidden'); cv.style.cursor = ''; return; }
    cv.style.cursor = it.is_dir ? 'pointer' : 'default';
    tip.innerHTML = `<b>${esc(it.name)}</b><br>${fmtBytes(it.size)} · ${it.pct.toFixed(1).replace('.', ',')} % · ${catOf(it.category).label}${it.is_dir ? '<br><span class="muted">Klick öffnet den Ordner</span>' : ''}`;
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 220) + 'px';
    tip.style.top = (e.clientY - r.top + 14) + 'px';
    tip.classList.remove('hidden');
  };
  cv.onmouseleave = () => { tip.classList.add('hidden'); hover = null; };
  cv.onclick = e => {
    const r = cv.getBoundingClientRect(), it = hitTest(rects, e.clientX - r.left, e.clientY - r.top);
    if (!it) return;
    if (it.is_dir) { openDir(it.path); return; }
    selected = it; draw();
    const i = dir.items.indexOf(it);
    const row = root.querySelector(`.da-row[data-i="${i}"]`);
    root.querySelectorAll('.da-row.sel').forEach(x => x.classList.remove('sel'));
    row?.classList.add('sel'); row?.scrollIntoView({ block: 'nearest' });
  };
}

async function renderTop() {
  const box = $('#daTop', root);
  try {
    if (tab === 'hot') {
      const hs = (await GetDiskHotspots(25)) || [];
      box.innerHTML = hs.length ? `<p class="note">Ordner, in denen sich der Speicher ballt – ohne Systembereiche. Gute Kandidaten zum Aufräumen sind meist Caches und alte Downloads.</p>
        <div class="da-table">${hs.map(h => tRow(h.path, h.size, h.category, true)).join('')}</div>` : '<p class="muted">Keine auffälligen Ordner.</p>';
    } else {
      const fs = (await GetDiskTopFiles(100, hideSystem)) || [];
      box.innerHTML = fs.length ? `<div class="da-table">${fs.map(f => tRow(f.path, f.size, f.category, false)).join('')}</div>` : '<p class="muted">Keine Dateien.</p>';
    }
  } catch (e) { box.innerHTML = `<p class="muted">${esc(e)}</p>`; }
}

function tRow(path, size, cat, isDir) {
  return `<div class="da-trow"${isDir ? ` data-dir="${esc(path)}"` : ''} title="${esc(path)}">
    <span class="da-dot" style="background:${catOf(cat).color}"></span><span class="da-tpath mono">${esc(path)}</span>
    <span class="da-tcat">${catOf(cat).label}</span><span class="da-size">${fmtBytes(size)}</span>
    <span class="da-acts">${actions({ path, category: cat, locked: cat === 'system' })}</span></div>`;
}

async function trash(path) {
  const it = (dir?.items || []).find(x => x.path === path);
  const name = path.split(/[\\/]/).pop();
  const cat = it?.category;
  const ok = await ctx.confirm({
    title: `„${name}“ in den Papierkorb verschieben?`,
    what: `${path}${it ? `\n${fmtBytes(it.size)}${it.is_dir ? ` · ${fmtNum(it.files)} Dateien` : ''}` : ''}`,
    impact: cat === 'app' ? 'Programmdaten: Die zugehörige Anwendung funktioniert danach evtl. nicht mehr. Programme besser regulär deinstallieren. Wiederherstellen ist über den Papierkorb möglich.'
      : cat === 'cache' ? 'Caches legen Programme bei Bedarf neu an. Wiederherstellen ist über den Papierkorb möglich – erst das Leeren des Papierkorbs gibt den Platz frei.'
        : 'Wiederherstellen ist über den Papierkorb möglich – erst das Leeren des Papierkorbs gibt den Platz frei.',
  });
  if (!ok) return;
  try {
    await DiskMoveToTrash(path);
    ctx.addAction(`In den Papierkorb verschoben: ${path}`, 'success');
    if (ctx.session) ctx.recordWork?.('Speicher aufgeräumt', `${name} in den Papierkorb verschoben (${it ? fmtBytes(it.size) : ''})`);
    openDir(dir?.path || '');
  } catch (e) { ctx.toast(String(e)); }
}

function onClick(e) {
  const t = e.target;
  const rv = t.closest('[data-reveal]'); if (rv) { e.stopPropagation(); RevealFile(rv.dataset.reveal).catch(err => ctx.toast(String(err))); return; }
  const tr = t.closest('[data-trash]'); if (tr) { e.stopPropagation(); trash(tr.dataset.trash); return; }
  const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; root.querySelectorAll('.da-tabs [data-tab]').forEach(b => b.setAttribute('aria-pressed', b === tb)); renderTop(); return; }
  const d = t.closest('[data-dir]'); if (d && !running) { e.preventDefault(); openDir(d.dataset.dir); root.querySelector('#daBody')?.scrollIntoView({ block: 'start' }); }
}
