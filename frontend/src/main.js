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
  ScanNetwork, SaveNetworkScan,
  ScanSoftware, SaveSoftwareScan,
  RunConsoleTool, BackupVault, GetClipboard, GetUptime,
  ExportSession,
  SaveConfig,
  PickLogoFile,
  GetLogoBase64,
} from '../wailsjs/go/main/App';

// ─── Zustand ─────────────────────────────────────────────────────────────────

const state = {
  theme: detectInitialTheme(),
  activeTab: 'dashboard',
  currentSession: null,        // Name der aktiven Session
  currentSessionPath: null,    // Absoluter Pfad zur Session im Vault
  lastScanResult: null,        // Letztes System-ScanResult
  lastNetworkResult: null,     // Letztes Netzwerk-ScanResult
  lastSoftwareResult: null,    // Letztes Software-ScanResult
  softwareSortCol: 'name',     // Aktive Sortierspalte
  softwareSortDir: 'asc',      // Sortierrichtung
  isScanning: false,
  config: null,                // Geladene Konfiguration (config.yaml)
};

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  initTabs();
  initThemeToggle();
  initSessionModal();
  initScanButtons();
  initSoftwareTab();
  initToolsTab();
  initExport();
  initSettings();
  initDashboardCardNav();
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

    state.config = cfg;
    updateBrandingBar();

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
  document.getElementById('btn-full-scan')?.addEventListener('click', () => runFullScan());
  document.getElementById('btn-scan-system')?.addEventListener('click', () => runSystemScan());
  document.getElementById('btn-scan-network')?.addEventListener('click', () => runNetworkScan());
  document.getElementById('btn-scan-software')?.addEventListener('click', () => runSoftwareScan());
  document.getElementById('btn-refresh')?.addEventListener('click', () => loadAppInfo());
}

/** Vollständiger Scan: System + Netzwerk + Software nacheinander */
async function runFullScan() {
  switchTab('system');
  await runSystemScan();
  await runNetworkScan();
  await runSoftwareScan();
}

