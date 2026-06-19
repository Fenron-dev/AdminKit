/**
 * AdminKit – Frontend-Einstiegspunkt
 *
 * Wails-Bindings werden über window.go.main.App.* aufgerufen.
 * Alle Methoden sind in app.go definiert und werden von Wails beim Build generiert.
 */
import './style.css';
import {
  GetAppVersion, GetVaultPath, GetConfig, NewSession,
  ScanSystem, SaveSystemScan,
} from '../wailsjs/go/main/App';

// ─── Zustand ─────────────────────────────────────────────────────────────────

const state = {
  theme: detectInitialTheme(),
  activeTab: 'dashboard',
  currentSession: null,        // Name der aktiven Session
  currentSessionPath: null,    // Absoluter Pfad zur Session im Vault
  lastScanResult: null,        // Letztes ScanResult-Objekt
  isScanning: false,
};

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  initTabs();
  initThemeToggle();
  initSessionModal();
  initScanButtons();
  loadAppInfo();
});

// ─── Theme ────────────────────────────────────────────────────────────────────

function detectInitialTheme() {
  const saved = localStorage.getItem('adminkit-theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';
  localStorage.setItem('adminkit-theme', theme);
}

function initThemeToggle() {
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.theme);
  });
}

// ─── Tab-Navigation ───────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tabId)
  );
  document.querySelectorAll('.tab-panel').forEach(panel =>
    panel.classList.toggle('active', panel.id === `tab-${tabId}`)
  );
  state.activeTab = tabId;
}

// ─── App-Infos ────────────────────────────────────────────────────────────────

async function loadAppInfo() {
  try {
    const [version, vaultPath, cfg] = await Promise.all([
      GetAppVersion(), GetVaultPath(), GetConfig(),
    ]);
    setEl('app-version', `v${version}`);
    setEl('vault-label', shortenPath(vaultPath));
    setEl('status-vault', shortenPath(vaultPath));

    if (cfg?.ui?.theme && !localStorage.getItem('adminkit-theme') && cfg.ui.theme !== 'system') {
      state.theme = cfg.ui.theme;
      applyTheme(state.theme);
    }
    setStatus('Bereit');
  } catch (err) {
    console.warn('Wails-Backend nicht verfügbar (Dev-Modus):', err);
    setEl('app-version', 'v1.0.0-dev');
    setEl('vault-label', './adminkit_vault');
    setStatus('Dev-Modus');
  }
}

// ─── Scan-Buttons ─────────────────────────────────────────────────────────────

function initScanButtons() {
  document.getElementById('btn-full-scan')?.addEventListener('click', () => runScan(true));
  document.getElementById('btn-scan-system')?.addEventListener('click', () => runScan(false));
  document.getElementById('btn-refresh')?.addEventListener('click', () => loadAppInfo());
}

