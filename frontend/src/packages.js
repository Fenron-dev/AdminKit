/**
 * AdminKit – Paketverwaltung (winget / Homebrew) im Software-Tab.
 * Issues #84 (Updates), #85 (Suchen/Installieren/Pin), #86 (Infos), #87 (Favoriten).
 *
 * Regeln:
 *  - Online-Aktionen nur auf Klick, nie beim Start.
 *  - Jede Änderung zeigt vorher den GENAUEN Befehl im Bestätigungsdialog
 *    (der Befehl kommt aus Go: GetPackageCommand = dieselbe Funktion wie die Ausführung).
 *  - Paketnamen/Beschreibungen werden nur escaped als Text eingefügt.
 */
import {
  GetPackageManagerStatus, GetInstalledPackages, GetOutdatedPackages,
  SearchPackages, GetPackageCommand, InstallPackages, UpgradePackages,
  UninstallPackage, SetPackagePinned, CancelPackageOperation, GetPackageInfo,
} from '../wailsjs/go/main/App';
import { EventsOn, BrowserOpenURL } from '../wailsjs/runtime/runtime';

var deps = null;          // Helfer aus main.js (showConfirm, addAction, …)
var pkgStatus = null;     // Ergebnis von GetPackageManagerStatus
var outdated = [];        // letzte Update-Liste
var installed = [];       // Pakete laut Paketmanager
var searchResults = [];
var busy = false;
var selected = new Set(); // IDs in der Update-Liste

function $(id) { return document.getElementById(id); }
function esc(s) { return deps.escapeHtml(s == null ? '' : String(s)); }
function isMac() { return deps.getPlatform() === 'darwin'; }
function sourceLabel(src) {
  return { 'winget': 'winget', 'msstore': 'Store', 'brew': 'Formel', 'brew-cask': 'App (Cask)', 'mas': 'App Store' }[src] || (src || '–');
}

// Optionen aus der Config (Einstellungen → Paketverwaltung)
function pkgOptions(extra) {
  var p = (deps.getConfig() || {}).packages || {};
  return Object.assign({
    silent: p.silent !== false,
    scope: p.default_scope ?? 'machine',
    greedy: !!$('pkg-greedy')?.checked,
    cask: false,
  }, extra || {});
}

function refOf(p) {
  return { id: p.id, name: p.name || p.id, source: p.source || '', version: p.version || '', available: p.available || '' };
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (_) {
    try { await window.runtime?.ClipboardSetText?.(text); } catch (__) { /* ignorieren */ }
  }
  deps.showToast('Befehl kopiert');
}

// ─── Initialisierung ─────────────────────────────────────────────────────────

export function initPackages(d) {
  deps = d;
  initSubtabs();
  initOutputPanel();

  $('pkg-btn-check')?.addEventListener('click', checkUpdates);
  $('pkg-btn-upgrade-all')?.addEventListener('click', upgradeAll);
  $('pkg-btn-upgrade-selected')?.addEventListener('click', upgradeSelected);
  $('pkg-search-form')?.addEventListener('submit', function (e) { e.preventDefault(); runSearch(); });
  $('pkg-btn-load-installed')?.addEventListener('click', loadInstalled);
  $('btn-goto-pkg-updates')?.addEventListener('click', function () { deps.switchTab('software'); showView('updates'); });

  // Klicks in Tabellen (Delegation)
  ['pkg-updates-list', 'pkg-search-list', 'pkg-installed-list'].forEach(function (id) {
    $(id)?.addEventListener('click', onTableClick);
    $(id)?.addEventListener('change', onTableChange);
  });

  // Links in Info-Bereichen im Standardbrowser öffnen (nicht in der App)
  $('tab-software')?.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-open-url]');
    if (!a) return;
    e.preventDefault();
    openURL(a.dataset.openUrl);
  });

  EventsOn('packages:output', appendOutput);
  EventsOn('packages:progress', function (p) {
    var t = $('pkg-output-title');
    if (t && p) t.textContent = '⏳ ' + (p.total > 1 ? '(' + p.index + '/' + p.total + ') ' : '') + (p.name || p.id || 'alle Pakete');
  });

  if (!isMac()) $('pkg-greedy-wrap')?.classList.add('hidden');
}

// ─── Unterbereiche ───────────────────────────────────────────────────────────

var statusLoaded = false;

