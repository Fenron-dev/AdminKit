/**
 * AdminKit – Paket-Favoriten, Tags & Profile (#87).
 * Daten: vault/packages/favorites.yaml (über Go). Ein Favorit ist ein PROGRAMM
 * mit Paket-ID je Plattform (winget, brew, brew_cask).
 */
import {
  GetFavorites, SaveFavorites, ResolveProfile, ImportFavorites, ExportFavorites, GetInstalledPackages,
} from '../wailsjs/go/main/App';
import { installPackages, toggleInfo, getInstalledPackages, ensureStatus, isPackageBusy } from './packages.js';

var deps = null;
var view = null;          // FavoritesView aus Go
var loaded = false;
var filterTag = '';
var filterText = '';
var editing = null;       // Index des bearbeiteten Favoriten (-1 = neu)
var editingProfile = null;
var selectedFav = new Set();
var installedIDs = null;  // Set der installierten IDs (klein geschrieben)

function $(id) { return document.getElementById(id); }
function esc(s) { return deps.escapeHtml(s == null ? '' : String(s)); }
function favs() { return (view && view.data && view.data.favorites) || []; }
function profiles() { return (view && view.data && view.data.profiles) || []; }
function mgr() { return (view && view.manager) || (deps.getPlatform() === 'darwin' ? 'brew' : 'winget'); }

// Paket-ID + Quelle für die aktuelle Plattform
function idFor(f) {
  if (mgr() === 'winget') return f.winget ? { id: f.winget, source: 'winget' } : null;
  if (mgr() === 'brew') {
    if (f.brew_cask) return { id: f.brew_cask, source: 'brew-cask' };
    if (f.brew) return { id: f.brew, source: 'brew' };
  }
  return null;
}
function asPackage(f) {
  var r = idFor(f);
  return r ? { id: r.id, name: f.name, source: r.source, version: '' } : null;
}
function isInstalled(f) {
  var r = idFor(f);
  return !!(r && installedIDs && installedIDs.has(r.id.toLowerCase()));
}

export function initFavorites(d) {
  deps = d;
  deps.onFavoritesShown = function () { if (!loaded) load(); };
  deps.renderFavButton = favButton;
  deps.addFavoriteFromPackage = addFromPackage;
  var root = $('pkg-favorites');
  root?.addEventListener('click', onClick);
  root?.addEventListener('input', onInput);
  root?.addEventListener('change', onChange);
  root?.addEventListener('submit', function (e) { e.preventDefault(); });
}

async function load() {
  loaded = true;
  var root = $('pkg-favorites');
  try {
    view = await GetFavorites();
    if (view.seeded) deps.addAction('Favoriten-Startbestand im Vault angelegt (packages/favorites.yaml)', 'info');
  } catch (e) {
    root.innerHTML = '<div class="pkg-hint warn">Favoriten konnten nicht geladen werden: ' + esc(e) + '</div>';
    loaded = false;
    return;
  }
  render();
  refreshInstalled();
}

// Installationsstatus (offline über den Paketmanager)
async function refreshInstalled() {
  await ensureStatus();
  var list = getInstalledPackages();
  if (!list || !list.length) {
    try { list = (await GetInstalledPackages()) || []; } catch (_) { list = []; }
  }
  installedIDs = new Set(list.map(function (p) { return (p.id || '').toLowerCase(); }));
  render();
}

async function save(msg) {
  try {
    await SaveFavorites(view.data);
    if (msg) deps.addAction(msg, 'success');
    var fresh = await GetFavorites();
    view = fresh;
    return true;
  } catch (e) {
    deps.showToast('Speichern fehlgeschlagen: ' + e);
    return false;
  }
}

// ─── Darstellung ─────────────────────────────────────────────────────────────

function allTags() {
  var seen = {};
  favs().forEach(function (f) { (f.tags || []).forEach(function (t) { seen[t] = (seen[t] || 0) + 1; }); });
  return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'de'); });
}

function visibleFavs() {
  var q = filterText.toLowerCase();
  return favs().map(function (f, i) { return { f: f, i: i }; }).filter(function (x) {
    if (filterTag && !(x.f.tags || []).includes(filterTag)) return false;
    if (!q) return true;
    var note = x.f.notiz || (view.default_notes || {})[x.f.name] || '';
    return (x.f.name + ' ' + (x.f.winget || '') + ' ' + (x.f.brew || '') + ' ' + (x.f.brew_cask || '') + ' ' + note + ' ' + (x.f.tags || []).join(' '))
      .toLowerCase().includes(q);
  });
}

