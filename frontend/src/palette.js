/**
 * Befehlspalette (Strg/Cmd + K) über die ganze App: Tabs, Aktionen, Werkzeuge,
 * Links, Wiki … Quellen melden sich über registerPaletteProvider() an.
 * Nach dem Vorbild der Palette im Ideler-Portal.
 */
var providers = [];
var overlay = null, input = null, listEl = null;
var items = [], shown = [], idx = 0;
var escFn = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

// provider: async () => [{ group, icon, title, sub, keys, run }]
export function registerPaletteProvider(fn) { providers.push(fn); }

export function initPalette() {
  overlay = document.createElement('div');
  overlay.className = 'palette-overlay hidden';
  overlay.innerHTML = '<div class="palette" role="dialog" aria-label="Befehlspalette">' +
    '<input class="palette-input" type="search" placeholder="Suchen: Werkzeug, Link, Aktion, Tab …" autocomplete="off" spellcheck="false">' +
    '<div class="palette-list" role="listbox"></div>' +
    '<div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> wählen</span><span><kbd>Enter</kbd> öffnen</span><span><kbd>Esc</kbd> schließen</span></div></div>';
  document.body.appendChild(overlay);
  input = overlay.querySelector('.palette-input');
  listEl = overlay.querySelector('.palette-list');
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
  input.addEventListener('input', update);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); runIdx(idx); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  listEl.addEventListener('click', function (e) {
    var it = e.target.closest('[data-pi]');
    if (it) runIdx(+it.dataset.pi);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (overlay.classList.contains('hidden')) open(); else close();
    }
  });
}

export async function open(q) {
  overlay.classList.remove('hidden');
  input.value = q || '';
  listEl.innerHTML = '<div class="palette-empty">Lädt…</div>';
  input.focus();
  var all = [];
  for (var i = 0; i < providers.length; i++) {
    try { all = all.concat((await providers[i]()) || []); } catch (e) { console.warn('Palette-Quelle', e); }
  }
  items = all.map(function (x) { x._k = (x.title + ' ' + (x.sub || '') + ' ' + (x.keys || '') + ' ' + x.group).toLowerCase(); return x; });
  update();
}

export function close() { overlay.classList.add('hidden'); }

function score(x, words) {
  var s = 0;
  for (var i = 0; i < words.length; i++) {
    var w = words[i], pos = x._k.indexOf(w);
    if (pos < 0) return -1;
    var t = x.title.toLowerCase();
    if (t.indexOf(w) === 0) s += 6; else if (t.indexOf(w) > 0) s += 3; else s += 1;
  }
  return s;
}

function update() {
  var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) shown = items.filter(function (x) { return x.pinned || x.group === 'Tabs'; }).slice(0, 40);
  else {
    shown = items.map(function (x) { return { x: x, s: score(x, words) }; }).filter(function (r) { return r.s >= 0; })
      .sort(function (a, b) { return b.s - a.s; }).slice(0, 40).map(function (r) { return r.x; });
  }
  idx = 0;
  render();
}

function render() {
  if (!shown.length) { listEl.innerHTML = '<div class="palette-empty">Nichts gefunden.</div>'; return; }
  var html = '', last = '';
  shown.forEach(function (x, i) {
    if (x.group !== last) { html += '<div class="palette-g">' + escFn(x.group) + '</div>'; last = x.group; }
    html += '<div class="palette-item' + (i === idx ? ' active' : '') + '" data-pi="' + i + '" role="option">' +
      '<span class="palette-ic">' + escFn(x.icon || '•') + '</span><span class="palette-t"><b>' + escFn(x.title) + '</b>' +
      (x.sub ? '<span>' + escFn(x.sub) + '</span>' : '') + '</span></div>';
  });
  listEl.innerHTML = html;
}

function move(d) {
  if (!shown.length) return;
  idx = (idx + d + shown.length) % shown.length;
  render();
  listEl.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
}

function runIdx(i) {
  var x = shown[i];
  if (!x) return;
  close();
  try { x.run(); } catch (e) { console.warn(e); }
}