export function showView(view) {
  document.querySelectorAll('#software-subtabs .subtab-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.view === view);
  });
  document.querySelectorAll('#tab-software .sw-view').forEach(function (v) {
    v.classList.toggle('hidden', v.id !== 'sw-view-' + view);
  });
  $('pkg-status-wrap')?.classList.toggle('hidden', view === 'installed');
  if (view !== 'installed' && !statusLoaded) {
    statusLoaded = true;
    loadStatus();
  }
  if (view === 'favorites' && deps.onFavoritesShown) deps.onFavoritesShown();
}

function initSubtabs() {
  document.querySelectorAll('#software-subtabs .subtab-btn').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.view); });
  });
  // Seitenleiste: Paket-Bereiche umschalten; Programme/Extensions → „Installiert“
  var sidebar = document.querySelector('#tab-software .section-sidebar');
  sidebar?.addEventListener('click', function (e) {
    var link = e.target.closest('.sidebar-link');
    if (!link) return;
    if (link.dataset.swview) { showView(link.dataset.swview); return; }
    if (link.dataset.target) showView('installed');
  }, true);
}

async function loadStatus() {
  var bar = $('pkg-status-bar');
  if (!bar) return;
  bar.innerHTML = '<span class="pkg-status-item">⏳ Paketmanager wird geprüft…</span>';
  try {
    pkgStatus = await GetPackageManagerStatus();
  } catch (e) {
    pkgStatus = { available: false, hint: String(e) };
  }
  renderStatus();
}