function render() {
  var root = $('pkg-favorites');
  if (!root || !view) return;
  var tags = allTags();
  var html = '<div class="pkg-toolbar">' +
    '<input type="search" class="fav-search" id="fav-search" placeholder="Favoriten durchsuchen (auch Notizen)…" value="' + esc(filterText) + '">' +
    '<button class="btn btn-secondary btn-sm" data-fav="new">＋ Favorit</button>' +
    '<button class="btn btn-secondary btn-sm" data-fav="import" title="Ideler-Portal-JSON, winget-Importdatei oder Brewfile">⬇ Importieren</button>' +
    '<button class="btn btn-secondary btn-sm" data-fav="export-winget" title="Für „winget import“">⬆ winget-Datei</button>' +
    '<button class="btn btn-secondary btn-sm" data-fav="export-brewfile" title="Für „brew bundle“">⬆ Brewfile</button>' +
    '</div>';
  html += '<div class="pkg-tags fav-tagbar"><span class="pkg-tag' + (filterTag ? '' : ' active') + '" data-fav-tag="">Alle</span>' +
    tags.map(function (t) { return '<span class="pkg-tag' + (filterTag === t ? ' active' : '') + '" data-fav-tag="' + esc(t) + '">' + esc(t) + '</span>'; }).join('') + '</div>';

  if (editing === -1) html += editorHTML({ name: '', tags: filterTag ? [filterTag] : [] }, -1);

  var rows = visibleFavs();
  if (!rows.length) {
    html += '<div class="info-placeholder">Keine Favoriten' + (filterTag || filterText ? ' für diesen Filter' : '') + '.</div>';
  } else {
    html += '<table class="data-table pkg-table"><thead><tr><th class="cb-col"></th><th>Programm</th><th>Tags</th><th></th></tr></thead><tbody>' +
      rows.map(function (x) { return rowHTML(x.f, x.i); }).join('') + '</tbody></table>';
  }
  var installable = Array.from(selectedFav).filter(function (i) { return favs()[i] && idFor(favs()[i]); }).length;
  html += '<div class="pkg-toolbar" style="margin-top:8px">' +
    '<button class="btn btn-primary btn-sm' + (installable ? '' : ' hidden') + '" data-fav="install-selected">⬇ Ausgewählte installieren (' + installable + ')</button></div>';

  html += profilesHTML();
  root.innerHTML = html;
  var s = $('fav-search');
  if (s && document.activeElement !== s && filterText) { /* Fokus beim Tippen bleibt über onInput erhalten */ }
}

function rowHTML(f, i) {
  if (editing === i) return '<tr><td colspan="4">' + editorHTML(f, i) + '</td></tr>';
  var pkg = idFor(f);
  var note = f.notiz || (view.default_notes || {})[f.name] || '';
  var inst = isInstalled(f);
  var ids = [];
  if (f.winget) ids.push('winget: ' + f.winget);
  if (f.brew_cask) ids.push('Cask: ' + f.brew_cask);
  if (f.brew) ids.push('brew: ' + f.brew);
  return '<tr' + (pkg ? '' : ' class="fav-unavailable"') + '>' +
    '<td class="cb-col"><input type="checkbox" data-fav-sel="' + i + '"' + (selectedFav.has(i) ? ' checked' : '') + (pkg && !inst ? '' : ' disabled') + '></td>' +
    '<td><div class="pkg-name">' + esc(f.name) + (inst ? ' <span class="pkg-tag pkg-ok-tag">✓ installiert</span>' : '') +
      (pkg ? '' : ' <span class="pkg-tag">nicht für diese Plattform</span>') + '</div>' +
      (note ? '<div class="pkg-note">' + (f.notiz ? '✎ ' : '') + esc(note) + '</div>' : '') +
      '<div class="pkg-id">' + esc(ids.join(' · ')) + '</div>' +
      '<div class="pkg-info hidden" id="fav-info-' + i + '"></div></td>' +
    '<td>' + (f.tags || []).map(function (t) { return '<span class="pkg-tag">' + esc(t) + '</span>'; }).join('') + '</td>' +
    '<td class="pkg-actions">' +
      (pkg ? '<button class="btn btn-secondary btn-xs" data-fav="info" data-i="' + i + '">ℹ Infos</button>' : '') +
      (pkg && !inst ? '<button class="btn btn-primary btn-xs" data-fav="install" data-i="' + i + '">Installieren</button>' : '') +
      '<button class="btn btn-secondary btn-xs" data-fav="edit" data-i="' + i + '" title="Notiz & Tags bearbeiten">✎</button>' +
      '<button class="btn btn-danger btn-xs" data-fav="delete" data-i="' + i + '" title="Favorit entfernen">🗑</button>' +
    '</td></tr>';
}

