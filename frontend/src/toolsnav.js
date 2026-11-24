/**
 * Tools-Tab im Werkzeugkasten-Layout (#94): Seitenleiste mit allen Gruppen,
 * rechts nur die gewählte Gruppe. Die Gruppen stehen weiter als HTML im
 * Tools-Tab (data-tg-* Attribute), damit die bestehenden IDs/Handler bleiben.
 */
import './werkzeug/werkzeug.css'; // wz-layout/wz-side/wz-tab auch ohne geladenen Werkzeugkasten

var CATS = ['Schnellhilfe', 'System', 'Analyse'];
var current = null;
var filter = '';
var store = null; // Werkzeug-Zustand aus dem Vault (optional)
var shownListeners = [];

/** Rückruf, wenn eine Gruppe angezeigt wird (z. B. Module erst dann laden). */
export function onToolsGroupShown(fn) { shownListeners.push(fn); if (current) fn(current); }

function isMac() { return /Mac/.test(navigator.platform || '') || /Mac OS/.test(navigator.userAgent || ''); }

function groups() {
  var plat = isMac() ? 'darwin' : 'windows';
  return Array.prototype.slice.call(document.querySelectorAll('#tools-pane [data-tg]')).filter(function (g) {
    return !g.dataset.tgPlatform || g.dataset.tgPlatform === plat;
  });
}

function matches(g) {
  var words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  var hay = (g.dataset.tgTitle + ' ' + g.dataset.tgCat + ' ' + g.textContent).toLowerCase();
  return words.every(function (w) { return hay.indexOf(w) >= 0; });
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function renderNav() {
  var nav = document.getElementById('tools-nav');
  if (!nav) return;
  var list = groups().filter(matches);
  var cats = CATS.concat(list.map(function (g) { return g.dataset.tgCat; }).filter(function (c, i, a) { return CATS.indexOf(c) < 0 && a.indexOf(c) === i; }));
  nav.innerHTML = cats.map(function (c) {
    var items = list.filter(function (g) { return g.dataset.tgCat === c; });
    if (!items.length) return '';
    return '<div class="wz-g">' + esc(c) + '</div>' + items.map(function (g) {
      return '<button type="button" class="wz-tab" data-tools-group="' + esc(g.dataset.tg) + '" aria-selected="' + (g.dataset.tg === current) + '">' +
        '<span class="tools-nav-ic">' + esc(g.dataset.tgIcon || '•') + '</span><span>' + esc(g.dataset.tgTitle) + '</span></button>';
    }).join('');
  }).join('') || '<p class="tools-nav-empty">Kein Tool gefunden.</p>';
}

/** Zeigt eine Gruppe im Tools-Tab (wechselt den Tab nicht). */
export function showToolsGroup(id, remember) {
  var all = groups();
  var g = all.filter(function (x) { return x.dataset.tg === id; })[0] || all[0];
  if (!g) return;
  current = g.dataset.tg;
  document.querySelectorAll('#tools-pane [data-tg]').forEach(function (x) { x.classList.toggle('tools-group-off', x !== g); });
  renderNav();
  var pane = document.getElementById('tools-pane');
  if (pane) pane.scrollTop = 0;
  if (remember !== false && store) store.set('toolsGroup', current);
  shownListeners.forEach(function (fn) { try { fn(current); } catch (e) { console.warn(e); } });
}

export function initToolsNav() {
  // Beschreibung unter den Gruppentitel
  document.querySelectorAll('#tools-pane [data-tg]').forEach(function (g) {
    var t = g.querySelector('.tools-group-title');
    if (t && g.dataset.tgDesc && !g.querySelector('.tools-group-desc')) {
      var p = document.createElement('p');
      p.className = 'tools-group-desc';
      p.textContent = g.dataset.tgDesc;
      t.after(p);
    }
  });
  document.getElementById('tools-nav')?.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tools-group]');
    if (b) showToolsGroup(b.dataset.toolsGroup);
  });
  document.getElementById('tools-search')?.addEventListener('input', function (e) {
    filter = e.target.value;
    var hit = groups().filter(matches);
    // Aktuelle Gruppe passt nicht mehr → erste Fundstelle zeigen
    if (hit.length && !hit.some(function (g) { return g.dataset.tg === current; })) showToolsGroup(hit[0].dataset.tg, false);
    else renderNav();
  });
  showToolsGroup('quick', false);
}

/** Zuletzt gewählte Gruppe aus dem Vault wiederherstellen. */
export function attachToolsState(state) {
  store = state;
  var v = state && state.get('toolsGroup', null);
  if (v) showToolsGroup(v, false);
}