function renderStatus() {
  var bar = $('pkg-status-bar');
  if (!bar || !pkgStatus) return;
  var st = pkgStatus;
  var online = deps.onlineAllowed('packages');
  var name = st.manager === 'brew' ? 'Homebrew' : (st.manager || 'Paketmanager');
  var html = '';
  if (st.available) {
    html += '<span class="pkg-status-item pkg-ok">' + esc(name) + ' ' + esc(st.version) + ' ✓</span>';
    if (st.manager === 'winget') {
      var src = ((deps.getConfig() || {}).packages || {}).sources || ['winget'];
      html += '<span class="pkg-status-item">Quelle: ' + esc(src.join(', ')) + '</span>';
    }
  } else {
    html += '<span class="pkg-status-item pkg-bad">' + esc(name) + ' nicht verfügbar</span>';
  }
  html += '<span class="pkg-status-item ' + (online ? '' : 'pkg-bad') + '">Online-Funktionen: ' + (online ? 'an' : 'aus') + '</span>';
  bar.innerHTML = html;

  var hint = $('pkg-status-hint');
  if (hint) {
    if (!st.available && st.hint) {
      hint.innerHTML = '<div class="pkg-hint warn">' + esc(st.hint) +
        (st.install_command ? '<pre class="pkg-cmd">' + esc(st.install_command) + '</pre><button class="btn btn-secondary btn-sm" data-copy-install>⧉ Befehl kopieren</button>' : '') + '</div>';
      hint.querySelector('[data-copy-install]')?.addEventListener('click', function () { copyText(st.install_command); });
      hint.classList.remove('hidden');
    } else if (!online) {
      hint.innerHTML = '<div class="pkg-hint">Online-Funktionen sind in den Einstellungen abgeschaltet. Verfügbar bleiben: installierte Pakete anzeigen, entfernen, pinnen.</div>';
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }
  var disabled = !st.available || !online;
  ['pkg-btn-check', 'pkg-search-input', 'pkg-search-btn'].forEach(function (id) { var el = $(id); if (el) el.disabled = disabled; });
}

// ─── Ausgabe-Panel ───────────────────────────────────────────────────────────

function initOutputPanel() {
  $('pkg-output-close')?.addEventListener('click', function () { $('pkg-output')?.classList.add('hidden'); });
  $('pkg-output-cancel')?.addEventListener('click', function () { CancelPackageOperation(); });
}

function openOutput(title) {
  var out = $('pkg-output');
  if (!out) return;
  out.classList.remove('hidden');
  $('pkg-output-title').textContent = '⏳ ' + title;
  $('pkg-output-text').textContent = '';
  $('pkg-output-cancel')?.classList.remove('hidden');
  out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function appendOutput(line) {
  var pre = $('pkg-output-text');
  if (!pre) return;
  pre.textContent += line + '\n';
  // max. ~2000 Zeilen behalten
  if (pre.textContent.length > 200000) pre.textContent = pre.textContent.slice(-150000);
  pre.scrollTop = pre.scrollHeight;
}

function finishOutput(title, ok) {
  $('pkg-output-title').textContent = (ok ? '✓ ' : '✗ ') + title;
  $('pkg-output-cancel')?.classList.add('hidden');
}

function setBusy(b) {
  busy = b;
  document.querySelectorAll('#tab-software [data-pkg-action], #pkg-btn-check, #pkg-btn-upgrade-all, #pkg-btn-upgrade-selected, #pkg-search-btn')
    .forEach(function (el) { el.disabled = b || (el.dataset.alwaysDisabled === '1'); });
  if (!b) renderStatus();
}

// Ergebnisliste nach einem Vorgang anzeigen + Aktionsprotokoll
function reportResults(label, results) {
  var ok = 0, fail = 0, lines = [];
  (results || []).forEach(function (r) {
    if (r.success) ok++; else fail++;
    var name = r.id || 'alle Pakete';
    lines.push((r.success ? '✓ ' : '✗ ') + name + ': ' + r.message + (r.reboot ? ' (Neustart nötig)' : ''));
    if (r.needs_terminal) {
      lines.push('   → Im Terminal ausführen: ' + r.command);
    }
    deps.addAction(label + ' ' + name + ': ' + r.message, r.success ? 'success' : (r.canceled ? 'warning' : 'error'));
  });
  appendOutput('\n──────── Zusammenfassung ────────\n' + lines.join('\n'));
  finishOutput(label + ': ' + ok + ' erfolgreich' + (fail ? ', ' + fail + ' fehlgeschlagen' : ''), fail === 0);
  var term = (results || []).find(function (r) { return r.needs_terminal; });
  if (term) {
    deps.showConfirm({
      title: 'Bitte im Terminal ausführen',
      what: 'Das Paket fragt nach dem Admin-Passwort. Ohne Terminal kann AdminKit das Passwort nicht weitergeben.\n\nBefehl:\n' + term.command,
      impact: '„Fortfahren“ kopiert den Befehl in die Zwischenablage.',
    }).then(function (yes) { if (yes) copyText(term.command); });
  }
}

// ─── Updates (#84) ───────────────────────────────────────────────────────────

async function checkUpdates() {
  if (busy) return;
  var list = $('pkg-updates-list');
  setBusy(true);
  list.innerHTML = '<div class="info-placeholder">⏳ Suche nach Updates… (kann bis zu einer Minute dauern)</div>';
  try {
    outdated = (await GetOutdatedPackages(pkgOptions())) || [];
    selected = new Set(outdated.filter(function (p) { return !p.pinned && !p.truncated && !p.explicit_only; }).map(function (p) { return p.id; }));
    renderUpdates();
    deps.addAction('Paket-Updates geprüft: ' + outdated.length + ' verfügbar', 'info');
  } catch (e) {
    list.innerHTML = '<div class="pkg-hint warn">Update-Prüfung fehlgeschlagen: ' + esc(e) + '</div>';
  } finally {
    setBusy(false);
  }
}

function renderUpdates() {
  var list = $('pkg-updates-list');
  var badge = $('pkg-updates-count');
  if (badge) badge.textContent = outdated.length ? String(outdated.length) : '';
  updateUpgradeButtons();
  if (!outdated.length) {
    list.innerHTML = '<div class="info-placeholder">✓ Alle Pakete sind aktuell.</div>';
    return;
  }
  var rows = outdated.map(function (p, i) {
    var blocked = p.pinned || p.truncated;
    var note = [];
    if (p.pinned) note.push('<span class="pkg-tag pkg-tag-pin" title="Wird nicht automatisch aktualisiert">🔒 gepinnt</span>');
    if (p.truncated) note.push('<span class="pkg-tag pkg-tag-warn" title="winget hat die ID gekürzt und sie konnte nicht aufgelöst werden">ID gekürzt</span>');
    if (p.explicit_only && !p.pinned) note.push('<span class="pkg-tag" title="winget aktualisiert dieses Paket nicht über „Alle“, nur gezielt">nur einzeln</span>');
    if (p.auto_updates) note.push('<span class="pkg-tag" title="Die App aktualisiert sich normalerweise selbst">aktualisiert sich selbst</span>');
    var pinBtn = '';
    if (pkgStatus?.supports_pin && p.source !== 'brew-cask') {
      pinBtn = p.pinned
        ? '<button class="btn btn-secondary btn-xs" data-pkg-action="unpin" data-list="updates" data-idx="' + i + '" title="Pin lösen">🔓 Lösen</button>'
        : '<button class="btn btn-secondary btn-xs" data-pkg-action="pin" data-list="updates" data-idx="' + i + '" title="Nicht automatisch aktualisieren">🔒</button>';
    }
    return '<tr>' +
      '<td class="cb-col"><input type="checkbox" data-sel-idx="' + i + '"' + (selected.has(p.id) ? ' checked' : '') + (blocked ? ' disabled' : '') + '></td>' +
      '<td><div class="pkg-name">' + esc(p.name) + '</div><div class="pkg-id">' + esc(p.id) + ' · ' + esc(sourceLabel(p.source)) + '</div>' +
        '<div class="pkg-info hidden" id="pkg-info-updates-' + i + '"></div></td>' +
      '<td class="mono">' + esc(p.version || '?') + '</td>' +
      '<td class="mono">→ ' + esc(p.available || '?') + '</td>' +
      '<td>' + note.join(' ') + '</td>' +
      '<td class="pkg-actions">' +
        infoButton('updates', i) +
        '<button class="btn btn-primary btn-xs" data-pkg-action="upgrade" data-list="updates" data-idx="' + i + '"' + (blocked ? ' disabled data-always-disabled="1"' : '') + ' title="Aktualisieren">⬆</button>' +
        pinBtn +
        '<button class="btn btn-secondary btn-xs" data-pkg-action="copy-upgrade" data-list="updates" data-idx="' + i + '" title="Befehl kopieren">⧉</button>' +
      '</td></tr>';
  }).join('');
  list.innerHTML = '<table class="data-table pkg-table"><thead><tr>' +
    '<th class="cb-col"><input type="checkbox" id="pkg-sel-all" title="Alle auswählen"></th><th>Paket</th><th>Installiert</th><th>Verfügbar</th><th>Hinweis</th><th></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
  $('pkg-sel-all')?.addEventListener('change', function (e) {
    selected = new Set(e.target.checked ? outdated.filter(function (p) { return !p.pinned && !p.truncated; }).map(function (p) { return p.id; }) : []);
    renderUpdates();
  });
}

function updateUpgradeButtons() {
  var allBtn = $('pkg-btn-upgrade-all');
  var selBtn = $('pkg-btn-upgrade-selected');
  var allCount = outdated.filter(function (p) { return !p.pinned && !p.explicit_only; }).length;
  if (allBtn) {
    allBtn.textContent = '⬆ Alle (' + allCount + ')';
    allBtn.classList.toggle('hidden', allCount === 0);
  }
  if (selBtn) {
    selBtn.textContent = '⬆ Ausgewählte aktualisieren (' + selected.size + ')';
    selBtn.classList.toggle('hidden', selected.size === 0);
  }
}

async function upgradeAll() {
  if (busy) return;
  var cmd;
  try { cmd = await GetPackageCommand('upgrade-all', { id: '' }, pkgOptions()); }
  catch (e) { deps.showToast(String(e)); return; }
  var names = outdated.filter(function (p) { return !p.pinned && !p.explicit_only; })
    .map(function (p) { return '• ' + p.name + '  ' + (p.version || '?') + ' → ' + (p.available || '?'); });
  var ok = await deps.showConfirm({
    title: 'Alle Pakete aktualisieren?',
    what: 'Folgende Pakete werden aktualisiert:\n' + names.join('\n') + '\n\nBefehl:\n' + cmd,
    impact: 'Laufende Programme können geschlossen werden. Manche Installer fragen nach Adminrechten (UAC/Passwort). Gepinnte Pakete bleiben unverändert.',
  });
  if (!ok) return;
  await runOp('Update', function () { return UpgradePackages([], pkgOptions()); }, 'Alle Pakete aktualisieren');
  checkUpdatesSilentlyAfter();
}

async function upgradeSelected() {
  if (busy || !selected.size) return;
  var pkgs = outdated.filter(function (p) { return selected.has(p.id); });
  await upgradeList(pkgs);
}

async function upgradeList(pkgs) {
  var cmds = [];
  for (var i = 0; i < pkgs.length; i++) {
    try { cmds.push(await GetPackageCommand('upgrade', refOf(pkgs[i]), pkgOptions())); }
    catch (e) { deps.showToast(pkgs[i].id + ': ' + e); return; }
  }
  var ok = await deps.showConfirm({
    title: pkgs.length === 1 ? pkgs[0].name + ' aktualisieren?' : pkgs.length + ' Pakete aktualisieren?',
    what: pkgs.map(function (p) { return '• ' + p.name + '  ' + (p.version || '?') + ' → ' + (p.available || '?'); }).join('\n') +
      '\n\nBefehl' + (cmds.length > 1 ? 'e' : '') + ':\n' + cmds.join('\n'),
    impact: 'Das Programm wird während des Updates ggf. geschlossen. Der Installer kann nach Adminrechten fragen.',
  });
  if (!ok) return;
  await runOp('Update', function () { return UpgradePackages(pkgs.map(refOf), pkgOptions()); },
    pkgs.length === 1 ? pkgs[0].name + ' aktualisieren' : pkgs.length + ' Pakete aktualisieren');
  checkUpdatesSilentlyAfter();
}

// Nach Updates die Liste neu laden (auf Klick ausgelöst → Online-Regel erfüllt)
function checkUpdatesSilentlyAfter() { setTimeout(checkUpdates, 300); }

// Gemeinsamer Ablauf für alle verändernden Aktionen
async function runOp(label, fn, title) {
  setBusy(true);
  openOutput(title);
  try {
    var results = await fn();
    reportResults(label, results);
    return results;
  } catch (e) {
    appendOutput('Fehler: ' + e);
    finishOutput(title, false);
    deps.addAction(title + ' fehlgeschlagen: ' + e, 'error');
    return null;
  } finally {
    setBusy(false);
  }
}

// ─── Suchen & Installieren (#85) ─────────────────────────────────────────────

async function runSearch() {
  if (busy) return;
  var q = ($('pkg-search-input')?.value || '').trim();
  if (!q) return;
  var list = $('pkg-search-list');
  setBusy(true);
  list.innerHTML = '<div class="info-placeholder">⏳ Suche „' + esc(q) + '“…</div>';
  try {
    searchResults = (await SearchPackages(q)) || [];
    renderSearch();
  } catch (e) {
    list.innerHTML = '<div class="pkg-hint warn">Suche fehlgeschlagen: ' + esc(e) + '</div>';
  } finally {
    setBusy(false);
  }
}

function renderSearch() {
  var list = $('pkg-search-list');
  if (!searchResults.length) {
    list.innerHTML = '<div class="info-placeholder">Keine Pakete gefunden.</div>';
    return;
  }
  list.innerHTML = '<table class="data-table pkg-table"><thead><tr><th>Paket</th><th>Version</th><th>Art</th><th></th></tr></thead><tbody>' +
    searchResults.map(function (p, i) {
      return '<tr>' +
        '<td><div class="pkg-name">' + esc(p.name) + '</div><div class="pkg-id">' + esc(p.id) + '</div>' +
          '<div class="pkg-info hidden" id="pkg-info-search-' + i + '"></div></td>' +
        '<td class="mono">' + esc(p.version || '') + '</td>' +
        '<td>' + esc(sourceLabel(p.source)) + '</td>' +
        '<td class="pkg-actions">' +
          infoButton('search', i) +
          (deps.renderFavButton ? deps.renderFavButton(p) : '') +
          '<button class="btn btn-primary btn-xs" data-pkg-action="install" data-list="search" data-idx="' + i + '"' + (p.truncated ? ' disabled data-always-disabled="1"' : '') + '>Installieren</button>' +
          '<button class="btn btn-secondary btn-xs" data-pkg-action="copy-install" data-list="search" data-idx="' + i + '" title="Befehl kopieren">⧉</button>' +
        '</td></tr>';
    }).join('') + '</tbody></table>';
}

export async function installPackages(pkgs, label) {
  if (busy || !pkgs.length) return null;
  var cmds = [];
  for (var i = 0; i < pkgs.length; i++) {
    try { cmds.push(await GetPackageCommand('install', refOf(pkgs[i]), pkgOptions())); }
    catch (e) { deps.showToast(pkgs[i].id + ': ' + e); return null; }
  }
  var ok = await deps.showConfirm({
    title: pkgs.length === 1 ? pkgs[0].name + ' installieren?' : (label || pkgs.length + ' Pakete installieren?'),
    what: pkgs.map(function (p) { return '• ' + p.name + ' (' + p.id + ')'; }).join('\n') + '\n\nBefehl' + (cmds.length > 1 ? 'e' : '') + ':\n' + cmds.join('\n'),
    impact: 'Das Programm wird aus der offiziellen Paketquelle heruntergeladen und installiert. Der Installer kann nach Adminrechten fragen. Fehlgeschlagene Pakete brechen den Vorgang nicht ab.',
  });
  if (!ok) return null;
  return runOp('Installation', function () { return InstallPackages(pkgs.map(refOf), pkgOptions()); },
    pkgs.length === 1 ? pkgs[0].name + ' installieren' : (label || pkgs.length + ' Pakete installieren'));
}

// ─── Installierte Pakete: Entfernen & Pin (#85) ──────────────────────────────

async function loadInstalled() {
  if (busy) return;
  var list = $('pkg-installed-list');
  list.innerHTML = '<div class="info-placeholder">⏳ Paketliste wird geladen…</div>';
  try {
    installed = (await GetInstalledPackages()) || [];
    installed.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'de'); });
    renderInstalled();
    var c = $('pkg-installed-count');
    if (c) c.textContent = String(installed.length);
  } catch (e) {
    list.innerHTML = '<div class="pkg-hint warn">Konnte Pakete nicht laden: ' + esc(e) + '</div>';
  }
}