function editorHTML(f, i) {
  var def = (view.default_notes || {})[f.name] || '';
  return '<form class="fav-editor" data-fav-editor="' + i + '">' +
    '<div class="fav-grid">' +
      '<label>Name<input name="name" value="' + esc(f.name) + '" required></label>' +
      '<label>Tags (mit Komma)<input name="tags" value="' + esc((f.tags || []).join(', ')) + '"></label>' +
      '<label>winget-ID<input name="winget" value="' + esc(f.winget || '') + '" placeholder="z. B. Google.Chrome"></label>' +
      '<label>Mac-App (Cask)<input name="brew_cask" value="' + esc(f.brew_cask || '') + '" placeholder="z. B. google-chrome"></label>' +
      '<label>Homebrew-Formel<input name="brew" value="' + esc(f.brew || '') + '" placeholder="z. B. smartmontools"></label>' +
    '</div>' +
    '<label class="fav-notelabel">Eure Notiz' + (def ? ' <span class="settings-hint">(leer = Vorgabe: ' + esc(def.slice(0, 90)) + (def.length > 90 ? '…' : '') + ')</span>' : '') +
      '<textarea name="notiz" rows="3" placeholder="Wofür, für wen, worauf achten?">' + esc(f.notiz || '') + '</textarea></label>' +
    '<div class="pkg-toolbar">' +
      '<button class="btn btn-primary btn-sm" data-fav="save-edit" data-i="' + i + '">Speichern</button>' +
      '<button class="btn btn-secondary btn-sm" data-fav="cancel-edit">Abbrechen</button>' +
      (f.notiz && def ? '<button class="btn btn-secondary btn-sm" data-fav="reset-note" data-i="' + i + '">Vorgabe wiederherstellen</button>' : '') +
    '</div></form>';
}

function profilesHTML() {
  var h = '<div class="fav-profiles"><h3 class="fav-h3">Profile</h3>' +
    '<p class="settings-hint">Ein Profil installiert mehrere Favoriten nacheinander. Vorher kommt eine Vorschau; fehlgeschlagene Pakete brechen nicht ab.</p>';
  if (editingProfile === -1) h += profileEditorHTML({ name: '', items: [], tags: [] }, -1);
  h += profiles().map(function (p, i) {
    if (editingProfile === i) return profileEditorHTML(p, i);
    var parts = [];
    if ((p.items || []).length) parts.push(p.items.length + ' Programme');
    if ((p.tags || []).length) parts.push('Tags: ' + p.tags.join(', '));
    return '<div class="fav-profile"><div><div class="pkg-name">' + esc(p.name) + '</div><div class="pkg-note">' + esc(parts.join(' · ')) + '</div></div>' +
      '<div class="pkg-actions">' +
        '<button class="btn btn-primary btn-xs" data-fav="run-profile" data-i="' + i + '">Vorschau & installieren</button>' +
        '<button class="btn btn-secondary btn-xs" data-fav="edit-profile" data-i="' + i + '">✎</button>' +
        '<button class="btn btn-danger btn-xs" data-fav="delete-profile" data-i="' + i + '">🗑</button>' +
      '</div></div>';
  }).join('');
  h += '<button class="btn btn-secondary btn-sm" data-fav="new-profile" style="margin-top:8px">＋ Profil</button></div>';
  return h;
}

function profileEditorHTML(p, i) {
  return '<form class="fav-editor" data-profile-editor="' + i + '">' +
    '<div class="fav-grid">' +
      '<label>Name<input name="name" value="' + esc(p.name) + '" required></label>' +
      '<label>Alle Favoriten mit diesen Tags<input name="tags" value="' + esc((p.tags || []).join(', ')) + '" placeholder="z. B. Diagnose, Technik"></label>' +
    '</div>' +
    '<div class="settings-hint" style="margin:6px 0">Zusätzlich fest ausgewählt:</div>' +
    '<div class="fav-pick">' + favs().map(function (f) {
      return '<label><input type="checkbox" name="item" value="' + esc(f.name) + '"' + ((p.items || []).includes(f.name) ? ' checked' : '') + '> ' + esc(f.name) + '</label>';
    }).join('') + '</div>' +
    '<div class="pkg-toolbar"><button class="btn btn-primary btn-sm" data-fav="save-profile" data-i="' + i + '">Speichern</button>' +
    '<button class="btn btn-secondary btn-sm" data-fav="cancel-profile">Abbrechen</button></div></form>';
}