async function runScan(switchToSystem = false) {
  if (state.isScanning) return;
  state.isScanning = true;

  setStatus('Scan läuft…');
  setScanButtonsDisabled(true);
  addAction('System-Scan gestartet', 'info');

  if (switchToSystem) switchTab('system');

  // Lade-Platzhalter zeigen
  setPlaceholder('hw-info',     'Scanne Hardware…');
  setPlaceholder('os-info',     'Scanne Betriebssystem…');
  setPlaceholder('smart-info',  'Scanne Festplatten (SMART)…');

  try {
    const result = await ScanSystem();
    state.lastScanResult = result;

    renderHardware(result.hardware);
    renderOS(result.os);
    renderSmart(result.smart);
    updateDashboardBadges(result);

    // Scan im Vault speichern wenn Session aktiv
    if (state.currentSessionPath) {
      await SaveSystemScan(result, state.currentSessionPath);
      addAction('Scan in Vault gespeichert', 'success');
    }

    const warnCount = result.errors?.length ?? 0;
    if (warnCount > 0) {
      addAction(`Scan abgeschlossen (${warnCount} Warnungen)`, 'warning');
      result.errors.forEach(e => addAction(`⚠ [${e.module}] ${e.message}`, 'warning'));
    } else {
      addAction('Scan abgeschlossen', 'success');
    }
    setStatus('Scan abgeschlossen');
  } catch (err) {
    console.error('Scan fehlgeschlagen:', err);
    addAction('Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

function setScanButtonsDisabled(disabled) {
  ['btn-full-scan', 'btn-scan-system'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

// ─── System-Tab Rendering ─────────────────────────────────────────────────────

function renderHardware(hw) {
  if (!hw) { setPlaceholder('hw-info', 'Keine Hardware-Daten verfügbar.'); return; }

  const rows = [
    ['CPU', hw.cpu?.name],
    ['Kerne / Threads', hw.cpu ? `${hw.cpu.cores} Kerne / ${hw.cpu.threads} Threads` : null],
    ['Takt', hw.cpu?.speed_mhz ? `${(hw.cpu.speed_mhz / 1000).toFixed(1)} GHz` : null],
    ['Architektur', hw.cpu?.architecture],
    ['RAM gesamt', hw.total_ram_gb ? `${hw.total_ram_gb} GB` : null],
    ['Mainboard', hw.motherboard ? `${hw.motherboard.manufacturer} ${hw.motherboard.product}` : null],
    ['Mainboard S/N', hw.motherboard?.serial_number],
  ];

  // RAM-Module anhängen
  if (hw.ram?.length > 0) {
    hw.ram.forEach((m, i) => {
      rows.push([`RAM-Slot ${i + 1}`, `${m.capacity_gb} GB ${m.memory_type} @ ${m.speed_mhz} MHz — ${m.manufacturer || '–'}`]);
    });
  }

  // GPUs
  if (hw.gpus?.length > 0) {
    hw.gpus.forEach((g, i) => {
      const vram = g.vram_gb > 0 ? ` (${g.vram_gb} GB VRAM)` : '';
      rows.push([`GPU ${i + 1}`, g.name + vram]);
    });
  }

  // Festplatten
  if (hw.disks?.length > 0) {
    hw.disks.forEach((d, i) => {
      rows.push([`Disk ${i + 1}`, `${d.model} — ${d.size_gb} GB ${d.media_type} (${d.interface_type || '–'})`]);
    });
  }

  setInfoGrid('hw-info', rows);
}

function renderOS(os) {
  if (!os) { setPlaceholder('os-info', 'Keine OS-Daten verfügbar.'); return; }

  const uptime = calcUptime(os.last_boot_time);
  const rows = [
    ['Betriebssystem', os.name],
    ['Version', os.version],
    ['Build', os.build],
    ['Architektur', os.architecture],
    ['Uptime', uptime],
    ['Installiert', formatDate(os.install_date)],
    ['Letzter Neustart', formatDate(os.last_boot_time)],
    ['Lizenzstatus', os.license_status],
    ['Seriennummer', os.serial_number],
  ];

  setInfoGrid('os-info', rows);
}

function renderSmart(smarts) {
  const container = document.getElementById('smart-info');
  if (!container) return;

  if (!smarts || smarts.length === 0) {
    container.innerHTML = '<div class="info-placeholder">Keine SMART-Daten verfügbar (Admin-Rechte nötig).</div>';
    return;
  }

  container.innerHTML = '';
  smarts.forEach(disk => {
    const statusClass = { OK: 'badge-ok', WARNING: 'badge-warning', CRITICAL: 'badge-error', UNKNOWN: 'badge-unknown' }[disk.status] ?? 'badge-unknown';
    const statusIcon = { OK: '🟢', WARNING: '🟡', CRITICAL: '🔴', UNKNOWN: '⚪' }[disk.status] ?? '⚪';

    const rows = [
      ['Status', `<span class="status-badge ${statusClass}">${statusIcon} ${disk.status}</span>`],
    ];
    if (disk.temperature_c > 0) rows.push(['Temperatur', `${disk.temperature_c} °C`]);
    if (disk.power_on_hours > 0) rows.push(['Betriebsstunden', `${disk.power_on_hours} h (${Math.floor(disk.power_on_hours / 24)} Tage)`]);
    rows.push(['Reallocated Sectors', String(disk.reallocated_sectors ?? 0)]);
    if (disk.life_left_percent >= 0) rows.push(['SSD-Restlebensdauer', `${disk.life_left_percent}%`]);
    if (disk.serial_number) rows.push(['Seriennummer', disk.serial_number]);

    // Disk-Block
    const wrapper = document.createElement('div');
    wrapper.className = 'smart-disk';
    wrapper.innerHTML = `<div class="smart-disk-title">${escapeHtml(disk.model)}</div>`;
    const grid = buildInfoGrid(rows, true);
    wrapper.appendChild(grid);
    container.appendChild(wrapper);
  });
}

// ─── Dashboard-Badges aktualisieren ──────────────────────────────────────────

function updateDashboardBadges(result) {
  if (result.os) {
    setEl('info-hostname', result.os.name ?? '–');
    setEl('info-os', `${result.os.name ?? ''} ${result.os.build ?? ''}`);
    if (result.os.last_boot_time) {
      setEl('info-uptime', calcUptime(result.os.last_boot_time));
    }
  }

  setBadge('badge-hardware', 'detail-hardware',
    result.hardware?.cpu?.name ? SmartStatus.OK : SmartStatus.UNKNOWN,
    result.hardware?.cpu?.name ?? 'Keine Daten'
  );

  setBadge('badge-os', 'detail-os',
    result.os?.name ? SmartStatus.OK : SmartStatus.UNKNOWN,
    result.os?.name ?? 'Keine Daten'
  );

  if (result.smart?.length > 0) {
    const worst = result.smart.reduce((acc, d) => {
      const order = { CRITICAL: 3, WARNING: 2, UNKNOWN: 1, OK: 0 };
      return (order[d.status] ?? 0) > (order[acc.status] ?? 0) ? d : acc;
    }, result.smart[0]);
    setBadge('badge-smart', 'detail-smart', worst.status, `${result.smart.length} Disk(s) — schlechtester: ${worst.status}`);
  }
}

// Kleines Enum für Badge-Status
const SmartStatus = { OK: 'OK', WARNING: 'WARNING', CRITICAL: 'CRITICAL', UNKNOWN: 'UNKNOWN' };

function setBadge(badgeId, detailId, status, detail) {
  const badge = document.getElementById(badgeId);
  if (!badge) return;
  const classMap = { OK: 'badge-ok', WARNING: 'badge-warning', CRITICAL: 'badge-error', UNKNOWN: 'badge-unknown' };
  const icons = { OK: '🟢 OK', WARNING: '🟡 Warnung', CRITICAL: '🔴 Kritisch', UNKNOWN: '⚪ Unbekannt' };
  badge.className = `status-badge ${classMap[status] ?? 'badge-unknown'}`;
  badge.textContent = icons[status] ?? '⚪';
  setEl(detailId, detail ?? '');
}

// ─── Session-Modal ────────────────────────────────────────────────────────────

function initSessionModal() {
  const modal = document.getElementById('modal-session');
  const input = document.getElementById('session-name-input');

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
    input?.focus();
  });
  document.getElementById('btn-session-cancel')?.addEventListener('click', () =>
    modal?.classList.add('hidden')
  );
  document.getElementById('btn-session-create')?.addEventListener('click', () =>
    createSession(input?.value?.trim())
  );
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter') createSession(input.value.trim());
    if (e.key === 'Escape') modal?.classList.add('hidden');
  });
  modal?.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

async function createSession(name) {
  if (!name) return;
  const modal = document.getElementById('modal-session');
  try {
    const sessionPath = await NewSession(name);
    state.currentSession = name;
    state.currentSessionPath = sessionPath;
    setEl('status-session', name);
    modal?.classList.add('hidden');
    addAction(`Session "${name}" erstellt`, 'success');
    setStatus(`Session: ${name}`);
  } catch (err) {
    console.error('Session konnte nicht erstellt werden:', err);
    // Dev-Modus: simulieren
    state.currentSession = name;
    setEl('status-session', name);
    modal?.classList.add('hidden');
  }
}

// ─── Aktions-Log ──────────────────────────────────────────────────────────────

function addAction(text, type = 'info') {
  const list = document.getElementById('action-list');
  if (!list) return;
  list.querySelector('.empty-state')?.remove();
  const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✗' };
  const el = document.createElement('div');
  el.className = 'action-entry';
  el.innerHTML = `
    <span>${icons[type] ?? 'ℹ'}</span>
    <span>${escapeHtml(text)}</span>
    <span class="action-time">${formatTime(new Date())}</span>
  `;
  list.prepend(el);
}

// ─── Hilfs-Funktionen ─────────────────────────────────────────────────────────

function setStatus(text) { setEl('status-text', text); }

function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '';
}

function setPlaceholder(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="info-placeholder">${escapeHtml(text)}</div>`;
}

/** Baut ein Info-Grid (Key-Value-Tabelle) und hängt es in das Element mit der id ein. */
function setInfoGrid(containerId, rows) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  el.appendChild(buildInfoGrid(rows, false));
}

/** Erstellt ein Info-Grid-Fragment aus [[key, value], …] Paaren. */
function buildInfoGrid(rows, rawHtml = false) {
  const frag = document.createDocumentFragment();
  rows.forEach(([key, value]) => {
    if (!value && value !== 0) return;
    const k = document.createElement('div');
    k.className = 'info-key';
    k.textContent = key;
    const v = document.createElement('div');
    v.className = 'info-val';
    if (rawHtml) {
      v.innerHTML = value;
    } else {
      v.textContent = String(value);
    }
    frag.appendChild(k);
    frag.appendChild(v);
  });
  return frag;
}

function shortenPath(path) {
  if (!path || path.length < 40) return path ?? '–';
  const parts = path.replace(/\\/g, '/').split('/');
  return '…/' + parts.slice(-2).join('/');
}

function formatDate(isoStr) {
  if (!isoStr) return '–';
  const d = new Date(isoStr);
  if (isNaN(d)) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calcUptime(bootTimeStr) {
  if (!bootTimeStr) return '–';
  const boot = new Date(bootTimeStr);
  if (isNaN(boot) || boot.getFullYear() < 2000) return '–';
  const ms = Date.now() - boot.getTime();
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days} Tag${days !== 1 ? 'e' : ''}, ${hours} Std.`;
  if (hours > 0) return `${hours} Std., ${mins} Min.`;
  return `${mins} Min.`;
}

function formatTime(date) {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