export function getInstalledPackages() { return installed; }

function renderInstalled() {
  var list = $('pkg-installed-list');
  if (!installed.length) {
    list.innerHTML = '<div class="info-placeholder">Keine Pakete über den Paketmanager installiert.</div>';
    return;
  }
  list.innerHTML = '<table class="data-table pkg-table"><thead><tr><th>Paket</th><th>Version</th><th>Art</th><th></th></tr></thead><tbody>' +
    installed.map(function (p, i) {
      var pin = '';
      if (pkgStatus?.supports_pin !== false && p.source !== 'brew-cask') {
        pin = p.pinned
          ? '<button class="btn btn-secondary btn-xs" data-pkg-action="unpin" data-list="installed" data-idx="' + i + '">🔓 Lösen</button>'
          : '<button class="btn btn-secondary btn-xs" data-pkg-action="pin" data-list="installed" data-idx="' + i + '" title="Nicht automatisch aktualisieren">🔒</button>';
      }
      return '<tr><td><div class="pkg-name">' + esc(p.name) + (p.pinned ? ' 🔒' : '') + '</div><div class="pkg-id">' + esc(p.id) + '</div>' +
          '<div class="pkg-info hidden" id="pkg-info-installed-' + i + '"></div></td>' +
        '<td class="mono">' + esc(p.version) + (p.available ? ' <span class="pkg-tag">→ ' + esc(p.available) + '</span>' : '') + '</td>' +
        '<td>' + esc(sourceLabel(p.source)) + '</td>' +
        '<td class="pkg-actions">' +
          infoButton('installed', i) +
          pin +
          '<button class="btn btn-danger btn-xs" data-pkg-action="uninstall" data-list="installed" data-idx="' + i + '">Entfernen</button>' +
        '</td></tr>';
    }).join('') + '</tbody></table>';
}