// ☆ in den Suchergebnissen
function favButton(p, i) {
  var exists = favs().some(function (f) {
    var r = idFor(f);
    return r && r.id.toLowerCase() === (p.id || '').toLowerCase();
  });
  return '<button class="btn btn-secondary btn-xs" data-pkg-action="fav" data-list="search" data-idx="' + i + '" title="' +
    (exists ? 'Bereits Favorit' : 'Zu Favoriten hinzufügen') + '"' + (exists ? ' disabled data-always-disabled="1"' : '') + '>' + (exists ? '★' : '☆') + '</button>';
}

async function addFromPackage(p, btn) {
  if (!loaded || !view) { await load(); }
  var f = { name: p.name || p.id, tags: [] };
  if (p.source === 'brew-cask') f.brew_cask = p.id;
  else if (p.source === 'brew') f.brew = p.id;
  else f.winget = p.id;
  var used = new Set(favs().map(function (x) { return x.name; }));
  var base = f.name, n = 2;
  while (used.has(f.name)) f.name = base + ' (' + (n++) + ')';
  view.data.favorites.push(f);
  if (await save('Favorit hinzugefügt: ' + f.name)) {
    if (btn) { btn.textContent = '★'; btn.disabled = true; }
    render();
  }
}

// ─── Ereignisse ──────────────────────────────────────────────────────────────

function onInput(e) {
  if (e.target.id === 'fav-search') {
    filterText = e.target.value;
    var pos = e.target.selectionStart;
    render();
    var s = $('fav-search');
    if (s) { s.focus(); s.setSelectionRange(pos, pos); }
  }
}

function onChange(e) {
  var cb = e.target.closest('[data-fav-sel]');
  if (!cb) return;
  var i = parseInt(cb.dataset.favSel, 10);
  if (cb.checked) selectedFav.add(i); else selectedFav.delete(i);
  render();
}

