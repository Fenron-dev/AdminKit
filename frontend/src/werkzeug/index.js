// Werkzeugkasten: Registry (Gruppen, Reihenfolge, Suche) und Tab-Aufbau.
// Gleiche Gruppen und Reihenfolge wie im Ideler-Portal (UTIL_GROUPS).
import './werkzeug.css';
import { esc, ic } from './ui.js';
import { getContext } from './platform.adminkit.js';
import pw from './tools/pw.js';
import spell from './tools/spell.js';
import imei from './tools/imei.js';
import ae from './tools/ae.js';
import net from './tools/net.js';
import units from './tools/units.js';
import b64 from './tools/b64.js';

export const GROUPS = ['Passwörter & Telefon', 'Für Kunden', 'Reparatur & Laden', 'Netzwerk & Mail', 'Nachschlagen & Prüfen'];
export const TOOLS = [pw, spell, imei, ae, net, units, b64];

export function registerTool(t) { if (!TOOLS.some(x => x.id === t.id)) TOOLS.push(t); }

export function searchTools(q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return TOOLS.slice();
  return TOOLS.filter(t => { const hay = (t.name + ' ' + t.keys + ' ' + t.group).toLowerCase(); return words.every(w => hay.includes(w)); });
}

let ctx = null, root = null, current = null, cleanup = null, filter = '';

export async function initWerkzeugTab(container, deps) {
  root = container;
  ctx = await getContext(deps);
  current = ctx.state.get('lastTool', 'pw');
  root.classList.add('wz');
  root.innerHTML = `<div class="wz-layout">
      <aside class="wz-side"><input type="search" class="input wz-search" id="wzSearch" placeholder="Werkzeug suchen…" autocomplete="off"><nav id="wzNav"></nav></aside>
      <section class="wz-pane" id="wzPane"></section>
    </div>`;
  root.querySelector('#wzSearch').addEventListener('input', e => { filter = e.target.value; renderNav(); });
  root.querySelector('#wzNav').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) select(b.dataset.tool); });
  // Kopier-Knöpfe aller Werkzeuge (data-copy)
  root.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) ctx.copy(b.dataset.copy); });
  renderNav();
  select(current);
}

function renderNav() {
  const list = searchTools(filter);
  const nav = root.querySelector('#wzNav');
  nav.innerHTML = GROUPS.map(g => {
    const items = list.filter(t => t.group === g);
    if (!items.length) return '';
    return `<div class="wz-g">${esc(g)}</div>` + items.map(t => `<button type="button" class="wz-tab" data-tool="${t.id}" aria-selected="${t.id === current}">${ic(t.icon)}<span>${esc(t.name)}</span>${t.online ? '<em title="braucht Internet">🌐</em>' : ''}</button>`).join('');
  }).join('') || '<p class="muted" style="padding:8px">Kein Werkzeug gefunden.</p>';
}

export function select(id) {
  const t = TOOLS.find(x => x.id === id) || TOOLS[0];
  if (cleanup) { try { cleanup(); } catch (_) { /* ignorieren */ } cleanup = null; }
  current = t.id;
  ctx.state.set('lastTool', t.id);
  renderNav();
  const pane = root.querySelector('#wzPane');
  pane.innerHTML = '';
  const r = t.render(pane, ctx);
  if (typeof r === 'function') cleanup = r;
}

// Für Befehlspalette/Verknüpfungen aus anderen Tabs
export function openTool(id) { if (root) select(id); }