async function uninstall(p) {
  var cmd;
  try { cmd = await GetPackageCommand('uninstall', refOf(p), pkgOptions()); }
  catch (e) { deps.showToast(String(e)); return; }
  var ok = await deps.showConfirm({
    title: p.name + ' entfernen?',
    what: p.name + ' (' + p.id + ', Version ' + (p.version || '?') + ') wird deinstalliert.\n\nBefehl:\n' + cmd,
    impact: 'Das Programm steht danach nicht mehr zur Verfügung. Benutzerdaten bleiben in der Regel erhalten, das hängt aber vom Deinstallationsprogramm ab.',
  });
  if (!ok) return;
  await runOp('Deinstallation', async function () { return [await UninstallPackage(refOf(p), pkgOptions())]; }, p.name + ' entfernen');
  loadInstalled();
}

async function setPinned(p, pin, listName) {
  var cmd;
  try { cmd = await GetPackageCommand(pin ? 'pin' : 'unpin', refOf(p), pkgOptions()); }
  catch (e) { deps.showToast(String(e)); return; }
  var ok = await deps.showConfirm({
    title: pin ? p.name + ' von Updates ausnehmen?' : 'Pin für ' + p.name + ' lösen?',
    what: (pin
      ? p.name + ' wird bei „Alle aktualisieren“ übersprungen, z. B. weil die Software zentral verwaltet wird.'
      : p.name + ' wird wieder normal aktualisiert.') + '\n\nBefehl:\n' + cmd,
    impact: pin ? 'Sicherheitsupdates für dieses Programm müssen dann anderweitig eingespielt werden.' : '',
  });
  if (!ok) return;
  var res = await runOp(pin ? 'Pin' : 'Pin lösen', async function () { return [await SetPackagePinned(refOf(p), pin)]; }, (pin ? 'Pin: ' : 'Pin lösen: ') + p.name);
  if (res && res[0]?.success) {
    p.pinned = pin;
    if (listName === 'updates') { selected.delete(p.id); renderUpdates(); } else renderInstalled();
  }
}