function splitTags(s) {
  return String(s || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
}

async function onClick(e) {
  var tag = e.target.closest('[data-fav-tag]');
  if (tag) { filterTag = tag.dataset.favTag; render(); return; }
  var btn = e.target.closest('[data-fav]');
  if (!btn) return;
  e.preventDefault();
  var i = parseInt(btn.dataset.i, 10);
  var f = favs()[i];
  switch (btn.dataset.fav) {
    case 'new': editing = -1; render(); break;
    case 'edit': editing = i; render(); break;
    case 'cancel-edit': editing = null; render(); break;
    case 'save-edit': await saveEditor(btn.closest('form'), i); break;
    case 'reset-note':
      f.notiz = '';
      editing = null;
      if (await save('Notiz für ' + f.name + ' auf Vorgabe zurückgesetzt')) render();
      break;
    case 'delete': {
      var ok = await deps.showConfirm({
        title: 'Favorit „' + f.name + '“ entfernen?',
        what: 'Der Eintrag wird aus vault/packages/favorites.yaml gelöscht – inklusive eurer Notiz. Das Programm selbst bleibt installiert.',
        impact: 'Profile, die den Favoriten namentlich enthalten, installieren ihn danach nicht mehr.',
      });
      if (!ok) return;
      view.data.favorites.splice(i, 1);
      selectedFav.clear();
      if (await save('Favorit entfernt: ' + f.name)) render();
      break;
    }
    case 'info': toggleInfo(asPackage(f), $('fav-info-' + i), []); break;
    case 'install': if (!isPackageBusy()) installPackages([asPackage(f)]).then(refreshInstalled); break;
    case 'install-selected': {
      var list = Array.from(selectedFav).map(function (k) { return favs()[k]; }).filter(function (x) { return x && idFor(x); }).map(asPackage);
      if (list.length) {
        var res = await installPackages(list, list.length + ' Favoriten installieren?');
        if (res) { selectedFav.clear(); refreshInstalled(); }
      }
      break;
    }
    case 'import': {
      try {
        var r = await ImportFavorites();
        if (!r) return;
        deps.addAction('Favoriten importiert (' + r.format + '): ' + r.added + ' neu, ' + r.updated + ' ergänzt', 'success');
        view = await GetFavorites();
        render();
      } catch (err) { deps.showToast('Import fehlgeschlagen: ' + err); }
      break;
    }
    case 'export-winget':
    case 'export-brewfile': {
      try {
        var path = await ExportFavorites(btn.dataset.fav === 'export-winget' ? 'winget' : 'brewfile');
        if (path) deps.addAction('Favoriten exportiert: ' + path, 'success', { filePath: path });
      } catch (err) { deps.showToast('Export fehlgeschlagen: ' + err); }
      break;
    }
    case 'new-profile': editingProfile = -1; render(); break;
    case 'edit-profile': editingProfile = i; render(); break;
    case 'cancel-profile': editingProfile = null; render(); break;
    case 'save-profile': await saveProfileEditor(btn.closest('form'), i); break;
    case 'delete-profile': {
      var p = profiles()[i];
      var yes = await deps.showConfirm({ title: 'Profil „' + p.name + '“ löschen?', what: 'Das Profil wird aus favorites.yaml entfernt. Die Favoriten bleiben erhalten.', impact: '' });
      if (!yes) return;
      view.data.profiles.splice(i, 1);
      if (await save('Profil gelöscht: ' + p.name)) render();
      break;
    }
    case 'run-profile': await runProfile(profiles()[i]); break;
  }
}

async function saveEditor(form, i) {
  var fd = new FormData(form);
  var f = {
    name: String(fd.get('name') || '').trim(),
    winget: String(fd.get('winget') || '').trim(),
    brew_cask: String(fd.get('brew_cask') || '').trim(),
    brew: String(fd.get('brew') || '').trim(),
    tags: splitTags(fd.get('tags')),
    notiz: String(fd.get('notiz') || '').trim(),
  };
  if (!f.name) { deps.showToast('Name fehlt'); return; }
  if (!f.winget && !f.brew && !f.brew_cask) { deps.showToast('Mindestens eine Paket-ID angeben'); return; }
  var backup = JSON.parse(JSON.stringify(view.data));
  if (i === -1) view.data.favorites.push(f);
  else {
    var old = view.data.favorites[i].name;
    view.data.favorites[i] = f;
    // Umbenennen auch in Profilen nachziehen
    if (old !== f.name) {
      view.data.profiles.forEach(function (p) { p.items = (p.items || []).map(function (n) { return n === old ? f.name : n; }); });
    }
  }
  if (await save(i === -1 ? 'Favorit angelegt: ' + f.name : 'Favorit gespeichert: ' + f.name)) {
    editing = null;
    render();
  } else {
    view.data = backup;
  }
}

async function saveProfileEditor(form, i) {
  var fd = new FormData(form);
  var p = { name: String(fd.get('name') || '').trim(), tags: splitTags(fd.get('tags')), items: fd.getAll('item').map(String) };
  if (!p.name) { deps.showToast('Name fehlt'); return; }
  if (!p.tags.length && !p.items.length) { deps.showToast('Programme auswählen oder Tags angeben'); return; }
  if (!view.data.profiles) view.data.profiles = [];
  if (i === -1) view.data.profiles.push(p); else view.data.profiles[i] = p;
  if (await save('Profil gespeichert: ' + p.name)) { editingProfile = null; render(); }
}

// Profil: Vorschau (schon installiert / wird installiert / nicht verfügbar), dann installieren
async function runProfile(p) {
  if (isPackageBusy()) { deps.showToast('Es läuft bereits ein Paketvorgang'); return; }
  if (!deps.onlineAllowed('packages')) { deps.showToast('Online-Funktionen für Pakete sind abgeschaltet'); return; }
  var items;
  try { items = (await ResolveProfile(p.name)) || []; }
  catch (e) { deps.showToast(String(e)); return; }
  if (installedIDs === null) await refreshInstalled();
  var already = [], todo = [], missing = [];
  items.forEach(function (f) {
    if (!idFor(f)) missing.push(f.name);
    else if (isInstalled(f)) already.push(f.name);
    else todo.push(asPackage(f));
  });
  if (!todo.length) {
    deps.showConfirm({
      title: 'Profil „' + p.name + '“',
      what: 'Nichts zu tun.' + (already.length ? '\n\nBereits installiert:\n• ' + already.join('\n• ') : '') +
        (missing.length ? '\n\nAuf dieser Plattform nicht verfügbar:\n• ' + missing.join('\n• ') : ''),
      impact: '',
    });
    return;
  }
  var preview = 'Profil „' + p.name + '“' +
    (already.length ? '\n\nBereits installiert (wird übersprungen):\n• ' + already.join('\n• ') : '') +
    (missing.length ? '\n\nAuf dieser Plattform nicht verfügbar:\n• ' + missing.join('\n• ') : '');
  var res = await installPackages(todo, 'Profil „' + p.name + '“ installieren?', preview);
  if (res) refreshInstalled();
}