async function runSystemScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  setStatus('System-Scan läuft…');
  setScanButtonsDisabled(true);
  addAction('System-Scan gestartet', 'info');

  setPlaceholder('hw-info',    'Scanne Hardware…');
  setPlaceholder('os-info',    'Scanne Betriebssystem…');
  setPlaceholder('smart-info', 'Scanne Festplatten (SMART)…');

  try {
    const result = await ScanSystem();
    state.lastScanResult = result;

    renderHardware(result.hardware);
    renderOS(result.os);
    renderSmart(result.smart);
    updateDashboardBadges(result);

    if (state.currentSessionPath) {
      await SaveSystemScan(result, state.currentSessionPath);
      addAction('System-Scan in Vault gespeichert', 'success');
    }

    logScanErrors(result.errors, 'System-Scan');
    setStatus('System-Scan abgeschlossen');
  } catch (err) {
    console.error('System-Scan fehlgeschlagen:', err);
    addAction('System-Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim System-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

async function runNetworkScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  setStatus('Netzwerk-Scan läuft…');
  setScanButtonsDisabled(true);
  addAction('Netzwerk-Scan gestartet', 'info');

  setPlaceholder('adapter-info', 'Scanne Netzwerkadapter…');
  setPlaceholder('shares-info',  'Scanne Netzlaufwerke…');
  setPlaceholder('wifi-info',    'Scanne WiFi-Profile…');

  try {
    const result = await ScanNetwork();
    state.lastNetworkResult = result;

    renderAdapters(result.adapters);
    renderShares(result.shares);
    renderWiFi(result.wifi);
    updateNetworkBadge(result);

    if (state.currentSessionPath) {
      await SaveNetworkScan(result, state.currentSessionPath);
      addAction('Netzwerk-Scan in Vault gespeichert', 'success');
    }

    logScanErrors(result.errors, 'Netzwerk-Scan');
    setStatus('Netzwerk-Scan abgeschlossen');
  } catch (err) {
    console.error('Netzwerk-Scan fehlgeschlagen:', err);
    addAction('Netzwerk-Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim Netzwerk-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

async function runSoftwareScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  setStatus('Software-Scan läuft…');
  setScanButtonsDisabled(true);
  addAction('Software-Scan gestartet', 'info');

  const tbody = document.getElementById('software-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-placeholder">Scanne installierte Software…</td></tr>';

  try {
    const result = await ScanSoftware();
    state.lastSoftwareResult = result;

    renderSoftware(result);
    updateSoftwareBadge(result);

    if (state.currentSessionPath) {
      await SaveSoftwareScan(result, state.currentSessionPath);
      addAction('Software-Scan in Vault gespeichert', 'success');
    }

    logScanErrors(result.errors, 'Software-Scan');
    setStatus('Software-Scan abgeschlossen');
  } catch (err) {
    console.error('Software-Scan fehlgeschlagen:', err);
    addAction('Software-Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim Software-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

function logScanErrors(errors, label) {
  const count = errors?.length ?? 0;
  if (count > 0) {
    addAction(`${label} abgeschlossen (${count} Warnungen)`, 'warning');
    errors.forEach(e => addAction(`⚠ [${e.module}] ${e.message}`, 'warning'));
  } else {
    addAction(`${label} abgeschlossen`, 'success');
  }
}

function setScanButtonsDisabled(disabled) {
  ['btn-full-scan', 'btn-scan-system', 'btn-scan-network', 'btn-scan-software'].forEach(id => {
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

// ─── Netzwerk-Tab Rendering ──────────────────────────────────────────────────

function renderAdapters(adapters) {
  const container = document.getElementById('adapter-info');
  if (!container) return;
  if (!adapters?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Netzwerkadapter gefunden.</div>';
    return;
  }
  container.innerHTML = '';
  adapters.forEach(a => {
    const connIcon = a.is_connected ? '🟢' : (a.is_enabled ? '🟡' : '⚫');
    const rows = [
      ['Typ', a.type],
      ['Beschreibung', a.description],
      ['MAC-Adresse', a.mac_address],
      ['Status', a.is_connected ? 'Verbunden' : (a.is_enabled ? 'Aktiviert (nicht verbunden)' : 'Deaktiviert')],
    ];
    if (a.ipv4?.length) rows.push(['IPv4', a.ipv4.join(', ')]);
    if (a.subnet_masks?.length) rows.push(['Subnetzmaske', a.subnet_masks.join(', ')]);
    if (a.gateway) rows.push(['Gateway', a.gateway]);
    if (a.dns_servers?.length) rows.push(['DNS-Server', a.dns_servers.join(', ')]);
    if (a.ipv6?.length) rows.push(['IPv6', a.ipv6.join(', ')]);
    if (a.speed) rows.push(['Geschwindigkeit', a.speed]);

    const block = document.createElement('div');
    block.className = 'smart-disk';
    block.innerHTML = `<div class="smart-disk-title">${connIcon} ${escapeHtml(a.name || a.description)}</div>`;
    block.appendChild(buildInfoGrid(rows, false));
    container.appendChild(block);
  });
}

function renderShares(shares) {
  const container = document.getElementById('shares-info');
  if (!container) return;
  if (!shares?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Netzlaufwerke verbunden.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead><tr>
      <th>Laufwerk</th>
      <th>Netzwerkpfad</th>
      <th>Status</th>
    </tr></thead>`;
  const tbody = document.createElement('tbody');
  shares.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(s.drive_letter)}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${escapeHtml(s.unc_path)}</td>
      <td>${s.status === 'Connected' ? '🟢 Verbunden' : '🔴 Getrennt'}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

/** Rendert WiFi-Profile mit maskierten Passwörtern.
 *  Passwort wird erst per Klick auf das Auge-Symbol sichtbar gemacht. */
function renderWiFi(profiles) {
  const container = document.getElementById('wifi-info');
  if (!container) return;
  if (!profiles?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine WiFi-Profile gefunden (Admin-Rechte nötig).</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead><tr>
      <th>SSID</th>
      <th>Sicherheit</th>
      <th>Verbunden</th>
      <th>Passwort</th>
    </tr></thead>`;
  const tbody = document.createElement('tbody');

  profiles.forEach((w, idx) => {
    const tr = document.createElement('tr');
    const conn = w.is_connected ? '✓ Aktiv' : '–';

    let pwCell = '<span class="text-muted">–</span>';
    if (w.has_password) {
      if (w.password) {
        // Passwort vorhanden: maskiert anzeigen, Toggle-Button
        const pwId = `wifi-pw-${idx}`;
        pwCell = `
          <span class="pw-mask" id="${pwId}-mask">••••••••</span>
          <span class="pw-text hidden" id="${pwId}-text" style="font-family:var(--font-mono)">${escapeHtml(w.password)}</span>
          <button class="pw-toggle" data-target="${pwId}" title="Passwort einblenden">👁</button>`;
      } else {
        pwCell = '<span class="text-muted">Vorhanden (Admin nötig)</span>';
      }
    }

    tr.innerHTML = `
      <td><strong>${escapeHtml(w.ssid)}</strong></td>
      <td>${escapeHtml(w.security || '–')}</td>
      <td>${conn}</td>
      <td>${pwCell}</td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);

  // Toggle-Buttons für Passwörter verdrahten
  container.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.target;
      const mask = document.getElementById(id + '-mask');
      const text = document.getElementById(id + '-text');
      if (!mask || !text) return;
      const visible = !text.classList.contains('hidden');
      mask.classList.toggle('hidden', visible);
      text.classList.toggle('hidden', !visible);
      btn.textContent = visible ? '👁' : '🙈';
    });
  });
}

// ─── Software-Tab ────────────────────────────────────────────────────────────

/** Initialisiert Sortierung und Live-Suche im Software-Tab. */
function initSoftwareTab() {
  // Spalten-Sortierung per Klick auf Thead
  document.querySelectorAll('#software-table thead th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (state.softwareSortCol === col) {
        state.softwareSortDir = state.softwareSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.softwareSortCol = col;
        state.softwareSortDir = 'asc';
      }
      if (state.lastSoftwareResult) renderSoftware(state.lastSoftwareResult);
    });
  });

  // Live-Suche
  document.getElementById('software-search')?.addEventListener('input', e => {
    if (state.lastSoftwareResult) renderSoftware(state.lastSoftwareResult, e.target.value.trim().toLowerCase());
  });
}

/** Rendert die Software-Tabelle mit optionalem Such-Filter. */
function renderSoftware(result, filter = '') {
  const tbody = document.getElementById('software-tbody');
  if (!tbody) return;

  // Alle Programme: installierte + Browser + Laufzeiten als getrennte Sektionen
  let programs = result.programs ?? [];

  // Filter anwenden
  if (filter) {
    programs = programs.filter(p =>
      p.name?.toLowerCase().includes(filter) ||
      p.publisher?.toLowerCase().includes(filter)
    );
  }

  // Sortieren
  programs = [...programs].sort((a, b) => {
    let va, vb;
    switch (state.softwareSortCol) {
      case 'version':   va = a.version ?? '';    vb = b.version ?? '';    break;
      case 'publisher': va = a.publisher ?? '';   vb = b.publisher ?? '';  break;
      case 'date':      va = a.install_date ?? ''; vb = b.install_date ?? ''; break;
      case 'size':      va = a.size_mb ?? 0;      vb = b.size_mb ?? 0;
                        return state.softwareSortDir === 'asc' ? va - vb : vb - va;
      default:          va = a.name ?? '';        vb = b.name ?? '';       break;
    }
    const cmp = String(va).localeCompare(String(vb), 'de', { sensitivity: 'base' });
    return state.softwareSortDir === 'asc' ? cmp : -cmp;
  });

  // Sort-Icons aktualisieren
  document.querySelectorAll('#software-table thead th[data-sort]').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.sort === state.softwareSortCol) {
      icon.textContent = state.softwareSortDir === 'asc' ? '↑' : '↓';
    } else {
      icon.textContent = '↕';
    }
  });

  tbody.innerHTML = '';

  if (programs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder">${filter ? 'Keine Treffer für „' + escapeHtml(filter) + '"' : 'Keine Programme gefunden.'}</td></tr>`;
    return;
  }

  const frag = document.createDocumentFragment();
  programs.forEach(p => {
    const tr = document.createElement('tr');

    const date = p.install_date && !p.install_date.startsWith('0001')
      ? formatDate(p.install_date) : '–';

    const size = p.size_mb > 0
      ? (p.size_mb >= 1000 ? `${(p.size_mb / 1024).toFixed(1)} GB` : `${Math.round(p.size_mb)} MB`)
      : '–';

    // Kopier-Button für Uninstall-String (nur wenn vorhanden)
    const copyBtn = p.uninstall_string
      ? `<button class="copy-btn" data-copy="${escapeHtml(p.uninstall_string)}" title="Uninstall-Befehl kopieren">📋</button>`
      : '<span class="text-muted">–</span>';

    tr.innerHTML = `
      <td>${escapeHtml(p.name ?? '–')}</td>
      <td class="mono-cell">${escapeHtml(p.version ?? '–')}</td>
      <td>${escapeHtml(p.publisher ?? '–')}</td>
      <td>${date}</td>
      <td style="text-align:right">${size}</td>
      <td style="text-align:center">${copyBtn}</td>`;

    frag.appendChild(tr);
  });

  tbody.appendChild(frag);

  // Kopier-Buttons verdrahten
  tbody.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch { /* Clipboard-API nicht verfügbar */ }
    });
  });

  // Zähler aktualisieren
  const total = result.programs?.length ?? 0;
  const shown = programs.length;
  setEl('software-count', filter ? `${shown} von ${total}` : `${total}`);
  updateSoftwareBadge(result);
}

function updateSoftwareBadge(result) {
  const count = result.programs?.length ?? 0;
  setBadge('badge-software', 'detail-software', 'OK',
    `${count} Programme gefunden`);
}

function updateNetworkBadge(result) {
  const connected = result.adapters?.filter(a => a.is_connected).length ?? 0;
  const total = result.adapters?.length ?? 0;
  const status = connected > 0 ? 'OK' : 'UNKNOWN';
  setBadge('badge-network', 'detail-network', status,
    `${connected}/${total} Adapter verbunden`);
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

  document.getElementById('btn-new-session')?.addEventListener('click', () => {
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

// ─── Tools-Tab ────────────────────────────────────────────────────────────────

function initToolsTab() {
  // ── Diagnose-Werkzeuge ────────────────────────────────────────────────────
  document.getElementById('tool-full-scan')?.addEventListener('click', () => {
    switchTab('dashboard');
    runFullScan();
  });

  document.getElementById('tool-clipboard')?.addEventListener('click', async () => {
    try {
      const text = await GetClipboard();
      consoleWrite('Zwischenablage:', text || '(leer)');
    } catch (err) {
      consoleWrite('Zwischenablage:', 'Fehler: ' + err);
    }
  });

  document.getElementById('tool-vault-backup')?.addEventListener('click', async () => {
    const btn = document.getElementById('tool-vault-backup');
    if (btn) btn.style.opacity = '0.5';
    try {
      consoleWrite('Vault-Backup', 'Erstelle Backup…');
      const path = await BackupVault();
      consoleWrite('Vault-Backup', 'Backup erstellt:\n' + path);
      addAction('Vault-Backup erstellt: ' + shortenPath(path), 'success');
    } catch (err) {
      consoleWrite('Vault-Backup', 'Fehler: ' + err);
      addAction('Vault-Backup fehlgeschlagen: ' + err, 'error');
    } finally {
      if (btn) btn.style.opacity = '';
    }
  });

  document.getElementById('tool-wifi-pw')?.addEventListener('click', () => {
    switchTab('network');
    // Ggf. Netzwerk-Scan starten wenn noch keine Daten
    if (!state.lastNetworkResult) runNetworkScan();
  });

  document.getElementById('tool-uptime')?.addEventListener('click', async () => {
    // Zuerst aus letztem Scan, sonst vom Backend lesen
    if (state.lastScanResult?.os?.last_boot_time) {
      const uptime = calcUptime(state.lastScanResult.os.last_boot_time);
      consoleWrite('Uptime (letzter Scan)', uptime);
      return;
    }
    try {
      const uptime = await GetUptime();
      consoleWrite('Uptime', uptime);
    } catch (err) {
      consoleWrite('Uptime', 'Fehler: ' + err + '\nTipp: Starte zuerst einen System-Scan.');
    }
  });

  document.getElementById('tool-drivers')?.addEventListener('click', () => {
    // Treiber-Export über Konsolen-Tool
    document.getElementById('console-tool').value = 'drivers';
    document.getElementById('console-target').value = '';
    runConsoleTool();
  });

  // ── Konsolen-Tools ────────────────────────────────────────────────────────
  document.getElementById('btn-console-run')?.addEventListener('click', runConsoleTool);
  document.getElementById('btn-console-clear')?.addEventListener('click', () => {
    const out = document.getElementById('console-output');
    if (out) out.innerHTML = '<span class="console-placeholder">Ausgabe geleert.</span>';
  });

  // Enter-Taste im Target-Input löst Ausführung aus
  document.getElementById('console-target')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') runConsoleTool();
  });

  // Placeholder-Text je nach Tool anpassen
  document.getElementById('console-tool')?.addEventListener('change', updateConsolePlaceholder);
  updateConsolePlaceholder();
}

function updateConsolePlaceholder() {
  const tool = document.getElementById('console-tool')?.value;
  const input = document.getElementById('console-target');
  if (!input) return;
  const placeholders = {
    ping:        'Hostname oder IP (z.B. google.com)',
    traceroute:  'Hostname oder IP (z.B. 8.8.8.8)',
    dns:         'Hostname (z.B. example.com)',
    netstat:     '(kein Ziel nötig)',
    arp:         '(kein Ziel nötig)',
    portscan:    'host oder host:80,443,3389 oder host:80-1024',
    drivers:     '(kein Ziel nötig)',
  };
  input.placeholder = placeholders[tool] ?? 'Ziel eingeben…';
}

async function runConsoleTool() {
  const tool   = document.getElementById('console-tool')?.value;
  const target = document.getElementById('console-target')?.value?.trim() ?? '';
  if (!tool) return;

  const runBtn = document.getElementById('btn-console-run');
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳ Läuft…'; }

  const label = document.getElementById('console-tool')?.options[
    document.getElementById('console-tool')?.selectedIndex
  ]?.text ?? tool;

  consoleWrite(`${label}${target ? ': ' + target : ''}`, '');

  try {
    const result = await RunConsoleTool(tool, target);
    consoleAppend(result);
  } catch (err) {
    consoleAppend('Fehler: ' + err);
  } finally {
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Ausführen'; }
  }
}

/** Schreibt einen Header + optionalen Text in die Konsolen-Ausgabe. */
function consoleWrite(header, body) {
  const out = document.getElementById('console-output');
  if (!out) return;
  const line = '═'.repeat(40);
  out.textContent = `${line}\n  ${header}\n${line}\n${body ? body + '\n' : ''}`;
  out.scrollTop = out.scrollHeight;
}

/** Hängt Text an die bestehende Konsolen-Ausgabe an. */
function consoleAppend(text) {
  const out = document.getElementById('console-output');
  if (!out) return;
  out.textContent += text;
  out.scrollTop = out.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Export ───────────────────────────────────────────────────────────────────

function initExport() {
  // Dropdown-Buttons
  document.getElementById('btn-export-html')?.addEventListener('click', () => runExport('html'));
  document.getElementById('btn-export-json')?.addEventListener('click', () => runExport('json'));

  // Dropdown öffnen/schließen
  const trigger = document.getElementById('btn-export');
  const dropdown = document.getElementById('export-dropdown');
  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown?.classList.remove('open'));

  // Modal schließen
  document.getElementById('export-modal-close')?.addEventListener('click', closeExportModal);
  document.getElementById('export-modal-ok')?.addEventListener('click', closeExportModal);
  document.getElementById('export-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'export-modal-overlay') closeExportModal();
  });
}

async function runExport(format) {
  document.getElementById('export-dropdown')?.classList.remove('open');

  const btn = document.getElementById('btn-export');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Exportiere…'; }

  try {
    const path = await ExportSession(format);
    showExportModal(format, path);
    addAction(`Bericht exportiert (${format.toUpperCase()}): ${shortenPath(path)}`, 'success');
  } catch (err) {
    showExportModal(format, null, String(err));
    addAction(`Export fehlgeschlagen: ${err}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📤 Exportieren ▾'; }
  }
}

function showExportModal(format, path, error) {
  const overlay = document.getElementById('export-modal-overlay');
  const title   = document.getElementById('export-modal-title');
  const body    = document.getElementById('export-modal-body');
  if (!overlay || !title || !body) return;

  if (error) {
    title.textContent = 'Export fehlgeschlagen';
    body.innerHTML = `<p class="export-error">⚠️ ${escapeHtml(error)}</p>`;
  } else {
    title.textContent = `Bericht erstellt (${format.toUpperCase()})`;
    body.innerHTML = `
      <p>Die Datei wurde erfolgreich gespeichert:</p>
      <div class="export-path">${escapeHtml(path)}</div>
      <p class="export-hint">Öffne die Datei mit dem Datei-Manager oder dem Browser.</p>
    `;
  }
  overlay.classList.remove('hidden');
}

function closeExportModal() {
  document.getElementById('export-modal-overlay')?.classList.add('hidden');
}

// ─── Einstellungen ────────────────────────────────────────────────────────────

function initSettings() {
  const overlay = document.getElementById('settings-modal-overlay');

  document.getElementById('btn-settings')?.addEventListener('click', openSettings);
  document.getElementById('settings-modal-close')?.addEventListener('click', closeSettings);
  document.getElementById('settings-cancel')?.addEventListener('click', closeSettings);
  overlay?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal-overlay') closeSettings();
  });
  document.getElementById('settings-save')?.addEventListener('click', saveSettings);

  // Logo-Picker: nativer Datei-Dialog, Datei wird in Vault kopiert
  document.getElementById('btn-pick-logo')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-pick-logo');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
      const path = await PickLogoFile();
      if (path) {
        document.getElementById('setting-logo-path').value = path;
        // Config sofort aktualisieren damit updateBrandingBar das neue Logo lädt
        if (state.config) {
          if (!state.config.branding) state.config.branding = {};
          state.config.branding.logo_path = path;
        }
        updateBrandingBar();
      }
    } catch (err) {
      addAction('Logo konnte nicht ausgewählt werden: ' + err, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📁 Auswählen'; }
    }
  });
}

function openSettings() {
  // Aktuelle Werte aus der Config laden
  const cfg = state.config;
  if (cfg) {
    document.getElementById('setting-company').value  = cfg.branding?.company_name    ?? '';
    document.getElementById('setting-technician').value = cfg.branding?.technician_name ?? '';
    document.getElementById('setting-logo-path').value = cfg.branding?.logo_path       ?? '';
    document.getElementById('setting-wifi-passwords').checked =
      cfg.defaults?.include_wifi_passwords ?? false;
  }
  document.getElementById('settings-modal-overlay')?.classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal-overlay')?.classList.add('hidden');
}

// Aktualisiert die Branding-Zeile über der Tab-Navigation anhand state.config
async function updateBrandingBar() {
  const branding = state.config?.branding;
  const bar  = document.getElementById('branding-bar');
  const logo = document.getElementById('branding-logo');
  const name = document.getElementById('branding-company');
  const tech = document.getElementById('branding-technician');
  const sep  = document.getElementById('branding-sep');
  if (!bar) return;

  const company    = branding?.company_name    ?? '';
  const technician = branding?.technician_name ?? '';

  if (!company && !technician) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  if (name) name.textContent = company;
  if (tech) tech.textContent = technician ? '👤 ' + technician : '';
  if (sep)  sep.classList.toggle('hidden', !company || !technician);

  // Logo asynchron laden
  if (logo) {
    try {
      const uri = await GetLogoBase64();
      if (uri) {
        logo.src = uri;
        logo.classList.remove('hidden');
      } else {
        logo.classList.add('hidden');
      }
    } catch {
      logo.classList.add('hidden');
    }
  }
}

async function saveSettings() {
  // Sicherheitsnetz: wenn config noch nicht geladen ist, Fallback-Objekt aufbauen
  if (!state.config) {
    state.config = { branding: {}, defaults: {}, ui: {}, logging: {}, backup: {} };
  }
  const cfg = state.config;
  if (!cfg.branding) cfg.branding = {};
  if (!cfg.defaults) cfg.defaults = {};

  cfg.branding.company_name    = document.getElementById('setting-company').value.trim();
  cfg.branding.technician_name = document.getElementById('setting-technician').value.trim();
  cfg.branding.logo_path       = document.getElementById('setting-logo-path').value.trim();
  cfg.defaults.include_wifi_passwords =
    document.getElementById('setting-wifi-passwords').checked;

  const btn = document.getElementById('settings-save');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Speichere…'; }

  try {
    await SaveConfig(cfg);
    state.config = cfg;
    addAction('Einstellungen gespeichert', 'success');
  } catch (err) {
    // Auch im Fehlerfall schließen — Nutzer soll nicht stecken bleiben
    addAction('Einstellungen konnten nicht dauerhaft gespeichert werden: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
    closeSettings();
    updateBrandingBar();
  }
}

// ─── Dashboard-Karten Navigation ──────────────────────────────────────────────

function initDashboardCardNav() {
  document.querySelectorAll('.card-nav[data-nav-tab]').forEach(card => {
    card.addEventListener('click', () => {
      const tab = card.dataset.navTab;
      if (tab) switchTab(tab);
    });
  });
}