// ─── Tabellen-Ereignisse ─────────────────────────────────────────────────────

function itemFor(el) {
  var idx = parseInt(el.dataset.idx, 10);
  var listName = el.dataset.list;
  var arr = listName === 'updates' ? outdated : listName === 'search' ? searchResults : installed;
  return { p: arr[idx], listName: listName, idx: idx };
}

async function onTableClick(e) {
  var btn = e.target.closest('[data-pkg-action]');
  if (!btn || btn.disabled) return;
  var it = itemFor(btn);
  if (!it.p) return;
  switch (btn.dataset.pkgAction) {
    case 'upgrade': if (!busy) upgradeList([it.p]); break;
    case 'install': if (!busy) installPackages([it.p]); break;
    case 'uninstall': if (!busy) uninstall(it.p); break;
    case 'pin': if (!busy) setPinned(it.p, true, it.listName); break;
    case 'unpin': if (!busy) setPinned(it.p, false, it.listName); break;
    case 'copy-upgrade':
      try { copyText(await GetPackageCommand('upgrade', refOf(it.p), pkgOptions())); } catch (err) { deps.showToast(String(err)); }
      break;
    case 'copy-install':
      try { copyText(await GetPackageCommand('install', refOf(it.p), pkgOptions())); } catch (err) { deps.showToast(String(err)); }
      break;
    case 'info':
      toggleInfo(it.p, $('pkg-info-' + it.listName + '-' + it.idx), it.listName === 'search' ? searchResults : it.listName === 'updates' ? outdated : installed);
      break;
  }
}

function onTableChange(e) {
  var cb = e.target.closest('[data-sel-idx]');
  if (!cb) return;
  var p = outdated[parseInt(cb.dataset.selIdx, 10)];
  if (!p) return;
  if (cb.checked) selected.add(p.id); else selected.delete(p.id);
  updateUpgradeButtons();
}

export function isPackageBusy() { return busy; }
export function getPackageStatus() { return pkgStatus; }
export function ensureStatus() { if (!statusLoaded) { statusLoaded = true; return loadStatus(); } return Promise.resolve(); }

// ─── Infos & Einordnung (#86) ────────────────────────────────────────────────

var DAY = 86400000;

export function openURL(u) {
  if (!/^https?:\/\//i.test(u || '')) return;
  try { BrowserOpenURL(u); } catch (_) { window.open(u, '_blank', 'noopener'); }
}

function infoButton(list, i) {
  return '<button class="btn btn-secondary btn-xs" data-pkg-action="info" data-list="' + list + '" data-idx="' + i + '" title="Was ist das? Welche Variante?">ℹ Infos</button>';
}

function linkHTML(u, text) {
  if (!u || !/^https?:\/\//i.test(u)) return esc(text || '');
  var label = text || u.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return '<a href="#" data-open-url="' + esc(u) + '">' + esc(label) + '</a>';
}

function relTime(t) {
  var d = Date.now() - Date.parse(t);
  if (!isFinite(d)) return '–';
  var days = Math.round(d / DAY);
  if (days < 1) return 'heute';
  if (days < 31) return 'vor ' + days + ' Tag' + (days === 1 ? '' : 'en');
  var months = Math.round(days / 30);
  if (months < 24) return 'vor ' + months + ' Monat' + (months === 1 ? '' : 'en');
  return 'vor ' + Math.round(days / 365) + ' Jahren';
}

function hintBox(level, title, text) {
  return '<div class="pkg-hint ' + (level === 'warn' ? 'warn' : '') + '"><strong>' + (level === 'warn' ? '⚠ ' : 'ℹ ') + esc(title) + '</strong><br>' + esc(text) + '</div>';
}

// Ausklappbarer Info-Bereich unter einer Tabellenzeile
export async function toggleInfo(p, box, siblings) {
  if (!box) return;
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = '<div class="pkg-note">⏳ Infos werden geladen…</div>';
  var known = (siblings || []).map(function (x) { return x.id; });
  try {
    var info = await GetPackageInfo(refOf(p), known);
    box.innerHTML = infoHTML(info);
  } catch (e) {
    box.innerHTML = '<div class="pkg-hint warn">Infos konnten nicht geladen werden: ' + esc(e) +
      (deps.onlineAllowed('packages') ? '' : '<br>Die Online-Funktionen sind abgeschaltet – es gibt nur Infos, die schon einmal geladen wurden.') + '</div>';
  }
}

export function infoHTML(info) {
  var h = '';
  var note = info.note;
  if (note) {
    h += hintBox(note.level, note.own ? 'Eure Notiz' : 'Einordnung', note.text);
    if (note.own && note.default) h += hintBox('info', 'Vorgabe', note.default);
  }
  (info.hints || []).forEach(function (x) { h += hintBox(x.level, x.title, x.text); });
  if (info.description) h += '<p class="pkg-desc">' + esc(info.description) + '</p>';
  if (info.long_description && info.long_description !== info.description) {
    h += '<details class="pkg-details"><summary>Ausführliche Beschreibung' + (info.desc_lang === 'de' ? '' : ' (meist Englisch)') + '</summary><p>' +
      esc(info.long_description).replace(/\n/g, '<br>') + '</p></details>';
  }
  var kv = [];
  kv.push(['Hersteller', info.publisher_url ? linkHTML(info.publisher_url, info.publisher || info.publisher_url) : esc(info.publisher || '–')]);
  if (info.homepage) kv.push(['Website', linkHTML(info.homepage)]);
  kv.push(['Lizenz', info.license_url ? linkHTML(info.license_url, info.license || 'Lizenz') : esc(info.license || '–')]);
  if ((info.installer_types || []).length) {
    kv.push(['Installation', esc(info.installer_types.join(', ')) + ((info.scopes || []).length ? ', ' + esc(info.scopes.join(' oder ')) : '')]);
  }
  if ((info.archs || []).length) kv.push(['Architektur', esc(info.archs.join(', '))]);
  if (info.needs_admin) kv.push(['Adminrechte', 'ja, fragt bei der Installation nach']);
  if (info.auto_updates) kv.push(['Updates', 'aktualisiert sich selbst']);
  if (info.github) {
    kv.push(['Quellcode', linkHTML(info.github.url, 'GitHub') + ', ' + Number(info.github.stars || 0).toLocaleString('de-DE') + ' Sterne, zuletzt aktiv ' +
      esc(relTime(info.github.pushed_at)) + (info.github.archived ? ', <b class="pkg-warn-text">archiviert</b>' : '')]);
  }
  h += '<dl class="pkg-kv">' + kv.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>';
  if (info.install_notes) h += '<div class="pkg-note">Hinweis des Pakets: ' + esc(info.install_notes) + '</div>';
  if ((info.tags || []).length) {
    h += '<div class="pkg-tags">' + info.tags.slice(0, 12).map(function (t) { return '<span class="pkg-tag">' + esc(t) + '</span>'; }).join('') + '</div>';
  }
  var foot = [];
  if (info.manifest_url) foot.push(linkHTML(info.manifest_url, 'Paketdateien auf GitHub'));
  if (info.from_cache && info.fetched_at) foot.push('gespeicherte Infos vom ' + new Date(info.fetched_at).toLocaleDateString('de-DE'));
  if (info.partial) foot.push('nur Basisinfos (winget show)');
  if (foot.length) h += '<div class="pkg-note">' + foot.join(' · ') + '</div>';
  return h;
}
