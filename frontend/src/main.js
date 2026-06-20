/**
 * AdminKit – Frontend-Einstiegspunkt
 *
 * Wails-Bindings werden über window.go.main.App.* aufgerufen.
 * Alle Methoden sind in app.go definiert und werden von Wails beim Build generiert.
 */
import './style.css';
import QRCode from 'qrcode';
import {
  GetAppVersion, GetVaultPath, GetConfig, NewSession,
  ScanSystem, SaveSystemScan,
  ScanNetwork, SaveNetworkScan,
  ScanSoftware, SaveSoftwareScan,
  ScanPrinters, SavePrinterScan,
  ScanAutostart, ScanServices, ScanEvents,
  ScanBrowserExtensions,
  ScanNetworkBasic,
  GetSessions,
  StartService, StopService,
  RunConsoleTool, BackupVault, GetClipboard, GetUptime, GetPlatform, SaveTerminalLog,
  ExportSession, ExportCSV,
  SaveConfig,
  PickLogoFile,
  GetLogoBase64,
  OpenFile, RevealFile,
  CheckVirusTotalItems,
  HashFileForVT, OpenVTInBrowser, PickFileForVTScan,
  CallAI, CallLocalAI, GetAvailableAIProviders,
  GetOpenRouterModels,
  RunRawCommand,
  GetProcesses,
  GetVTWhitelist, AddToVTWhitelist, RemoveFromVTWhitelist, SaveVTAuditLog,
  UploadFileToVirusTotal,
  GetNetworkConnections,
  ScanUsers,
  ScanScheduledTasks,
  ScanConfigProfiles,
  ScanUSBDevices,
  PickArchiveDirectory,
  ArchiveVault,
  GetHealthScore,
} from '../wailsjs/go/main/App';

// ─── Zustand ─────────────────────────────────────────────────────────────────

const state = {
  theme: detectInitialTheme(),
  activeTab: 'dashboard',
  currentSession: null,           // Name der aktiven Session
  currentSessionPath: null,       // Absoluter Pfad zur Session im Vault
  lastScanResult: null,           // Letztes System-ScanResult
  lastNetworkResult: null,        // Letztes Netzwerk-ScanResult
  lastSoftwareResult: null,       // Letztes Software-ScanResult
  lastPrinterResult: null,        // Letztes Drucker-ScanResult
  lastAutostartResult: null,      // Letztes Autostart-ScanResult
  lastServicesResult: null,       // Letztes Dienste-ScanResult
  lastEventsResult: null,         // Letztes Ereignislog-ScanResult
  lastBrowserExtResult: null,     // Letztes Browser-Extensions-ScanResult
  softwareSortCol: 'name',        // Aktive Sortierspalte
  softwareSortDir: 'asc',         // Sortierrichtung
  isScanning: false,
  config: null,                   // Geladene Konfiguration (config.yaml)
  // VT / KI Auswahl
  selectedItems: new Map(),       // key → {name, path, type, extra}
  vtAbortController: null,        // Für Abbrechen des VT-Scans
  platform: 'darwin',             // Wird beim Boot via GetPlatform() gesetzt
  // Terminal
  terminalHistory: [],            // Befehlsverlauf
  terminalHistoryIdx: -1,         // Aktueller Verlaufsindex
  consoleHistory: [],             // Konsolen-Verlauf (für Presets)
  consoleHistoryIdx: -1,
};

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  initTabs();
  initThemeToggle();
  initSessionModal();
  initSessionHistory();
  initScanButtons();
  initSoftwareTab();
  initSystemSearch();
  initToolsTab();
  initExport();
  initSettings();
  initDashboardCardNav();
  initPrinterScan();
  initCollapsibleSections();
  initBackToTop();
  initQRModal();
  initScanSummaryModal();
  initActionLog();
  initActionBar();
  initToolsExtended();
  initPlatformTools();
  applyPlatformClass();
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

// ─── Platform-Erkennung ──────────────────────────────────────────────────────

function applyPlatformClass() {
  if (navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac OS')) {
    document.body.classList.add('platform-mac');
  }
}

// ─── Zusammenklappbare Sektionen ──────────────────────────────────────────────

function initCollapsibleSections() {
  // Event-Delegation für alle .section-title – auch dynamisch hinzugefügte
  document.addEventListener('click', (e) => {
    const title = e.target.closest('.info-section > .section-title');
    if (!title) return;
    title.closest('.info-section').classList.toggle('collapsed');
  });
}

// ─── Zurück-nach-oben ────────────────────────────────────────────────────────

function initBackToTop() {
  const btn = document.getElementById('btn-back-to-top');
  if (!btn) return;

  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.addEventListener('scroll', () => {
      btn.classList.toggle('visible', panel.scrollTop > 200);
    });
  });

  btn.addEventListener('click', () => {
    const active = document.querySelector('.tab-panel.active');
    if (active) active.scrollTo({ top: 0, behavior: 'smooth' });
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
  document.getElementById('btn-scan-connections')?.addEventListener('click', () => runConnectionsScan());
  document.getElementById('connections-filter')?.addEventListener('change', filterConnections);
  document.getElementById('connections-search')?.addEventListener('input', filterConnections);
  document.getElementById('btn-scan-users')?.addEventListener('click', () => runUsersScan());
  document.getElementById('btn-scan-tasks')?.addEventListener('click', () => runTasksScan());
  document.getElementById('btn-scan-profiles')?.addEventListener('click', () => runProfilesScan());
  document.getElementById('btn-scan-usb')?.addEventListener('click', () => runUSBScan());
}

function initPrinterScan() {
  document.getElementById('btn-scan-printers')?.addEventListener('click', () => runPrinterScan());
  document.getElementById('btn-scan-autostart')?.addEventListener('click', () => runAutostartScan());
  document.getElementById('btn-scan-services')?.addEventListener('click', () => runServicesScan());
  document.getElementById('btn-scan-events')?.addEventListener('click', () => runEventsScan());
  document.getElementById('btn-scan-extensions')?.addEventListener('click', () => runBrowserExtScan());
  document.getElementById('btn-scan-processes')?.addEventListener('click', () => runProcessScan());
}

/** Vollständiger Scan: alle Scanner nacheinander.
 *  Netzwerk-Scan läuft im Basic-Modus (kein Passwort-Dialog). */
// Vollscan-Schritte: [Label, async Funktion]
const FULLSCAN_STEPS = [
  ['System',              () => runSystemScan()],
  ['Autostart',          () => runAutostartScan()],
  ['Dienste',            () => runServicesScan()],
  ['Ereignisse',         () => runEventsScan()],
  ['Drucker',            () => runPrinterScan()],
  ['Netzwerk',           () => runNetworkScanBasic()],
  ['Software',           () => runSoftwareScan()],
  ['Browser-Extensions', () => runBrowserExtScan()],
  ['Benutzerkonten',     () => runUsersScan()],
  ['Geplante Aufgaben',  () => runTasksScan()],
  ['Konfigurationsprofile', () => runProfilesScan()],
  ['USB-Geräte',         () => runUSBScan()],
];

function setFullscanProgress(step, total, label) {
  const el = document.getElementById('fullscan-progress');
  const bar = document.getElementById('fullscan-bar');
  const lbl = document.getElementById('fullscan-label');
  if (!el) return;
  if (step === 0) {
    el.classList.remove('hidden');
    if (bar) bar.style.width = '0%';
  }
  const pct = total > 0 ? Math.round((step / total) * 100) : 0;
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = label
    ? `Schritt ${step} / ${total} — ${label}`
    : `Abgeschlossen`;
  if (step >= total) {
    setTimeout(() => el.classList.add('hidden'), 800);
  }
}

async function updateHealthScore() {
  try {
    const result = await GetHealthScore();
    const ring  = document.getElementById('health-score-ring');
    const value = document.getElementById('health-score-value');
    const label = document.getElementById('health-score-label');
    const deductList = document.getElementById('health-deductions');
    if (!ring) return;

    ring.classList.remove('score-green', 'score-yellow', 'score-red');
    ring.classList.add('score-' + result.color);

    value.textContent = result.score;

    label.className = 'health-score-label score-' + result.color;
    label.textContent = result.label + ' (' + result.score + '/100)';

    deductList.innerHTML = '';
    if (result.deductions && result.deductions.length > 0) {
      deductList.classList.remove('hidden');
      for (const d of result.deductions) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${d.label}</span><span class="ded-pts">−${d.points}</span>`;
        deductList.appendChild(li);
      }
    } else {
      deductList.classList.add('hidden');
    }
  } catch (e) {
    // Score nicht verfügbar — still ignorieren
  }
}

async function runFullScan() {
  switchTab('system');
  // Alte Ergebnisse löschen damit die Zusammenfassung nur den aktuellen Scan zeigt
  state.lastScanResult = null;
  state.lastAutostartResult = null;
  state.lastServicesResult = null;
  state.lastEventsResult = null;
  state.lastPrinterResult = null;
  state.lastNetworkResult = null;
  state.lastSoftwareResult = null;
  state.lastBrowserExtResult = null;

  const total = FULLSCAN_STEPS.length;
  setFullscanProgress(0, total, FULLSCAN_STEPS[0][0]);

  for (let i = 0; i < FULLSCAN_STEPS.length; i++) {
    const [label, fn] = FULLSCAN_STEPS[i];
    setFullscanProgress(i + 1, total, label);
    await fn();
  }

  setFullscanProgress(total, total, null);
  showScanSummary();
  await updateHealthScore();

  if (state.config?.defaults?.auto_vt_scan) {
    const vtKey = state.config?.api_keys?.virustotal ?? '';
    if (vtKey) {
      runAutoVTScan();
    } else {
      showToast('Auto-VT-Scan übersprungen — kein VirusTotal-API-Key konfiguriert.');
    }
  }
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
    renderSecurity(result.security);
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

/** Netzwerk-Scan ohne WiFi-Passwörter — für den Vollständigen Scan. */
async function runNetworkScanBasic() {
  if (state.isScanning) return;
  state.isScanning = true;
  setStatus('Netzwerk-Scan läuft…');
  setScanButtonsDisabled(true);
  addAction('Netzwerk-Scan (Basic) gestartet', 'info');

  setPlaceholder('adapter-info', 'Scanne Netzwerkadapter…');
  setPlaceholder('shares-info',  'Scanne Netzlaufwerke…');
  setPlaceholder('wifi-info',    'Scanne WiFi-Profile…');

  try {
    const result = await ScanNetworkBasic();
    state.lastNetworkResult = result;
    renderAdapters(result.adapters);
    renderShares(result.shares);
    renderWiFi(result.wifi);
    updateNetworkBadge(result);

    if (state.currentSessionPath) {
      await SaveNetworkScan(result, state.currentSessionPath);
    }

    logScanErrors(result.errors, 'Netzwerk-Scan');
    setStatus('Netzwerk-Scan abgeschlossen');
  } catch (err) {
    addAction('Netzwerk-Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim Netzwerk-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

let allConnections = [];

async function runConnectionsScan() {
  const btn = document.getElementById('btn-scan-connections');
  const section = document.getElementById('connections-section');
  const body = document.getElementById('connections-body');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  if (section) section.style.display = '';
  if (body) body.innerHTML = '<tr><td colspan="6" class="info-placeholder">Verbindungen werden geladen…</td></tr>';
  try {
    allConnections = await GetNetworkConnections() ?? [];
    setEl('connections-count', allConnections.length.toString());
    renderConnections(allConnections);
    setStatus(`Verbindungs-Scan: ${allConnections.length} Verbindungen`);
    addAction(`Verbindungs-Scan: ${allConnections.length} aktive Verbindungen`, 'info');
  } catch (err) {
    if (body) body.innerHTML = `<tr><td colspan="6" class="info-placeholder">Fehler: ${escapeHtml(String(err))}</td></tr>`;
    addAction('Verbindungs-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Verbindungen'; }
  }
}

function filterConnections() {
  const stateFilter = document.getElementById('connections-filter')?.value ?? '';
  const search = (document.getElementById('connections-search')?.value ?? '').toLowerCase();
  const filtered = allConnections.filter(c => {
    if (stateFilter && c.state !== stateFilter) return false;
    if (search) {
      const haystack = `${c.process_name} ${c.remote_addr} ${c.local_addr} ${c.local_port} ${c.remote_port} ${c.state}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  renderConnections(filtered);
}

function renderConnections(conns) {
  const body = document.getElementById('connections-body');
  if (!body) return;
  if (!conns || conns.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="info-placeholder">Keine Verbindungen gefunden.</td></tr>';
    return;
  }
  const stateClass = s => s === 'ESTABLISHED' ? 'conn-established' : s === 'LISTEN' ? 'conn-listen' : s === 'TIME_WAIT' ? 'conn-timewait' : '';
  body.innerHTML = conns.map(c => {
    const remote = c.remote_addr && c.remote_port ? `${c.remote_addr}:${c.remote_port}` : '–';
    const local = c.local_addr ? `${c.local_addr}:${c.local_port}` : '–';
    const sc = stateClass(c.state);
    return `<tr>
      <td><span class="proto-badge">${escapeHtml(c.protocol)}</span></td>
      <td class="mono">${escapeHtml(local)}</td>
      <td class="mono">${escapeHtml(remote)}</td>
      <td><span class="conn-state ${sc}">${escapeHtml(c.state || '–')}</span></td>
      <td class="mono">${c.pid || '–'}</td>
      <td>${escapeHtml(c.process_name || '–')}</td>
    </tr>`;
  }).join('');
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

async function runPrinterScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  setStatus('Drucker-Scan läuft…');
  setScanButtonsDisabled(true);
  addAction('Drucker-Scan gestartet', 'info');
  setPlaceholder('printer-info', 'Scanne Drucker…');

  try {
    const result = await ScanPrinters();
    state.lastPrinterResult = result;
    renderPrinters(result.printers);

    if (state.currentSessionPath) {
      await SavePrinterScan(result, state.currentSessionPath);
      addAction('Drucker-Scan in Vault gespeichert', 'success');
    }

    logScanErrors(result.errors, 'Drucker-Scan');
    setStatus('Drucker-Scan abgeschlossen');
  } catch (err) {
    console.error('Drucker-Scan fehlgeschlagen:', err);
    addAction('Drucker-Scan fehlgeschlagen: ' + err, 'error');
    setPlaceholder('printer-info', 'Fehler beim Drucker-Scan: ' + err);
    setStatus('Fehler beim Drucker-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

function renderPrinters(printers) {
  const container = document.getElementById('printer-info');
  if (!container) return;

  if (!printers?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Drucker gefunden.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = `
    <thead><tr>
      <th>Name</th>
      <th>Treiber</th>
      <th>Port / IP</th>
      <th>Status</th>
      <th>Typ</th>
      <th>Freigabe</th>
    </tr></thead>`;

  const tbody = document.createElement('tbody');
  printers.forEach(p => {
    const statusIcon = {
      'Bereit': '🟢', 'Druckt': '🔵', 'Offline': '🔴',
      'Fehler': '🔴', 'Pausiert': '🟡',
    }[p.status] ?? '⚪';
    const def = p.is_default ? ' ⭐' : '';
    const netInfo = p.is_network
      ? `🌐 Netzwerk${p.ip_address ? ' (' + escapeHtml(p.ip_address) + ')' : ''}`
      : '🖥 Lokal';
    const share = p.is_shared ? (p.share_name ? escapeHtml(p.share_name) : '✓') : '–';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(p.name)}${def}</strong></td>
      <td class="mono-cell" style="font-size:11px">${escapeHtml(p.driver || '–')}</td>
      <td class="mono-cell" style="font-size:11px">${escapeHtml(p.port || '–')}</td>
      <td>${statusIcon} ${escapeHtml(p.status || '–')}</td>
      <td>${netInfo}</td>
      <td>${share}</td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = `<p class="section-meta">${printers.length} Drucker gefunden</p>`;
  container.appendChild(table);
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
  ['btn-full-scan', 'btn-scan-system', 'btn-scan-network', 'btn-scan-software',
   'btn-scan-printers', 'btn-scan-autostart', 'btn-scan-services', 'btn-scan-events',
   'btn-scan-extensions', 'btn-scan-processes'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

// ─── Autostart-Scanner ────────────────────────────────────────────────────────

async function runAutostartScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  setScanButtonsDisabled(true);
  setStatus('Autostart-Scan läuft…');
  addAction('Autostart-Scan gestartet', 'info');
  setPlaceholder('autostart-info', 'Scanne Autostart-Quellen…');

  try {
    const result = await ScanAutostart();
    state.lastAutostartResult = result;
    renderAutostart(result.entries);
    setEl('autostart-count', result.entries?.length ?? 0);
    logScanErrors(result.errors, 'Autostart-Scan');
    setStatus('Autostart-Scan abgeschlossen');
  } catch (err) {
    console.error('Autostart-Scan fehlgeschlagen:', err);
    setPlaceholder('autostart-info', 'Fehler: ' + err);
    addAction('Autostart-Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim Autostart-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

function renderAutostart(entries) {
  const container = document.getElementById('autostart-info');
  if (!container) return;
  if (!entries?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Autostart-Einträge gefunden.</div>';
    return;
  }

  // Gruppiert nach Location
  const groups = {};
  entries.forEach(e => {
    if (!groups[e.location]) groups[e.location] = [];
    groups[e.location].push(e);
  });

  container.innerHTML = '';
  for (const [loc, items] of Object.entries(groups)) {
    const section = document.createElement('div');
    section.className = 'autostart-group';

    // Drittanbieter-Einträge hervorheben
    const thirdPartyCount = items.filter(e => !e.is_system).length;
    const badge = thirdPartyCount > 0
      ? ` <span class="badge-warning-sm">${thirdPartyCount} Drittanbieter</span>` : '';

    section.innerHTML = `<div class="autostart-group-title">${escapeHtml(loc)}${badge}</div>`;

    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = `<thead><tr><th class="cb-col"><input type="checkbox" class="check-all" title="Alle auswählen"></th><th>Name</th><th>Pfad / Befehl</th><th>System</th><th>Aktiv</th></tr></thead>`;
    const tbody = document.createElement('tbody');

    items.forEach(e => {
      const tr = document.createElement('tr');
      if (!e.is_system) tr.classList.add('highlight-third-party');
      const sys = e.is_system ? '✓' : '<span class="text-warning">⚠ Drittanbieter</span>';
      const active = e.is_enabled ? '✓' : '–';
      const cbId = `autostart:${e.name}:${e.path || ''}`;
      tr.innerHTML = `
        <td class="cb-col"><input type="checkbox" class="item-check" data-id="${escapeHtml(cbId)}" data-name="${escapeHtml(e.name)}" data-path="${escapeHtml(e.path || '')}" data-type="autostart"></td>
        <td><strong>${escapeHtml(e.name)}</strong></td>
        <td class="mono-cell" style="font-size:11px;word-break:break-all">${escapeHtml(e.path || '–')}</td>
        <td style="text-align:center">${sys}</td>
        <td style="text-align:center">${active}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    section.appendChild(table);
    container.appendChild(section);

    // "Alle auswählen"-Checkbox
    table.querySelector('.check-all')?.addEventListener('change', e => {
      table.querySelectorAll('.item-check').forEach(cb => {
        cb.checked = e.target.checked;
        toggleItemSelection(cb, e.target.checked);
      });
      updateActionBar();
    });
    // Einzel-Checkboxen
    tbody.addEventListener('change', e => {
      const cb = e.target.closest('.item-check');
      if (!cb) return;
      toggleItemSelection(cb, cb.checked);
      updateActionBar();
    });
  }
}

// ─── Dienste-Scanner ──────────────────────────────────────────────────────────

async function runServicesScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  setScanButtonsDisabled(true);
  setStatus('Dienste-Scan läuft…');
  addAction('Dienste-Scan gestartet', 'info');
  setPlaceholder('services-info', 'Scanne Dienste…');

  try {
    const result = await ScanServices();
    state.lastServicesResult = result;
    renderServices(result.services);
    setEl('services-count', result.services?.length ?? 0);
    logScanErrors(result.errors, 'Dienste-Scan');
    setStatus('Dienste-Scan abgeschlossen');
  } catch (err) {
    setPlaceholder('services-info', 'Fehler: ' + err);
    addAction('Dienste-Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim Dienste-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

function renderServices(svcList) {
  const container = document.getElementById('services-info');
  if (!container) return;
  if (!svcList?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Dienste gefunden.</div>';
    return;
  }

  // Nur Drittanbieter-Auto-Dienste prominent, Rest zusammengefasst
  const autoThird = svcList.filter(s => s.start_type === 'Automatisch' && !s.is_system);
  const autoSystem = svcList.filter(s => s.start_type === 'Automatisch' && s.is_system);
  const running = svcList.filter(s => s.state === 'Läuft' && s.start_type !== 'Automatisch' && !s.is_system);

  container.innerHTML = `<p class="section-meta">${svcList.length} Dienste gesamt · ${autoThird.length} Drittanbieter-Autostart · ${svcList.filter(s=>s.state==='Läuft').length} laufend</p>`;

  if (autoThird.length > 0) {
    const tbl = buildServicesTable(autoThird, '⚠ Drittanbieter – Automatisch');
    container.appendChild(tbl);
  }
  if (autoSystem.length > 0) {
    const tbl = buildServicesTable(autoSystem, '✓ System – Automatisch');
    container.appendChild(tbl);
  }
  if (running.length > 0) {
    const tbl = buildServicesTable(running, 'Laufende Drittanbieter-Dienste (Manuell)');
    container.appendChild(tbl);
  }
}

function buildServicesTable(list, title) {
  const wrap = document.createElement('div');
  wrap.className = 'autostart-group';
  wrap.innerHTML = `<div class="autostart-group-title">${escapeHtml(title)}</div>`;
  const tbl = document.createElement('table');
  tbl.className = 'data-table';
  tbl.innerHTML = '<thead><tr><th class="cb-col"><input type="checkbox" class="check-all" title="Alle auswählen"></th><th>Name</th><th>Starttyp</th><th>Status</th><th>Aktion</th></tr></thead>';
  const tbody = document.createElement('tbody');
  list.forEach(s => {
    const tr = document.createElement('tr');
    tr.dataset.serviceName = s.name;
    const stateIcon = s.state === 'Läuft' ? '🟢' : (s.state === 'Gestoppt' ? '🔴' : '🟡');
    const isRunning = s.state === 'Läuft';
    const startBtn = !isRunning
      ? `<button class="svc-btn svc-start" data-name="${escapeHtml(s.name)}" title="Dienst starten">▶ Starten</button>`
      : '';
    const stopBtn = isRunning
      ? `<button class="svc-btn svc-stop" data-name="${escapeHtml(s.name)}" title="Dienst beenden">■ Beenden</button>`
      : '';
    const cbId = `service:${s.name}`;
    tr.innerHTML = `
      <td class="cb-col"><input type="checkbox" class="item-check" data-id="${escapeHtml(cbId)}" data-name="${escapeHtml(s.display_name)}" data-path="${escapeHtml(s.executable_path || '')}" data-type="service"></td>
      <td><strong>${escapeHtml(s.display_name)}</strong><br><span class="text-muted" style="font-size:11px">${escapeHtml(s.name)}</span></td>
      <td>${escapeHtml(s.start_type)}</td>
      <td>${stateIcon} ${escapeHtml(s.state)}</td>
      <td>${startBtn}${stopBtn}</td>`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  // "Alle auswählen"-Checkbox
  tbl.querySelector('.check-all')?.addEventListener('change', e => {
    tbl.querySelectorAll('.item-check').forEach(cb => {
      cb.checked = e.target.checked;
      toggleItemSelection(cb, e.target.checked);
    });
    updateActionBar();
  });
  tbody.addEventListener('change', e => {
    const cb = e.target.closest('.item-check');
    if (!cb) return;
    toggleItemSelection(cb, cb.checked);
    updateActionBar();
  });

  // Start/Stop-Button-Handler
  wrap.addEventListener('click', async (e) => {
    const btn = e.target.closest('.svc-btn');
    if (!btn) return;
    const name = btn.dataset.name;
    const isStart = btn.classList.contains('svc-start');
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      if (isStart) {
        await StartService(name);
        addAction(`Dienst gestartet: ${name}`, 'success');
      } else {
        await StopService(name);
        addAction(`Dienst beendet: ${name}`, 'success');
      }
      // Dienste-Liste neu laden
      const result = await ScanServices();
      renderServices(result.services);
      setEl('services-count', result.services?.length ?? 0);
    } catch (err) {
      addAction(`Dienst-Aktion fehlgeschlagen (${name}): ${err}`, 'error');
      btn.disabled = false;
      btn.textContent = isStart ? '▶ Starten' : '■ Beenden';
    }
  });

  return wrap;
}

// ─── Event-Log-Scanner ───────────────────────────────────────────────────────

async function runEventsScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  setScanButtonsDisabled(true);
  setStatus('Event-Log-Scan läuft…');
  addAction('Event-Log-Scan gestartet', 'info');
  setPlaceholder('events-info', 'Lese Ereignis-Log…');

  try {
    const result = await ScanEvents();
    state.lastEventsResult = result;
    renderEvents(result.events);
    setEl('events-count', result.events?.length ?? 0);
    logScanErrors(result.errors, 'Event-Log-Scan');
    setStatus('Event-Log-Scan abgeschlossen');
  } catch (err) {
    setPlaceholder('events-info', 'Fehler: ' + err);
    addAction('Event-Log-Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim Event-Log-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

function renderEvents(evtList) {
  const container = document.getElementById('events-info');
  if (!container) return;
  if (!evtList?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine kritischen Ereignisse in den letzten 7 Tagen.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th>Zeit</th><th>Level</th><th>Quelle</th><th>Event-ID</th><th>Meldung</th></tr></thead>';
  const tbody = document.createElement('tbody');

  evtList.forEach(e => {
    const tr = document.createElement('tr');
    const levelIcon = e.level === 'Kritisch' ? '🔴' : (e.level === 'Fehler' ? '🟠' : '🟡');
    const time = e.time ? new Date(e.time).toLocaleString('de-DE') : '–';
    tr.innerHTML = `
      <td style="white-space:nowrap;font-size:11px">${escapeHtml(time)}</td>
      <td>${levelIcon} ${escapeHtml(e.level)}</td>
      <td style="font-size:11px">${escapeHtml(e.source)}</td>
      <td style="text-align:center">${e.event_id || '–'}</td>
      <td style="font-size:12px">${escapeHtml(e.message)}</td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = `<p class="section-meta">${evtList.length} kritische Ereignisse</p>`;
  container.appendChild(table);
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

  // Akku-Zeile am Ende der Info-Grid einfügen
  if (hw.battery?.present) {
    const bat = hw.battery;
    const pct = bat.charge_pct ?? 0;
    const icon = pct > 80 ? '🔋' : pct > 30 ? '🪫' : '🔴';
    const remaining = bat.remaining_minutes > 0
      ? ` · ${Math.floor(bat.remaining_minutes / 60)}:${String(bat.remaining_minutes % 60).padStart(2, '0')} verbleibend`
      : '';
    rows.push(['Akku', `${icon} ${pct}% – ${bat.status}${remaining}`]);
  }

  setInfoGrid('hw-info', rows);

  // Speichernutzung (Volume-Balken unterhalb der Info-Grid)
  if (hw.volumes?.length > 0) {
    const container = document.getElementById('hw-info');
    const section = document.createElement('div');
    section.className = 'hw-volumes';

    const title = document.createElement('div');
    title.className = 'hw-volumes-title';
    title.textContent = 'Speichernutzung';
    section.appendChild(title);

    hw.volumes.forEach(vol => {
      const pct = vol.total_gb > 0 ? Math.round((vol.used_gb / vol.total_gb) * 100) : 0;
      const fillClass = pct > 90 ? 'fill-critical' : pct > 75 ? 'fill-warning' : 'fill-ok';
      const item = document.createElement('div');
      item.className = 'hw-volume-item';
      item.innerHTML = `
        <div class="hw-volume-header">
          <span class="hw-volume-name">${escapeHtml(vol.letter)}</span>
          <span class="hw-volume-pct">${pct}%</span>
        </div>
        <div class="hw-volume-stats">${vol.used_gb} GB belegt &middot; ${vol.free_gb} GB frei &middot; ${vol.total_gb} GB gesamt</div>
        <div class="hw-volume-bar-bg">
          <div class="hw-volume-bar-fill ${fillClass}" style="width:${Math.min(pct, 100)}%"></div>
        </div>`;
      section.appendChild(item);
    });

    container.appendChild(section);
  }
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
  setEl('wifi-count', profiles?.length ?? 0);
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
        const pwId = `wifi-pw-${idx}`;
        pwCell = `
          <span class="pw-mask" id="${pwId}-mask">••••••••</span>
          <span class="pw-text hidden" id="${pwId}-text" style="font-family:var(--font-mono)">${escapeHtml(w.password)}</span>
          <button class="pw-toggle" data-target="${pwId}" title="Passwort einblenden">👁</button>
          <button class="qr-btn" data-ssid="${escapeHtml(w.ssid)}" data-pw="${escapeHtml(w.password)}" data-sec="${escapeHtml(w.security || 'WPA')}" title="QR-Code anzeigen" style="margin-left:6px">📱</button>`;
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

  // QR-Code-Buttons verdrahten
  container.querySelectorAll('.qr-btn').forEach(btn => {
    btn.addEventListener('click', () => showWiFiQR(btn.dataset.ssid, btn.dataset.pw, btn.dataset.sec));
  });
}

// ─── Sicherheit-Rendering ─────────────────────────────────────────────────────

function renderSecurity(sec) {
  const container = document.getElementById('security-info');
  if (!container) return;
  if (!sec) {
    container.innerHTML = '<div class="info-placeholder">Keine Sicherheitsdaten (nur Windows).</div>';
    return;
  }

  container.innerHTML = '';

  // Allgemeine Sicherheitsstatus-Zeilen
  const isMac = sec.platform === 'darwin';
  const rows = [];

  if (sec.firewall_known) {
    rows.push(['Firewall', sec.firewall_enabled
      ? '<span style="color:var(--color-success)">✓ Aktiv</span>'
      : '<span style="color:var(--color-error)">✗ Deaktiviert</span>']);
  }
  if (sec.defender_version || sec.defender_enabled) {
    const defLabel = isMac ? 'Gatekeeper / XProtect' : 'Windows Defender';
    rows.push([defLabel, sec.defender_enabled
      ? '<span style="color:var(--color-success)">✓ Aktiv</span>'
      : '<span style="color:var(--color-error)">✗ Deaktiviert</span>']);
    if (sec.defender_version) rows.push([isMac ? 'Schutz-Version' : 'Defender-Version', sec.defender_version]);
  }
  if (sec.rdp_enabled !== undefined) {
    const rdpLabel = isMac ? 'Remote Login (SSH)' : 'RDP';
    const rdpStr = sec.rdp_enabled
      ? `<span style="color:var(--color-warning)">Aktiviert (Port ${sec.rdp_port || (isMac ? 22 : 3389)})</span>${!isMac ? (sec.nla_enabled ? ' · NLA: ✓' : ' · <span style="color:var(--color-error)">NLA: ✗</span>') : ''}`
      : '<span style="color:var(--color-success)">✓ Deaktiviert</span>';
    rows.push([rdpLabel, rdpStr]);
  }

  if (rows.length > 0) {
    container.appendChild(buildInfoGrid(rows, true));
  }

  // BitLocker / FileVault-Volumes
  if (sec.bitlocker_volumes?.length > 0) {
    const title = document.createElement('div');
    title.className = 'autostart-group-title';
    title.textContent = isMac ? 'FileVault' : 'BitLocker';
    container.appendChild(title);

    const tbl = document.createElement('table');
    tbl.className = 'data-table';
    tbl.innerHTML = '<thead><tr><th>Laufwerk</th><th>Verschlüsselt</th><th>Status</th></tr></thead>';
    const tbody = document.createElement('tbody');
    sec.bitlocker_volumes.forEach(v => {
      const tr = document.createElement('tr');
      const icon = v.encrypted ? '🔒' : '🔓';
      tr.innerHTML = `<td>${escapeHtml(v.drive)}</td><td>${icon} ${v.encrypted ? 'Ja' : 'Nein'}</td><td>${escapeHtml(v.status || '–')}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    container.appendChild(tbl);
  }

  // Lokale Freigaben
  if (sec.local_shares?.length > 0) {
    const userShares = sec.local_shares.filter(s => !s.is_system);
    const sysShares  = sec.local_shares.filter(s => s.is_system);

    const renderShareTable = (title, shares) => {
      if (shares.length === 0) return;
      const groupTitle = document.createElement('div');
      groupTitle.className = 'autostart-group-title';
      groupTitle.textContent = title;
      container.appendChild(groupTitle);

      const tbl = document.createElement('table');
      tbl.className = 'data-table';
      tbl.innerHTML = '<thead><tr><th>Name</th><th>Pfad</th><th>Beschreibung</th></tr></thead>';
      const tbody = document.createElement('tbody');
      shares.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${escapeHtml(s.name)}</strong></td><td class="mono-cell" style="font-size:11px">${escapeHtml(s.path || '–')}</td><td style="font-size:11px">${escapeHtml(s.description || '–')}</td>`;
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      container.appendChild(tbl);
    };

    renderShareTable(`📂 Freigegebene Ordner (${userShares.length} Benutzer-Freigaben)`, userShares);
    renderShareTable(`🔧 System-Freigaben (${sysShares.length})`, sysShares);
  } else if (sec.local_shares !== undefined) {
    const p = document.createElement('p');
    p.className = 'section-meta';
    p.textContent = 'Keine lokalen Netzwerkfreigaben gefunden.';
    container.appendChild(p);
  }
}

// ─── Browser-Extensions-Scanner ───────────────────────────────────────────────

async function runBrowserExtScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  setScanButtonsDisabled(true);
  setStatus('Browser-Extensions-Scan läuft…');
  addAction('Browser-Extensions-Scan gestartet', 'info');
  setPlaceholder('extensions-info', 'Scanne Browser-Erweiterungen…');

  try {
    const result = await ScanBrowserExtensions();
    state.lastBrowserExtResult = result;
    renderBrowserExtensions(result.extensions);
    setEl('extensions-count', result.extensions?.length ?? 0);
    logScanErrors(result.errors, 'Browser-Extensions-Scan');
    setStatus('Browser-Extensions-Scan abgeschlossen');
  } catch (err) {
    setPlaceholder('extensions-info', 'Fehler: ' + err);
    addAction('Browser-Extensions-Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim Browser-Extensions-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

function renderBrowserExtensions(extensions) {
  const container = document.getElementById('extensions-info');
  if (!container) return;
  if (!extensions?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Browser-Erweiterungen gefunden.</div>';
    return;
  }

  // Nach Browser gruppieren
  const groups = {};
  extensions.forEach(e => {
    if (!groups[e.browser]) groups[e.browser] = [];
    groups[e.browser].push(e);
  });

  container.innerHTML = '';
  for (const [browser, exts] of Object.entries(groups)) {
    const wrap = document.createElement('div');
    wrap.className = 'autostart-group';
    wrap.innerHTML = `<div class="autostart-group-title">🌐 ${escapeHtml(browser)} (${exts.length})</div>`;

    const tbl = document.createElement('table');
    tbl.className = 'data-table';
    tbl.innerHTML = `<thead><tr><th class="cb-col"><input type="checkbox" class="check-all" title="Alle auswählen"></th><th>Name</th><th>Version</th><th>ID</th><th>Status</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    exts.forEach(ext => {
      const tr = document.createElement('tr');
      const status = ext.enabled ? '✓ Aktiv' : '– Deaktiviert';
      const cbId = `ext:${browser}:${ext.id}`;
      tr.innerHTML = `
        <td class="cb-col"><input type="checkbox" class="item-check" data-id="${escapeHtml(cbId)}" data-name="${escapeHtml(ext.name)}" data-path="${escapeHtml(ext.id || '')}" data-type="ext" data-extra="${escapeHtml(browser)}"></td>
        <td><strong>${escapeHtml(ext.name)}</strong>${ext.description ? '<br><span class="text-muted" style="font-size:11px">' + escapeHtml(ext.description.slice(0, 80)) + (ext.description.length > 80 ? '…' : '') + '</span>' : ''}</td>
        <td class="mono-cell" style="font-size:11px">${escapeHtml(ext.version || '–')}</td>
        <td class="mono-cell" style="font-size:10px;color:var(--color-text-muted)">${escapeHtml(ext.id?.slice(0, 16) || '–')}…</td>
        <td style="font-size:11px">${status}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);

    // Checkbox-Handler
    tbl.querySelector('.check-all')?.addEventListener('change', e => {
      tbl.querySelectorAll('.item-check').forEach(cb => {
        cb.checked = e.target.checked;
        toggleItemSelection(cb, e.target.checked);
      });
      updateActionBar();
    });
    tbody.addEventListener('change', e => {
      const cb = e.target.closest('.item-check');
      if (!cb) return;
      toggleItemSelection(cb, cb.checked);
      updateActionBar();
    });

    wrap.appendChild(tbl);
    container.appendChild(wrap);
  }
}

// ─── Session-Verlauf ──────────────────────────────────────────────────────────

function initSessionHistory() {
  document.getElementById('btn-session-history')?.addEventListener('click', openSessionHistory);
  document.getElementById('btn-history-close')?.addEventListener('click', closeSessionHistory);
  document.getElementById('btn-history-cancel')?.addEventListener('click', closeSessionHistory);
  document.getElementById('modal-session-history')?.addEventListener('click', e => {
    if (e.target.id === 'modal-session-history') closeSessionHistory();
  });
}

async function openSessionHistory() {
  const modal = document.getElementById('modal-session-history');
  const list  = document.getElementById('session-history-list');
  if (!modal || !list) return;
  modal.classList.remove('hidden');
  list.innerHTML = '<p class="info-placeholder">Lade Sessions…</p>';

  try {
    const sessions = await GetSessions();
    if (!sessions?.length) {
      list.innerHTML = '<p class="info-placeholder">Noch keine Sessions gespeichert.</p>';
      return;
    }
    const tbl = document.createElement('table');
    tbl.className = 'data-table';
    tbl.innerHTML = '<thead><tr><th>Session</th><th>Erstellt</th><th>Pfad</th></tr></thead>';
    const tbody = document.createElement('tbody');
    sessions.forEach(s => {
      const tr = document.createElement('tr');
      const date = s.created_at ? new Date(s.created_at).toLocaleString('de-DE') : '–';
      tr.innerHTML = `
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td style="white-space:nowrap;font-size:12px">${escapeHtml(date)}</td>
        <td style="font-size:11px;color:var(--color-text-muted)">${escapeHtml(shortenPath(s.path))}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    list.innerHTML = `<p class="section-meta">${sessions.length} Sessions</p>`;
    list.appendChild(tbl);
  } catch (err) {
    list.innerHTML = `<p class="info-placeholder">Fehler beim Laden: ${escapeHtml(String(err))}</p>`;
  }
}

function closeSessionHistory() {
  document.getElementById('modal-session-history')?.classList.add('hidden');
}

// ─── WiFi QR-Code ─────────────────────────────────────────────────────────────

function initQRModal() {
  document.getElementById('btn-qr-close')?.addEventListener('click', closeQRModal);
  document.getElementById('btn-qr-cancel')?.addEventListener('click', closeQRModal);
  document.getElementById('modal-wifi-qr')?.addEventListener('click', e => {
    if (e.target.id === 'modal-wifi-qr') closeQRModal();
  });
}

async function showWiFiQR(ssid, password, security) {
  const modal = document.getElementById('modal-wifi-qr');
  const body  = document.getElementById('qr-modal-body');
  const title = document.getElementById('qr-modal-title');
  const hint  = document.getElementById('qr-modal-hint');
  if (!modal || !body) return;

  title.textContent = `WiFi QR-Code: ${ssid}`;
  body.innerHTML = '<p class="info-placeholder">Generiere…</p>';
  hint.textContent = '';
  modal.classList.remove('hidden');

  try {
    const authType = security === 'WEP' ? 'WEP' : (security === 'Open' ? 'nopass' : 'WPA');
    const wifiStr = `WIFI:T:${authType};S:${escapeWifiString(ssid)};P:${escapeWifiString(password)};;`;
    const dataUrl = await QRCode.toDataURL(wifiStr, { width: 256, margin: 2, errorCorrectionLevel: 'M' });
    body.innerHTML = `<img src="${dataUrl}" alt="WiFi QR-Code" style="max-width:256px;border-radius:8px">`;
    hint.textContent = `Netzwerk: ${ssid} · Sicherheit: ${security || 'WPA'}`;
  } catch (err) {
    body.innerHTML = `<p class="info-placeholder">QR-Code konnte nicht erstellt werden: ${escapeHtml(String(err))}</p>`;
  }
}

function closeQRModal() {
  document.getElementById('modal-wifi-qr')?.classList.add('hidden');
}

function escapeWifiString(s) {
  // RFC-4180-ähnliches Escaping für WiFi-QR-Strings
  return String(s).replace(/[\\;,"]/g, c => '\\' + c);
}

// ─── Software-Tab ────────────────────────────────────────────────────────────

// ─── VT / KI Auswahl-Mechanismus ─────────────────────────────────────────────

function toggleItemSelection(cb, selected) {
  const id = cb.dataset.id;
  if (!id) return;
  if (selected) {
    state.selectedItems.set(id, {
      name: cb.dataset.name || id,
      path: cb.dataset.path || '',
      type: cb.dataset.type || 'unknown',
      extra: cb.dataset.extra || '',
    });
  } else {
    state.selectedItems.delete(id);
  }
}

function updateActionBar() {
  const bar   = document.getElementById('vt-action-bar');
  const count = document.getElementById('action-bar-count');
  if (!bar) return;
  const n = state.selectedItems.size;
  bar.classList.toggle('hidden', n === 0);
  if (count) count.textContent = `${n} ausgewählt`;
}

function clearSelection() {
  state.selectedItems.clear();
  document.querySelectorAll('.item-check').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.check-all').forEach(cb => { cb.checked = false; });
  document.getElementById('software-check-all') && (document.getElementById('software-check-all').checked = false);
  updateActionBar();
}

function initActionBar() {
  // Software "Alle auswählen"
  document.getElementById('software-check-all')?.addEventListener('change', e => {
    document.querySelectorAll('#software-tbody .item-check').forEach(cb => {
      cb.checked = e.target.checked;
      toggleItemSelection(cb, e.target.checked);
    });
    updateActionBar();
  });

  document.getElementById('btn-clear-selection')?.addEventListener('click', clearSelection);

  document.getElementById('btn-vt-check')?.addEventListener('click', () => {
    if (state.selectedItems.size === 0) return;
    runVTCheck();
  });

  document.getElementById('btn-ai-analyze')?.addEventListener('click', () => {
    if (state.selectedItems.size === 0) return;
    const provider = document.getElementById('ai-provider-select')?.value ?? 'chatgpt';
    runAIAnalyze(provider);
  });

  // VT Fortschritts-Modal
  document.getElementById('btn-vt-cancel')?.addEventListener('click', () => {
    if (state.vtAbortController) state.vtAbortController.abort();
    document.getElementById('modal-vt-progress')?.classList.add('hidden');
  });
  document.getElementById('btn-vt-done')?.addEventListener('click', () => {
    document.getElementById('modal-vt-progress')?.classList.add('hidden');
  });

  // VT Detail-Modal
  document.getElementById('btn-vt-detail-close')?.addEventListener('click', () => {
    document.getElementById('modal-vt-detail')?.classList.add('hidden');
  });
  document.getElementById('btn-vt-detail-cancel')?.addEventListener('click', () => {
    document.getElementById('modal-vt-detail')?.classList.add('hidden');
  });

  // KI Antwort-Modal
  document.getElementById('btn-ai-response-close')?.addEventListener('click', () => {
    document.getElementById('modal-ai-response')?.classList.add('hidden');
  });
  document.getElementById('btn-ai-response-ok')?.addEventListener('click', () => {
    document.getElementById('modal-ai-response')?.classList.add('hidden');
  });
  document.getElementById('btn-ai-copy')?.addEventListener('click', () => {
    const text = document.getElementById('ai-response-text')?.textContent ?? '';
    navigator.clipboard.writeText(text).catch(() => {});
    const btn = document.getElementById('btn-ai-copy');
    if (btn) { const orig = btn.textContent; btn.textContent = '✓ Kopiert'; setTimeout(() => { btn.textContent = orig; }, 1500); }
  });
}

// ─── Prozess-Scanner ─────────────────────────────────────────────────────────

async function runProcessScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  setScanButtonsDisabled(true);
  setStatus('Prozess-Scan läuft…');
  setPlaceholder('processes-info', 'Scanne laufende Prozesse…');

  try {
    const procs = await GetProcesses();
    renderProcesses(procs);
    setEl('processes-count', procs?.length ?? 0);
    addAction(`Prozess-Scan: ${procs?.length ?? 0} laufende Prozesse`, 'info');
    setStatus('Prozess-Scan abgeschlossen');
  } catch (err) {
    setPlaceholder('processes-info', 'Fehler: ' + err);
    addAction('Prozess-Scan fehlgeschlagen: ' + err, 'error');
    setStatus('Fehler beim Prozess-Scan');
  } finally {
    state.isScanning = false;
    setScanButtonsDisabled(false);
  }
}

function renderProcesses(procs) {
  const container = document.getElementById('processes-info');
  if (!container) return;
  if (!procs?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Prozesse gefunden.</div>';
    return;
  }

  // Sortierung: CPU% absteigend, dann Speicher
  const sorted = [...procs].sort((a, b) => (b.cpu_pct - a.cpu_pct) || (b.memory_mb - a.memory_mb));

  const tbl = document.createElement('table');
  tbl.className = 'data-table';
  tbl.innerHTML = `<thead><tr>
    <th class="cb-col"><input type="checkbox" class="check-all" title="Alle auswählen"></th>
    <th>PID</th><th>Name</th><th>Benutzer</th><th>CPU%</th><th>RAM (MB)</th>
  </tr></thead>`;

  const tbody = document.createElement('tbody');
  sorted.forEach(p => {
    const cbId = `process:${p.pid}:${p.name}`;
    const isHigh = p.cpu_pct > 20 || p.memory_mb > 500;
    const tr = document.createElement('tr');
    if (isHigh) tr.classList.add('row-warning');
    tr.innerHTML = `
      <td class="cb-col"><input type="checkbox" class="item-check"
        data-id="${escapeHtml(cbId)}"
        data-name="${escapeHtml(p.name)}"
        data-path="${escapeHtml(p.path || '')}"
        data-type="process"></td>
      <td class="mono">${p.pid}</td>
      <td>${escapeHtml(p.name)}${p.path ? `<span class="item-path" title="${escapeHtml(p.path)}"> ${escapeHtml(p.path)}</span>` : ''}</td>
      <td>${escapeHtml(p.user || '–')}</td>
      <td class="${p.cpu_pct > 20 ? 'text-warning' : ''}">${p.cpu_pct.toFixed(1)}</td>
      <td class="${p.memory_mb > 500 ? 'text-warning' : ''}">${p.memory_mb.toFixed(0)}</td>`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(tbl);
  attachCheckboxHandlers(container);
}

// ─── VT-Check ────────────────────────────────────────────────────────────────

async function runVTCheck() {
  const modal    = document.getElementById('modal-vt-progress');
  const bar      = document.getElementById('vt-progress-bar');
  const text     = document.getElementById('vt-progress-text');
  const results  = document.getElementById('vt-progress-results');
  const doneBtn  = document.getElementById('btn-vt-done');
  if (!modal) return;

  // VT-Key prüfen
  const vtKey = state.config?.api_keys?.virustotal ?? '';
  if (!vtKey) {
    showToast('Kein VirusTotal-API-Key konfiguriert — bitte in Einstellungen → API-Schlüssel eintragen.');
    document.getElementById('btn-settings')?.click();
    return;
  }

  // Whitelist laden um bekannte-saubere Items zu überspringen
  let whitelistHashes = new Set();
  try {
    const wl = await GetVTWhitelist();
    wl.forEach(e => whitelistHashes.add(e.sha256?.toLowerCase()));
  } catch {}

  const items = [...state.selectedItems.values()];
  modal.classList.remove('hidden');
  if (bar) bar.style.width = '0%';
  if (text) text.textContent = `0 / ${items.length} geprüft…`;
  if (results) results.innerHTML = '';
  if (doneBtn) doneBtn.classList.add('hidden');

  state.vtAbortController = new AbortController();
  const vtRequests = items
    .filter(i => i.path) // nur Einträge mit Pfad
    .map(i => ({ name: i.name, path: i.path, item_type: i.type }));

  if (vtRequests.length === 0) {
    if (text) text.textContent = 'Keine prüfbaren Einträge (kein Pfad verfügbar).';
    if (doneBtn) doneBtn.classList.remove('hidden');
    return;
  }

  // Whitelist-Einträge vorab als "whitelisted" anzeigen
  if (whitelistHashes.size > 0 && results) {
    items.filter(i => !i.path).forEach(i => {
      results.innerHTML += `<div class="vt-progress-item vt-clean">✓ ${escapeHtml(i.name)}: whitelisted (übersprungen)</div>`;
    });
  }

  const auditLog = [];
  // item_id = "type:name:path" → lookup table path→type for audit
  const pathToType = {};
  vtRequests.forEach(r => { pathToType[r.path] = r.item_type; });

  try {
    // Wails-Event: vt:progress wird vom Backend emittiert
    if (window.runtime?.EventsOn) {
      window.runtime.EventsOn('vt:progress', (data) => {
        const pct = Math.round((data.current / data.total) * 100);
        if (bar) bar.style.width = pct + '%';
        if (text) text.textContent = `${data.current} / ${data.total} geprüft — ${data.result?.name ?? ''}`;
        if (results && data.result) {
          const r = data.result;
          const cls = r.status === 'malicious' ? 'vt-malicious' : r.status === 'suspicious' ? 'vt-suspicious' : r.status === 'clean' ? 'vt-clean' : 'vt-unknown';
          const icon = r.status === 'malicious' ? '⛔' : r.status === 'suspicious' ? '⚠' : r.status === 'clean' ? '✓' : '–';
          results.innerHTML += `<div class="vt-progress-item ${cls}">${icon} ${escapeHtml(r.name)}: ${escapeHtml(r.status)}${r.detections > 0 ? ` (${r.detections}/${r.engines} Engines)` : ''}</div>`;
          injectVTBadge(r);
          auditLog.push({
            name: r.name, path: r.path ?? '', item_type: pathToType[r.path] ?? '',
            status: r.status, sha256: r.sha256 ?? '',
            detections: r.detections ?? 0, engines: r.engines ?? 0,
            checked_at: new Date().toISOString(),
          });
        }
      });
    }

    await CheckVirusTotalItems(vtRequests);

    if (text) text.textContent = `Abgeschlossen: ${vtRequests.length} geprüft.`;
    if (bar) bar.style.width = '100%';

    if (auditLog.length > 0) {
      try { await SaveVTAuditLog(JSON.stringify(auditLog)); } catch {}
    }
  } catch (err) {
    if (text) text.textContent = 'Fehler: ' + err;
    addAction('VT-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (doneBtn) doneBtn.classList.remove('hidden');
    if (window.runtime?.EventsOff) window.runtime.EventsOff('vt:progress');
  }
}

function injectVTBadge(result) {
  // Checkbox mit passendem data-id suchen und Badge neben dem Name einfügen
  const cb = document.querySelector(`.item-check[data-id="${CSS.escape(result.item_id ?? '')}"]`);
  if (!cb) return;
  const row = cb.closest('tr');
  if (!row) return;
  // Zweite Zelle (Name)
  const nameCell = row.cells[1];
  if (!nameCell) return;
  // Alten Badge entfernen
  nameCell.querySelector('.vt-badge')?.remove();
  const cls = result.status === 'malicious' ? 'vt-malicious'
    : result.status === 'suspicious' ? 'vt-suspicious'
    : result.status === 'clean' ? 'vt-clean'
    : result.status === 'not_found' ? 'vt-not-found'
    : 'vt-error';
  const label = result.status === 'malicious' ? `⛔ ${result.detections}/${result.engines}`
    : result.status === 'suspicious' ? `⚠ ${result.detections}/${result.engines}`
    : result.status === 'clean' ? '✓ Sauber'
    : result.status === 'not_found' ? '– Kein Eintrag'
    : '? Fehler';
  const badge = document.createElement('span');
  badge.className = `vt-badge ${cls}`;
  badge.textContent = label;
  badge.title = `SHA256: ${result.sha256 ?? '–'}`;
  badge.style.cursor = 'pointer';
  badge.addEventListener('click', () => showVTDetail(result));
  nameCell.appendChild(badge);
}

function showVTDetail(result) {
  const modal = document.getElementById('modal-vt-detail');
  const title = document.getElementById('vt-detail-title');
  const body  = document.getElementById('vt-detail-body');
  const webBtn = document.getElementById('btn-vt-open-web');
  if (!modal) return;

  title.textContent = `VT: ${result.name ?? '–'}`;

  const statusClass = result.status === 'malicious' ? 'vt-malicious'
    : result.status === 'suspicious' ? 'vt-suspicious'
    : result.status === 'clean' ? 'vt-clean'
    : 'vt-not-found';

  body.innerHTML = `
    <div class="vt-detail-grid">
      <div class="vt-detail-row"><span>Status</span><span class="vt-badge ${statusClass}">${escapeHtml(result.status ?? '–')}</span></div>
      ${result.detections !== undefined ? `<div class="vt-detail-row"><span>Erkennungen</span><span>${result.detections} / ${result.engines} Engines</span></div>` : ''}
      ${result.sha256 ? `<div class="vt-detail-row"><span>SHA256</span><span class="mono-cell" style="font-size:11px;word-break:break-all">${escapeHtml(result.sha256)}</span></div>` : ''}
      ${result.path ? `<div class="vt-detail-row"><span>Pfad</span><span class="mono-cell" style="font-size:11px;word-break:break-all">${escapeHtml(result.path)}</span></div>` : ''}
      ${result.error_msg ? `<div class="vt-detail-row"><span>Fehler</span><span style="color:var(--color-error)">${escapeHtml(result.error_msg)}</span></div>` : ''}
    </div>`;

  if (result.permalink && webBtn) {
    webBtn.classList.remove('hidden');
    webBtn.onclick = () => { if (window.runtime?.BrowserOpenURL) window.runtime.BrowserOpenURL(result.permalink); };
  } else if (webBtn) {
    webBtn.classList.add('hidden');
  }

  // Whitelist-Button: nur bei clean/not_found mit bekanntem Hash
  const wlBtn = document.getElementById('btn-vt-whitelist');
  if (wlBtn && result.sha256 && (result.status === 'clean' || result.status === 'not_found')) {
    wlBtn.classList.remove('hidden');
    wlBtn.textContent = '✅ Whitelist';
    wlBtn.onclick = async () => {
      try {
        await AddToVTWhitelist(result.sha256, result.name ?? '');
        wlBtn.textContent = '✓ Gespeichert';
        wlBtn.disabled = true;
        showToast(`„${result.name}" zur VT-Whitelist hinzugefügt.`);
      } catch (e) {
        showToast('Whitelist-Fehler: ' + e);
      }
    };
  } else if (wlBtn) {
    wlBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

// ─── KI-Analyse ───────────────────────────────────────────────────────────────

const AI_BROWSER_URLS = {
  chatgpt:    'https://chatgpt.com/',
  claude:     'https://claude.ai/',
  perplexity: 'https://www.perplexity.ai/',
  grok:       'https://grok.com/',
};

function buildAIPrompt() {
  const items = [...state.selectedItems.values()];
  const typeLabels = { service: 'Dienst', autostart: 'Autostart', ext: 'Browser-Extension', software: 'Software', unknown: 'Eintrag' };

  let prompt = '=== AdminKit: Analyse ausgewählter Systemeinträge ===\n\n';
  items.forEach(item => {
    const label = typeLabels[item.type] ?? 'Eintrag';
    prompt += `[${label}] Name: ${item.name}`;
    if (item.path) prompt += ` | Pfad: ${item.path}`;
    if (item.extra) prompt += ` | Extra: ${item.extra}`;
    prompt += '\n';
  });
  prompt += '\n=== Frage ===\n';
  prompt += 'Sind diese Einträge verdächtig? Gibt es Sicherheitsrisiken oder Handlungsempfehlungen? Bitte kurz und auf Deutsch antworten.';
  return prompt;
}

async function runAIAnalyze(provider) {
  const prompt = buildAIPrompt();

  // Typ A: Browser-Redirect
  if (AI_BROWSER_URLS[provider]) {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch { /* kein Clipboard-Zugriff */ }
    if (window.runtime?.BrowserOpenURL) {
      window.runtime.BrowserOpenURL(AI_BROWSER_URLS[provider]);
    }
    showToast('Prompt wurde in die Zwischenablage kopiert. Füge ihn im geöffneten Browser ein.');
    return;
  }

  // Typ B: Direkte API
  const modal  = document.getElementById('modal-ai-response');
  const title  = document.getElementById('ai-response-title');
  const pre    = document.getElementById('ai-response-text');
  if (!modal || !pre) return;

  title.textContent = `🤖 KI-Analyse (${provider})`;
  pre.textContent = 'Anfrage läuft…';
  modal.classList.remove('hidden');

  try {
    let response;
    if (provider === 'ollama' || provider === 'lmstudio') {
      const baseURL = provider === 'ollama'
        ? 'http://localhost:11434'
        : 'http://localhost:1234';
      const model = provider === 'ollama'
        ? (state.config?.ai_models?.ollama || 'llama3.2')
        : (state.config?.ai_models?.lmstudio || 'local-model');
      response = await CallLocalAI(baseURL, model, prompt);
    } else {
      const model = state.config?.ai_models?.[provider] || defaultModelFor(provider);
      response = await CallAI(provider, model, prompt);
    }
    pre.textContent = response;
    addAction(`KI-Analyse (${provider}) abgeschlossen`, 'success');
  } catch (err) {
    pre.textContent = 'Fehler: ' + err;
    addAction(`KI-Analyse fehlgeschlagen (${provider}): ${err}`, 'error');
  }
}

function defaultModelFor(provider) {
  const defaults = { openai: 'gpt-4o', anthropic: 'claude-opus-4-8', groq: 'llama-3.3-70b-versatile' };
  return defaults[provider] ?? '';
}

function showToast(msg) {
  let toast = document.getElementById('ak-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ak-toast';
    toast.className = 'ak-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3500);
}

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
    tbody.innerHTML = `<tr><td colspan="7" class="table-placeholder">${filter ? 'Keine Treffer für „' + escapeHtml(filter) + '"' : 'Keine Programme gefunden.'}</td></tr>`;
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

    const cbId = `software:${p.name}`;
    tr.innerHTML = `
      <td class="cb-col"><input type="checkbox" class="item-check" data-id="${escapeHtml(cbId)}" data-name="${escapeHtml(p.name ?? '')}" data-path="" data-type="software"></td>
      <td>${escapeHtml(p.name ?? '–')}</td>
      <td class="mono-cell">${escapeHtml(p.version ?? '–')}</td>
      <td>${escapeHtml(p.publisher ?? '–')}</td>
      <td>${date}</td>
      <td style="text-align:right">${size}</td>
      <td style="text-align:center">${copyBtn}</td>`;

    frag.appendChild(tr);
  });

  tbody.appendChild(frag);

  // Checkbox-Handler für Software-Tabelle
  tbody.addEventListener('change', e => {
    const cb = e.target.closest('.item-check');
    if (!cb) return;
    toggleItemSelection(cb, cb.checked);
    updateActionBar();
  });

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

  // Primär-Adapter: verbundener Nicht-Loopback mit IPv4
  const primary = result.adapters?.find(a => a.is_connected && a.ipv4?.length && a.type !== 'Loopback');
  if (primary) {
    setEl('info-ip', primary.ipv4.join(', '));
    setEl('info-gateway', primary.gateway || '–');
    setEl('info-dns', primary.dns_servers?.slice(0, 2).join(', ') || '–');
  }
  const domains = result.search_domains;
  if (domains?.length) {
    setEl('info-domain', domains.join(', '));
  }
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

  // Letzte Anmeldung: aktivierten, nicht-System-Benutzer mit neuester LastLogon
  if (result.users?.length) {
    const lastUser = result.users
      .filter(u => u.is_enabled && u.last_logon && !u.last_logon.startsWith('0001'))
      .sort((a, b) => new Date(b.last_logon) - new Date(a.last_logon))[0];
    if (lastUser) {
      setEl('info-lastlogin', `${lastUser.name} (${formatDate(lastUser.last_logon)})`);
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

function addAction(text, type = 'info', meta = null) {
  const list = document.getElementById('action-list');
  if (!list) return;
  list.querySelector('.empty-state')?.remove();
  const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✗' };
  const el = document.createElement('div');
  el.className = 'action-entry';
  if (meta?.filePath) {
    el.dataset.filePath = meta.filePath;
    el.classList.add('action-has-file');
    el.title = 'Klicken zum Öffnen der Datei';
  }
  el.innerHTML = `
    <span>${icons[type] ?? 'ℹ'}</span>
    <span>${escapeHtml(text)}</span>
    <span class="action-time">${formatTime(new Date())}</span>
  `;
  list.prepend(el);
}

function initActionLog() {
  document.getElementById('action-list')?.addEventListener('click', async e => {
    const entry = e.target.closest('.action-has-file');
    if (!entry?.dataset.filePath) return;
    try {
      await OpenFile(entry.dataset.filePath);
    } catch (err) {
      addAction('Datei konnte nicht geöffnet werden: ' + err, 'error');
    }
  });
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

  document.getElementById('tool-vault-archive')?.addEventListener('click', () => {
    openArchiveModal();
  });

  document.getElementById('archive-btn-cancel')?.addEventListener('click', closeArchiveModal);
  document.getElementById('archive-modal-close')?.addEventListener('click', closeArchiveModal);
  document.getElementById('archive-btn-pick')?.addEventListener('click', async () => {
    try {
      const dir = await PickArchiveDirectory();
      if (!dir) return;
      document.getElementById('archive-dest-display').textContent = dir;
      document.getElementById('archive-btn-start').disabled = false;
      document.getElementById('archive-btn-start').dataset.dest = dir;
    } catch (err) {
      showToast('Fehler beim Öffnen des Verzeichnis-Dialogs: ' + err);
    }
  });
  document.getElementById('archive-btn-start')?.addEventListener('click', async () => {
    const dest = document.getElementById('archive-btn-start').dataset.dest;
    if (!dest) return;
    closeArchiveModal();
    const btn = document.getElementById('tool-vault-archive');
    if (btn) btn.style.opacity = '0.5';
    setStatus('Archivierung läuft…');
    try {
      const result = await ArchiveVault(dest);
      const mb = ((result.copied_bytes || 0) / 1048576).toFixed(1);
      addAction(`Archivierung abgeschlossen: ${result.copied_files} Dateien (${mb} MB) → ${shortenPath(result.archive_path)}`, 'success');
      setStatus('Archivierung abgeschlossen');
      showArchiveResult(result);
    } catch (err) {
      addAction('Archivierung fehlgeschlagen: ' + err, 'error');
      showToast('❌ Archivierung fehlgeschlagen: ' + err);
      setStatus('Fehler bei der Archivierung');
    } finally {
      if (btn) btn.style.opacity = '';
    }
  });

  document.getElementById('tool-wifi-pw')?.addEventListener('click', async () => {
    switchTab('network');
    if (!state.lastNetworkResult) {
      // Warnung: macOS zeigt Keychain-Dialog für jedes gespeicherte Netzwerk
      showToast('macOS fragt für jedes gespeicherte WLAN nach Keychain-Zugriff — einmalig "Immer erlauben" wählen, um zukünftige Dialoge zu vermeiden.');
      await runNetworkScan();
      // Feedback nach dem Scan: wie viele Passwörter erfolgreich?
      const wifi = state.lastNetworkResult?.wifi;
      if (wifi?.length) {
        const withPw = wifi.filter(w => w.password).length;
        const total  = wifi.length;
        if (withPw > 0) addAction(`${withPw} von ${total} WLAN-Passwörtern aus Keychain gelesen.`, 'success');
        else addAction(`WLAN-Profile geladen (${total}). Passwörter: Keychain-Zugriff verweigert oder nicht konfiguriert.`, 'info');
      }
    }
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

  // Enter-Taste im Target-Input löst Ausführung aus
  document.getElementById('console-target')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') runConsoleTool();
  });

  // Placeholder-Text + Presets + Info-Box je nach Tool anpassen
  document.getElementById('console-tool')?.addEventListener('change', updateConsolePlaceholder);
  // updateConsolePlaceholder() wird nach initPlatformTools() aufgerufen
}

// ─── Werkzeug-Definitionen (plattformübergreifend, Labels OS-spezifisch) ──────

const CONSOLE_TOOL_DEFS = [
  { value: 'ping',       mac: 'Ping',                  win: 'Ping',                  placeholder: 'Hostname oder IP (z.B. google.com)' },
  { value: 'traceroute', mac: 'Traceroute',             win: 'Tracert',               placeholder: 'Hostname oder IP (z.B. 8.8.8.8)' },
  { value: 'dns',        mac: 'DNS-Lookup',             win: 'DNS-Lookup',            placeholder: 'Hostname (z.B. example.com)' },
  { value: 'dns-flush',  mac: 'DNS-Cache leeren',       win: 'DNS-Cache leeren',      placeholder: '(kein Ziel nötig)' },
  { value: 'netstat',    mac: 'Netstat',                win: 'Netstat',               placeholder: '(kein Ziel nötig)' },
  { value: 'openports',  mac: 'Offene Ports (lsof)',    win: 'Offene Ports (Listen)', placeholder: '(kein Ziel nötig)' },
  { value: 'arp',        mac: 'ARP-Tabelle',            win: 'ARP-Tabelle',           placeholder: '(kein Ziel nötig)' },
  { value: 'ifconfig',   mac: 'ifconfig (Interfaces)',  win: 'ipconfig /all',         placeholder: '(kein Ziel nötig)' },
  { value: 'route',      mac: 'Routing-Tabelle',        win: 'Routing-Tabelle',       placeholder: '(kein Ziel nötig)' },
  { value: 'firewall',   mac: 'Firewall-Status',        win: 'Firewall-Status',       placeholder: '(kein Ziel nötig)' },
  { value: 'hosts',      mac: '/etc/hosts',             win: 'Hosts-Datei',           placeholder: '(kein Ziel nötig)' },
  { value: 'portscan',   mac: 'Port-Scan (intern)',     win: 'Port-Scan (intern)',    placeholder: 'Host oder host:80,443 oder host:22-1024' },
  { value: 'curl',       mac: 'HTTP/Curl',              win: 'HTTP/Curl',             placeholder: 'URL (z.B. https://api.ipify.org)' },
  { value: 'drivers',    mac: 'Kernel-Extensions',      win: 'Treiber (driverquery)', placeholder: '(kein Ziel nötig)' },
];

const CONSOLE_PRESETS = {
  ping:       ['google.com', '8.8.8.8', '1.1.1.1', 'cloudflare.com', 'microsoft.com'],
  traceroute: ['google.com', '8.8.8.8', '1.1.1.1'],
  dns:        ['google.com', 'github.com', 'microsoft.com', 'apple.com'],
  portscan:   ['localhost:80,443,22,3389', 'localhost:1-1024', '192.168.1.1:22,80,443'],
  curl:       ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://httpbin.org/ip', 'https://httpbin.org/get'],
};

const TOOL_INFO = {
  ping: {
    desc: 'Sendet 4 ICMP-Pakete an einen Host und misst die Antwortzeit (Latenz). Zeigt individuelle Paket-Antworten und eine Statistik am Ende.',
    example: `PING google.com (142.250.185.78): 56 data bytes
64 bytes from 142.250.185.78: icmp_seq=0 ttl=118 time=12.345 ms
64 bytes from 142.250.185.78: icmp_seq=1 ttl=118 time=11.234 ms
64 bytes from 142.250.185.78: icmp_seq=2 ttl=118 time=11.998 ms
64 bytes from 142.250.185.78: icmp_seq=3 ttl=118 time=12.021 ms

--- google.com ping statistics ---
4 packets transmitted, 4 received, 0.0% packet loss
round-trip min/avg/max/stddev = 11.234/11.899/12.345/0.432 ms`,
    interpret: '< 20 ms = ausgezeichnet · 20–80 ms = gut · > 100 ms = verzögert · 100 % Verlust = Host nicht erreichbar oder Firewall blockiert ICMP. Hohe Stddev = schwankende Verbindungsqualität.',
  },
  traceroute: {
    desc: 'Zeigt den vollständigen Netzwerkpfad (alle Router-Hops) zum Ziel und misst die Latenz an jedem Schritt. 3 Messungen pro Hop.',
    example: `traceroute to google.com (142.250.185.78), 20 hops max
 1  192.168.1.1 (192.168.1.1)   1.234 ms   1.098 ms   0.987 ms
 2  * * *
 3  10.0.12.1 (10.0.12.1)       8.432 ms   8.211 ms   8.399 ms
 4  142.250.x.x                 10.211 ms  10.456 ms  10.123 ms
 5  142.250.185.78              12.345 ms  11.987 ms  12.100 ms`,
    interpret: '"* * *" = Router antwortet nicht auf Traceroute (sehr häufig, kein Fehler). Hohe Latenz ab einem bestimmten Hop = Engpass dort. "!H" = Host unerreichbar, "!X" = Verbindung administrativ blockiert.',
  },
  dns: {
    desc: 'Fragt einen DNS-Server nach der IP-Adresse eines Hostnamens — oder umgekehrt (Reverse Lookup für IP → Hostname).',
    example: `Server: 8.8.8.8\nAddress: 8.8.8.8#53\n\nNon-authoritative answer:\nName: google.com\nAddress: 142.250.185.78\nAddress: 2a00:1450:4016:804::200e`,
    interpret: '"Non-authoritative answer" ist normal (gecachte Antwort). Kein Ergebnis / SERVFAIL = DNS-Server nicht erreichbar oder Name existiert nicht. Falscher A-Record = mögliches DNS-Spoofing.',
  },
  'dns-flush': {
    desc: 'Leert den lokalen DNS-Cache. Hilfreich nach DNS-Änderungen, bei Weiterleitung auf falsche IP oder Malware-Verdacht.',
    example: `[macOS] DNS-Cache erfolgreich geleert (dscacheutil + mDNSResponder-Neustart).\n[Windows] Die IP-Adressauflösungstabelle wurde geleert.`,
    interpret: 'Nach dem Leeren werden alle DNS-Anfragen neu vom Server abgefragt. Nützlich wenn: eine Domain plötzlich auf eine falsche IP zeigt, neu gesetzte DNS-Einträge nicht sichtbar sind, oder ein AV-Tool DNS-Hijacking meldet.',
  },
  netstat: {
    desc: 'Zeigt alle aktiven Netzwerkverbindungen des Systems (eingehend + ausgehend) mit Protokoll, Ports und Status.',
    example: `Proto  Local Address         Foreign Address       State\nTCP    0.0.0.0:80            0.0.0.0:0             LISTEN\nTCP    192.168.1.5:52100     142.250.185.78:443    ESTABLISHED\nTCP    192.168.1.5:52101     185.125.188.55:443    TIME_WAIT`,
    interpret: 'LISTEN = Port offen, wartet. ESTABLISHED = aktive Verbindung. TIME_WAIT = Verbindung wird gerade geschlossen (normal). Unbekannte ausländische IPs im ESTABLISHED-Status → mit VT/IP-Lookup prüfen.',
  },
  openports: {
    desc: 'Listet alle Ports auf, auf denen das System aktiv lauscht — mit dem zugehörigen Prozess (macOS: lsof; Windows: netstat -ano).',
    example: `[macOS via lsof]\nCOMMAND   PID  USER   TYPE  NAME\nnginx    1234  root   IPv4  *:80\nnode     5678  user   IPv4  *:3000\nsshd     9012  root   IPv4  *:22`,
    interpret: 'Nur bekannte Anwendungen sollten lauschen. Unbekannte Prozesse auf ungewöhnlichen Ports = potenzielle Malware. "*" vor dem Port = auf allen Interfaces erreichbar (höheres Risiko als 127.0.0.1).',
  },
  arp: {
    desc: 'Zeigt die ARP-Tabelle: Zuordnung von IP-Adressen zu MAC-Adressen im lokalen Netzwerk. Enthält alle Geräte, mit denen kürzlich kommuniziert wurde.',
    example: `Address         HWtype  HWaddress           Flags Interface\n192.168.1.1     ether   aa:bb:cc:dd:ee:ff   C     en0\n192.168.1.100   ether   11:22:33:44:55:66   C     en0`,
    interpret: 'Zwei IPs mit der gleichen MAC = ARP-Spoofing (Man-in-the-Middle möglich). Unbekannte MACs = fremde Geräte im Netzwerk. "incomplete" = Gerät hat nicht geantwortet.',
  },
  ifconfig: {
    desc: 'Zeigt alle Netzwerk-Interfaces mit IP-Adressen, IPv6, MAC-Adresse, Netmaske und Status (macOS: ifconfig · Windows: ipconfig /all).',
    example: `en0: flags=8863 mtu 1500\n  inet 192.168.1.5 netmask 0xffffff00 broadcast 192.168.1.255\n  ether aa:bb:cc:dd:ee:ff\n  status: active`,
    interpret: 'lo0/Loopback (127.0.0.1) = normal. Mehrere externe IPs = VPN oder mehrere Netzwerkkarten aktiv. Kein "status: active" bei der bekannten Schnittstelle = Kabel/WLAN getrennt.',
  },
  route: {
    desc: 'Zeigt die Routing-Tabelle: Welche Pakete über welches Gateway / Interface gesendet werden. Steuert den gesamten Netzwerkverkehr.',
    example: `Destination     Gateway         Flags  Interface\n0.0.0.0/0       192.168.1.1     UG     en0\n192.168.1.0/24  link#4          U      en0\n127.0.0.0/8     lo0             U      lo0`,
    interpret: '0.0.0.0 / "default" = Standard-Route (gesamter Internet-Traffic). Fehlende Default-Route = kein Internet-Zugang. Unbekannte Einträge können auf VPN, Malware oder Fehlkonfiguration hindeuten.',
  },
  firewall: {
    desc: 'Prüft den aktuellen Status der System-Firewall (macOS Application Firewall / Windows Defender Firewall) auf allen Profilen.',
    example: `[macOS]\nFirewall Status: ENABLED\nStealth Mode: OFF\nBlock all incoming connections: OFF\n\n[Windows]\nDomain Profile:   State: ON\nPrivate Profile:  State: ON\nPublic Profile:   State: ON`,
    interpret: 'Firewall OFF auf einem Server oder Firmen-PC = Sicherheitsrisiko. Stealth Mode ON = System antwortet nicht auf Ping (empfohlen). Block All = sehr restriktiv, kann Dienste unterbrechen.',
  },
  hosts: {
    desc: 'Liest die Hosts-Datei aus (/etc/hosts auf macOS · C:\\Windows\\System32\\drivers\\etc\\hosts auf Windows). Einträge hier überschreiben DNS — höchste Priorität.',
    example: `127.0.0.1   localhost\n::1         localhost\n192.168.1.10 fileserver.local\n# 0.0.0.0  werbung.example.com  ← blockiert`,
    interpret: 'Fremdartige Einträge die bekannte Domains umleiten (z.B. "1.2.3.4 microsoft.com") = klares Malware-Indiz. Auch Adblock-Listen nutzen /etc/hosts (0.0.0.0 vor dem Domain-Namen).',
  },
  portscan: {
    desc: 'Scannt einen Host auf offene TCP-Ports. Format: "host:80,443" oder "host:1-1024" für einen Bereich.',
    example: `Offene Ports auf 192.168.1.1:\n  22/tcp  SSH\n  80/tcp  HTTP\n  443/tcp HTTPS\n\n1021 geschlossene Ports, Scan in 4.2s`,
    interpret: 'Nur erwartete Ports sollten offen sein. Port 22 offen = SSH-Zugang möglich. Unbekannte Ports → Dienst identifizieren (openports-Tool). Öffentlich erreichbarer Port 3389 (RDP) = hohes Angriffspotenzial.',
  },
  curl: {
    desc: 'Führt einen HTTP/HTTPS-GET-Request durch und zeigt Status-Code, wichtige Response-Header und Anfang des Body.',
    example: `Status: 200 OK\nContent-Type: text/html; charset=UTF-8\nServer: nginx/1.25.3\nX-Frame-Options: SAMEORIGIN\nStrict-Transport-Security: max-age=31536000\n\n[Body: erste 512 Bytes…]`,
    interpret: '200 = OK · 301/302 = Weiterleitung · 403 = Kein Zugriff · 404 = Nicht gefunden · 5xx = Server-Fehler. Fehlende Security-Header (X-Frame-Options, CSP, HSTS) = Sicherheitslücken im Webserver.',
  },
  drivers: {
    desc: 'Listet alle installierten Treiber (Windows: driverquery) oder geladene Kernel-Erweiterungen (macOS: kextstat) auf.',
    example: `[macOS]\nIndex  Refs   Size   Name\n12     0      0x8000 com.apple.iokit.IOUSBFamily\n\n[Windows]\nModul-Name     Beschreibung        Treibertyp  Status\nnvlddmkm.sys   NVIDIA Display      Kernel      Aktiv`,
    interpret: 'Kernel-Treiber haben höchste Rechte im System. Unbekannte Treiber ohne signierten Herausgeber = Rootkit-Risiko. Auf neueren macOS-Versionen stark eingeschränkt durch SIP und Gatekeeper.',
  },
};

/** Baut die Werkzeug-Auswahl mit plattformspezifischen Labels auf. */
async function initPlatformTools() {
  let platform = 'darwin';
  try { platform = (await GetPlatform()).trim(); } catch {}
  state.platform = platform;
  const isMac = platform === 'darwin';
  const isWin = platform === 'windows';

  const sel = document.getElementById('console-tool');
  if (!sel) return;
  sel.innerHTML = CONSOLE_TOOL_DEFS.map(t => {
    const label = isWin ? t.win : t.mac;
    return `<option value="${t.value}">${escapeHtml(label)}</option>`;
  }).join('');

  updateConsolePlaceholder();
}

function updateConsolePlaceholder() {
  const tool = document.getElementById('console-tool')?.value;
  const input = document.getElementById('console-target');
  const preset = document.getElementById('console-preset');
  if (!input) return;

  const def = CONSOLE_TOOL_DEFS.find(t => t.value === tool);
  input.placeholder = def?.placeholder ?? 'Ziel eingeben…';

  if (preset) {
    const options = CONSOLE_PRESETS[tool] ?? [];
    preset.innerHTML = '<option value="">– Vorschlag –</option>' +
      options.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    preset.style.display = options.length > 0 ? '' : 'none';
  }

  // Info-Box aktualisieren
  updateToolInfo(tool);
}

function updateToolInfo(tool) {
  const info = TOOL_INFO[tool];
  const sel = document.getElementById('console-tool');
  const label = sel?.options[sel.selectedIndex]?.text ?? tool;
  const summary = document.getElementById('console-info-summary');
  const desc    = document.getElementById('console-info-desc');
  const example = document.getElementById('console-info-example');
  const interp  = document.getElementById('console-info-interpret');
  if (summary) summary.textContent = `ℹ ${label} — Was zeigt dieser Befehl?`;
  if (!info) return;
  if (desc)    desc.textContent    = info.desc;
  if (example) example.textContent = info.example;
  if (interp)  interp.textContent  = info.interpret;
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

  termWrite(`[${label}${target ? ': ' + target : ''}]`, null);

  try {
    const result = await RunConsoleTool(tool, target);
    termAppend(result);
  } catch (err) {
    termAppend('Fehler: ' + err);
  } finally {
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Ausführen'; }
  }
}

/** Compat-Wrapper — früher console-output, jetzt unified terminal-output. */
function consoleWrite(header, _body) {
  termWrite(`[${header}]`, null);
}
function consoleAppend(text) {
  termAppend(text);
}

// ─── Erweiterte Tools-Features ────────────────────────────────────────────────

function initToolsExtended() {
  // ── Preset-Dropdown → Target-Feld befüllen ─────────────────────────────────
  document.getElementById('console-preset')?.addEventListener('change', e => {
    if (e.target.value) {
      document.getElementById('console-target').value = e.target.value;
    }
  });

  // Konsolen-Verlauf (↑/↓) im target-input
  document.getElementById('console-target')?.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') {
      if (state.consoleHistory.length === 0) return;
      state.consoleHistoryIdx = Math.max(0, state.consoleHistoryIdx - 1);
      e.target.value = state.consoleHistory[state.consoleHistoryIdx] ?? '';
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      state.consoleHistoryIdx = Math.min(state.consoleHistory.length, state.consoleHistoryIdx + 1);
      e.target.value = state.consoleHistory[state.consoleHistoryIdx] ?? '';
      e.preventDefault();
    }
  });

  // ── Terminal (freie Eingabe) ───────────────────────────────────────────────
  const termInput = document.getElementById('terminal-input');
  const termOutput = document.getElementById('terminal-output');

  const runTerminalCmd = async () => {
    let cmd = termInput?.value?.trim() ?? '';
    if (!cmd) return;

    // Ping ohne Count-Flag läuft endlos → auto -c 5 / -n 5 einfügen
    if (/^ping6?\s/i.test(cmd) && !/\s-[cn]\s*\d/i.test(cmd)) {
      const flag = state.platform === 'windows' ? '-n 5' : '-c 5';
      cmd = cmd.replace(/^(ping6?)\s+/i, `$1 ${flag} `);
    }

    // Verlauf aktualisieren
    state.terminalHistory.push(cmd);
    state.terminalHistoryIdx = state.terminalHistory.length;
    if (termInput) termInput.value = '';

    // Befehl in Ausgabe anzeigen
    termWrite(`$ ${cmd}`, '⏳ Läuft…');
    try {
      const result = await RunRawCommand(cmd);
      termAppend(result);
    } catch (err) {
      termAppend('Fehler: ' + err);
    }
  };

  document.getElementById('btn-terminal-run')?.addEventListener('click', runTerminalCmd);
  termInput?.addEventListener('keydown', async e => {
    if (e.key === 'Enter') { await runTerminalCmd(); }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.terminalHistoryIdx = Math.max(0, state.terminalHistoryIdx - 1);
      if (termInput) termInput.value = state.terminalHistory[state.terminalHistoryIdx] ?? '';
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.terminalHistoryIdx = Math.min(state.terminalHistory.length, state.terminalHistoryIdx + 1);
      if (termInput) termInput.value = state.terminalHistory[state.terminalHistoryIdx] ?? '';
    }
  });

  document.getElementById('btn-terminal-clear')?.addEventListener('click', () => {
    if (termOutput) termOutput.innerHTML = '<span class="console-placeholder">Terminal geleert.</span>';
  });
  document.getElementById('btn-terminal-copy')?.addEventListener('click', () => {
    const text = getTerminalText();
    navigator.clipboard.writeText(text).catch(() => {});
    showToast('Terminal-Ausgabe kopiert');
  });
  document.getElementById('btn-terminal-ai')?.addEventListener('click', () => {
    const text = getTerminalText();
    if (!text.trim()) return;
    sendOutputToAI('Terminal-Ausgabe', text);
  });
  document.getElementById('btn-terminal-save')?.addEventListener('click', async () => {
    const text = getTerminalText();
    if (!text.trim()) { showToast('Terminal ist leer.'); return; }
    const btn = document.getElementById('btn-terminal-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
      const path = await SaveTerminalLog(text);
      showToast('Log gespeichert: ' + path.split('/').pop());
      addAction('Terminal-Log gespeichert: ' + path, 'info');
    } catch (err) {
      showToast('Fehler beim Speichern: ' + err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Log speichern'; }
    }
  });

  // ── VT Datei-Scanner ──────────────────────────────────────────────────────
  document.getElementById('btn-vt-pick-file')?.addEventListener('click', async () => {
    try {
      const path = await PickFileForVTScan();
      if (path) scanFileWithVT(path);
    } catch (err) {
      showVTFileResult('error', 'Datei-Dialog: ' + err);
    }
  });

  // Drag & Drop auf der Drop-Zone
  const dropZone = document.getElementById('vt-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = e.dataTransfer?.files;
      if (files?.length > 0) {
        // In Wails WebView haben wir leider nur den Dateinamen, nicht den Pfad.
        // Falls der Pfad verfügbar ist (macOS WebKit gibt ihn manchmal), nutzen wir ihn.
        const file = files[0];
        const path = file.path || ''; // Electron-/Wails-Erweiterung
        if (path) {
          scanFileWithVT(path);
        } else {
          // Fallback: Hash des Datei-Inhalts berechnen (browser-seitig)
          scanFileContentWithVT(file);
        }
      }
    });
  }

  // ── OpenRouter Modell-Picker ───────────────────────────────────────────────
  document.getElementById('btn-load-or-models')?.addEventListener('click', loadOpenRouterModels);
  document.getElementById('or-model-search')?.addEventListener('input', filterORModels);
  document.getElementById('or-only-free')?.addEventListener('change', filterORModels);
}

/** Liest den sichtbaren Text aus dem Terminal-Output als plain text. */
function getTerminalText() {
  const out = document.getElementById('terminal-output');
  if (!out) return '';
  // Iteriere über alle Blöcke und baue formatierten Text
  return Array.from(out.querySelectorAll('.terminal-block')).map(block => {
    const cmd = block.querySelector('.terminal-cmd')?.textContent ?? '';
    const res = block.querySelector('.terminal-result')?.textContent ?? '';
    return cmd + (res ? '\n' + res : '');
  }).join('\n\n') || out.textContent;
}

function termWrite(header, body) {
  const out = document.getElementById('terminal-output');
  if (!out) return;
  out.querySelector('.console-placeholder')?.remove();
  const block = document.createElement('div');
  block.className = 'terminal-block';
  block.innerHTML = `<span class="terminal-cmd">${escapeHtml(header)}</span>`;
  if (body) block.innerHTML += `\n<span class="terminal-result">${escapeHtml(body)}</span>`;
  out.appendChild(block);
  out.scrollTop = out.scrollHeight;
}

function termAppend(text) {
  const out = document.getElementById('terminal-output');
  if (!out) return;
  const last = out.querySelector('.terminal-block:last-child .terminal-result');
  if (last) {
    last.textContent = text;
  } else {
    const span = document.createElement('span');
    span.className = 'terminal-result';
    span.textContent = text;
    out.querySelector('.terminal-block:last-child')?.appendChild(span);
  }
  out.scrollTop = out.scrollHeight;
}

async function scanFileWithVT(filePath) {
  const vtKey = state.config?.api_keys?.virustotal ?? '';
  const name = filePath.split('/').pop().split('\\').pop();
  showVTFileResult('loading', `Berechne SHA256 für: ${name}…`);
  try {
    const hash = await HashFileForVT(filePath);
    if (!vtKey) {
      // Ohne API-Key: Browser öffnen
      showVTFileResult('info', `${name}\nSHA256: ${hash}\nÖffne virustotal.com im Browser…`);
      OpenVTInBrowser(hash);
      addAction('VT Browser-Check gestartet: ' + hash.slice(0, 12) + '…', 'info');
      return;
    }
    // Mit API-Key: Hash-Lookup
    showVTFileResult('loading', `${name}\nSHA256: ${hash}\nPrüfe per Hash-Lookup…`);
    const batchResult = await CheckVirusTotalItems([{ name, path: filePath, item_type: 'file' }]);
    const r = batchResult?.results?.[0];
    if (!r) { showVTFileResult('error', 'Keine Antwort von VT.'); return; }

    if (r.status === 'not_found') {
      // Hash unbekannt → Upload anbieten
      showVTFileResultWithUpload(filePath, name, hash);
      return;
    }
    const cls = r.status === 'malicious' ? 'error' : r.status === 'clean' ? 'ok' : 'info';
    showVTFileResult(cls, `${name}\nSHA256: ${hash}\nStatus: ${r.status}${r.detections > 0 ? ` (${r.detections}/${r.engines} Engines)` : ''}`);
  } catch (err) {
    showVTFileResult('error', 'Fehler: ' + err);
  }
}

function showVTFileResultWithUpload(filePath, name, hash) {
  const el = document.getElementById('vt-file-result');
  if (!el) return;
  el.classList.remove('hidden');
  el.className = 'vt-file-result vt-file-info';
  el.innerHTML = `
    <span>– ${escapeHtml(name)}<br>SHA256: ${escapeHtml(hash)}<br>Kein VT-Eintrag gefunden — Datei noch nicht bekannt.</span>
    <div style="margin-top:8px">
      <button class="btn btn-sm btn-secondary" id="btn-vt-upload-confirm">
        ⬆ Datei an VirusTotal senden (Analyse ~1–2 Min.)
      </button>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:4px">
        Die Datei wird an virustotal.com übermittelt und ist dort öffentlich einsehbar.
      </p>
    </div>`;
  document.getElementById('btn-vt-upload-confirm')?.addEventListener('click', () => {
    uploadFileToVT(filePath, name);
  });
}

async function uploadFileToVT(filePath, name) {
  showVTFileResult('loading', `${name}\nWird hochgeladen und analysiert — bitte warten (bis zu 2 Min.)…`);
  try {
    const r = await UploadFileToVirusTotal(filePath);
    const cls = r.status === 'malicious' ? 'error' : r.status === 'clean' ? 'ok' : 'info';
    showVTFileResult(cls, `${name}\nSHA256: ${r.sha256}\nStatus: ${r.status}${r.detections > 0 ? ` (${r.detections}/${r.engines} Engines)` : ''}`);
    addAction(`VT-Upload abgeschlossen: ${name} → ${r.status}`, r.status === 'malicious' ? 'error' : 'success');
  } catch (err) {
    showVTFileResult('error', 'Upload-Fehler: ' + err);
  }
}

async function scanFileContentWithVT(file) {
  // Browser-seitige SHA256 Berechnung wenn Pfad nicht verfügbar
  try {
    showVTFileResult('loading', `Lese Datei: ${file.name}`);
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    showVTFileResult('info', `${file.name}\nSHA256: ${hash}\nÖffne virustotal.com…`);
    OpenVTInBrowser(hash);
  } catch (err) {
    showVTFileResult('error', 'Fehler: ' + err);
  }
}

function showVTFileResult(type, text) {
  const el = document.getElementById('vt-file-result');
  if (!el) return;
  el.classList.remove('hidden');
  const icons = { ok: '✓', error: '⛔', info: 'ℹ', loading: '⏳' };
  const cls = { ok: 'vt-file-ok', error: 'vt-file-error', info: 'vt-file-info', loading: 'vt-file-info' };
  el.className = `vt-file-result ${cls[type] ?? 'vt-file-info'}`;
  el.innerHTML = `<span>${icons[type] ?? 'ℹ'} ${escapeHtml(text).replace(/\n/g, '<br>')}</span>`;
}

async function sendOutputToAI(context, text) {
  const provider = document.getElementById('ai-provider-select')?.value ?? 'chatgpt';
  const prompt = `=== AdminKit: ${context} ===\n\n${text}\n\n=== Frage ===\nBitte analysiere diese Ausgabe. Gibt es Auffälligkeiten, Fehler oder Sicherheitsrisiken? Kurze Antwort auf Deutsch.`;

  if (AI_BROWSER_URLS[provider]) {
    try { await navigator.clipboard.writeText(prompt); } catch {}
    if (window.runtime?.BrowserOpenURL) window.runtime.BrowserOpenURL(AI_BROWSER_URLS[provider]);
    showToast('Ausgabe kopiert — füge sie im Browser ein.');
    return;
  }

  const modal = document.getElementById('modal-ai-response');
  const title = document.getElementById('ai-response-title');
  const pre   = document.getElementById('ai-response-text');
  if (!modal || !pre) return;
  title.textContent = `🤖 KI-Analyse (${provider})`;
  pre.textContent = 'Anfrage läuft…';
  modal.classList.remove('hidden');

  try {
    let response;
    if (provider === 'ollama' || provider === 'lmstudio') {
      const baseURL = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234';
      const model = provider === 'ollama' ? (state.config?.ai_models?.ollama || 'llama3.2') : (state.config?.ai_models?.lmstudio || 'local-model');
      response = await CallLocalAI(baseURL, model, prompt);
    } else {
      const model = state.config?.ai_models?.[provider] || defaultModelFor(provider);
      response = await CallAI(provider, model, prompt);
    }
    pre.textContent = response;
  } catch (err) {
    pre.textContent = 'Fehler: ' + err;
  }
}

// ─── OpenRouter Modell-Picker ─────────────────────────────────────────────────

let orModelsCache = [];

async function loadOpenRouterModels() {
  const btn = document.getElementById('btn-load-or-models');
  const picker = document.getElementById('or-model-picker');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    const onlyFree = document.getElementById('or-only-free')?.checked ?? false;
    orModelsCache = await GetOpenRouterModels(onlyFree);
    picker?.classList.remove('hidden');
    renderORModels(orModelsCache);
  } catch (err) {
    showToast('OpenRouter-Modelle konnten nicht geladen werden: ' + err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
  }
}

function filterORModels() {
  const query = (document.getElementById('or-model-search')?.value ?? '').toLowerCase();
  const onlyFree = document.getElementById('or-only-free')?.checked ?? false;
  const filtered = orModelsCache.filter(m =>
    (!onlyFree || m.is_free) &&
    (!query || m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
  );
  renderORModels(filtered);
}

function renderORModels(models) {
  const list = document.getElementById('or-model-list');
  if (!list) return;
  if (models.length === 0) {
    list.innerHTML = '<p class="info-placeholder" style="font-size:12px">Keine Modelle gefunden.</p>';
    return;
  }
  list.innerHTML = models.slice(0, 50).map(m => `
    <div class="or-model-item" data-id="${escapeHtml(m.id)}" title="${escapeHtml(m.description || m.id)}">
      <span class="or-model-name">${escapeHtml(m.name)}</span>
      ${m.is_free ? '<span class="or-badge-free">kostenlos</span>' : `<span class="or-badge-paid">$${m.price_prompt > 0 ? m.price_prompt.toFixed(7) : '?'}/token</span>`}
    </div>`).join('');

  list.querySelectorAll('.or-model-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const modelInput = document.getElementById('setting-model-openrouter');
      if (modelInput) modelInput.value = id;
      document.getElementById('or-model-picker')?.classList.add('hidden');
      showToast(`Modell gewählt: ${id}`);
    });
  });
}

// ─── System-Tab Suche ─────────────────────────────────────────────────────────

function initSystemSearch() {
  document.getElementById('system-search')?.addEventListener('input', e => {
    filterSystemTab(e.target.value.trim().toLowerCase());
  });
}

function filterSystemTab(query) {
  const sysTab = document.getElementById('tab-system');
  if (!sysTab) return;

  // Reset: alle Elemente wieder sichtbar machen
  sysTab.querySelectorAll('.info-key, .info-val, .smart-disk, .hw-volume-item, tbody tr, .autostart-group, .info-section').forEach(el => {
    el.style.display = '';
  });

  if (!query) return;

  const visibleGroups  = new Set();
  const visibleSections = new Set();

  // 1. Info-Grid Key-Value-Paare
  sysTab.querySelectorAll('.info-key').forEach(keyEl => {
    const valEl = keyEl.nextElementSibling;
    if (!valEl?.classList.contains('info-val')) return;
    const text = (keyEl.textContent + ' ' + valEl.textContent).toLowerCase();
    if (text.includes(query)) {
      visibleSections.add(keyEl.closest('.info-section'));
    } else {
      keyEl.style.display = 'none';
      valEl.style.display = 'none';
    }
  });

  // 2. Smart-Disk und Adapter-Blöcke
  sysTab.querySelectorAll('.smart-disk').forEach(block => {
    if (block.textContent.toLowerCase().includes(query)) {
      visibleSections.add(block.closest('.info-section'));
    } else {
      block.style.display = 'none';
    }
  });

  // 3. Speicher-Volume-Items
  sysTab.querySelectorAll('.hw-volume-item').forEach(vol => {
    if (vol.textContent.toLowerCase().includes(query)) {
      visibleSections.add(vol.closest('.info-section'));
    } else {
      vol.style.display = 'none';
    }
  });

  // 4. Tabellenzeilen in tbody
  sysTab.querySelectorAll('tbody tr').forEach(tr => {
    const group = tr.closest('.autostart-group');
    if (tr.textContent.toLowerCase().includes(query)) {
      if (group) visibleGroups.add(group);
      visibleSections.add(tr.closest('.info-section'));
    } else {
      tr.style.display = 'none';
    }
  });

  // 5. Autostart-Gruppen-Container auswerten (Gruppen-Titel matcht → alle Zeilen zeigen)
  sysTab.querySelectorAll('.autostart-group').forEach(group => {
    const titleText = (group.querySelector('.autostart-group-title')?.textContent ?? '').toLowerCase();
    if (titleText.includes(query)) {
      group.querySelectorAll('tbody tr').forEach(tr => { tr.style.display = ''; });
      visibleGroups.add(group);
      visibleSections.add(group.closest('.info-section'));
    }
    if (!visibleGroups.has(group)) {
      group.style.display = 'none';
    }
  });

  // 6. Info-Sektionen ohne sichtbaren Inhalt ausblenden
  sysTab.querySelectorAll('.info-section').forEach(section => {
    if (!visibleSections.has(section)) {
      section.style.display = 'none';
    }
  });
}

// ─── Scan-Zusammenfassung ─────────────────────────────────────────────────────

function initScanSummaryModal() {
  document.getElementById('btn-summary-close')?.addEventListener('click', closeScanSummary);
  document.getElementById('btn-summary-ok')?.addEventListener('click', closeScanSummary);
  document.getElementById('modal-scan-summary')?.addEventListener('click', e => {
    if (e.target.id === 'modal-scan-summary') closeScanSummary();
  });
}

function closeScanSummary() {
  document.getElementById('modal-scan-summary')?.classList.add('hidden');
}

// ─── Benutzerkonten ───────────────────────────────────────────────────────────

async function runUsersScan() {
  const btn = document.getElementById('btn-scan-users');
  const container = document.getElementById('users-info');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  if (container) container.innerHTML = '<div class="info-placeholder">Scanne Benutzerkonten…</div>';
  try {
    const result = await ScanUsers();
    renderUsers(result);
    const count = result?.users?.length ?? 0;
    setEl('users-count', count.toString());
    setStatus(`Benutzer-Scan: ${count} Konten gefunden`);
    addAction(`Benutzer-Scan: ${count} lokale Konten`, 'info');
  } catch (err) {
    if (container) container.innerHTML = `<div class="info-placeholder">Fehler: ${escapeHtml(String(err))}</div>`;
    addAction('Benutzer-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '👤 Benutzer scannen'; }
  }
}

function renderUsers(result) {
  const container = document.getElementById('users-info');
  if (!container) return;
  if (!result?.users?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Benutzerkonten gefunden.</div>';
    return;
  }

  const adminNames = new Set(
    (result.groups ?? []).flatMap(g => g.members ?? []).map(m => m.toLowerCase())
  );

  const rows = result.users.map(u => {
    const adminBadge = u.is_admin ? '<span class="user-badge user-admin">Admin</span>' : '';
    const sysBadge   = u.is_system ? '<span class="user-badge user-system">System</span>' : '';
    const disBadge   = u.is_disabled ? '<span class="user-badge user-disabled">Deaktiviert</span>' : '';
    const pwBadge    = !u.has_password ? '<span class="user-badge user-nopw">Kein Passwort</span>' : '';
    const fullName   = u.full_name ? `<span class="user-fullname">${escapeHtml(u.full_name)}</span>` : '';
    return `<tr class="${u.is_disabled ? 'row-disabled' : ''}">
      <td>${escapeHtml(u.name)} ${fullName}</td>
      <td>${adminBadge}${sysBadge}${disBadge}${pwBadge}</td>
      <td class="mono">${u.uid ?? '–'}</td>
      <td class="mono">${escapeHtml(u.shell || '–')}</td>
      <td class="mono">${escapeHtml(u.home_dir || '–')}</td>
    </tr>`;
  }).join('');

  let groupHtml = '';
  if (result.groups?.length) {
    groupHtml = `<h4 style="margin:16px 0 8px;font-size:13px;color:var(--color-text-muted)">Gruppen</h4>
    <div class="info-grid">${result.groups.map(g =>
      `<div class="info-item"><span class="info-key">${escapeHtml(g.name)}</span>
       <span class="info-val">${(g.members ?? []).join(', ') || '–'}</span></div>`
    ).join('')}</div>`;
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>Benutzername</th><th>Status</th><th>UID</th><th>Shell</th><th>Home</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${groupHtml}`;
}

// ─── Geplante Aufgaben ────────────────────────────────────────────────────────

async function runTasksScan() {
  const btn = document.getElementById('btn-scan-tasks');
  const container = document.getElementById('tasks-info');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  if (container) container.innerHTML = '<div class="info-placeholder">Scanne geplante Aufgaben…</div>';
  try {
    const result = await ScanScheduledTasks();
    renderTasks(result);
    const count = result?.tasks?.length ?? 0;
    setEl('tasks-count', count.toString());
    setStatus(`Aufgaben-Scan: ${count} Aufgaben gefunden`);
    addAction(`Aufgaben-Scan: ${count} geplante Aufgaben`, 'info');
  } catch (err) {
    if (container) container.innerHTML = `<div class="info-placeholder">Fehler: ${escapeHtml(String(err))}</div>`;
    addAction('Aufgaben-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🗓 Aufgaben scannen'; }
  }
}

function renderTasks(result) {
  const container = document.getElementById('tasks-info');
  if (!container) return;
  if (!result?.tasks?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine geplanten Aufgaben gefunden.</div>';
    return;
  }

  // Nicht-System-Aufgaben oben
  const sorted = [...result.tasks].sort((a, b) => (a.is_system ? 1 : 0) - (b.is_system ? 1 : 0));

  const rows = sorted.map(t => {
    const enBadge  = !t.is_enabled ? '<span class="user-badge user-disabled">Deaktiviert</span>' : '';
    const sysBadge = t.is_system ? '<span class="user-badge user-system">System</span>' : '';
    const cmd = t.command?.length > 80 ? t.command.slice(0, 77) + '…' : t.command || '–';
    const nextRun = t.next_run ? new Date(t.next_run).toLocaleString('de-DE') : '–';
    return `<tr class="${!t.is_enabled ? 'row-disabled' : ''}">
      <td>${escapeHtml(t.name)}${sysBadge}${enBadge}</td>
      <td class="mono" title="${escapeHtml(t.command || '')}">${escapeHtml(cmd)}</td>
      <td>${escapeHtml(t.schedule || '–')}</td>
      <td>${nextRun}</td>
      <td>${escapeHtml(t.run_as_user || '–')}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>Name</th><th>Befehl</th><th>Zeitplan</th><th>Nächste Ausführung</th><th>Als Benutzer</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Konfigurationsprofile ────────────────────────────────────────────────────

async function runProfilesScan() {
  const btn = document.getElementById('btn-scan-profiles');
  const container = document.getElementById('profiles-info');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  if (container) container.innerHTML = '<div class="info-placeholder">Scanne Konfigurationsprofile…</div>';
  try {
    const result = await ScanConfigProfiles();
    renderProfiles(result);
    const count = result?.profiles?.length ?? 0;
    setEl('profiles-count', count.toString());
    setStatus(`Profil-Scan: ${count} Profile gefunden`);
    addAction(`Profil-Scan: ${count} Konfigurationsprofile`, 'info');
  } catch (err) {
    if (container) container.innerHTML = `<div class="info-placeholder">Fehler: ${escapeHtml(String(err))}</div>`;
    addAction('Profil-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🛡 Profile scannen'; }
  }
}

function renderProfiles(result) {
  const container = document.getElementById('profiles-info');
  if (!container) return;
  if (!result?.profiles?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Konfigurationsprofile installiert.</div>';
    return;
  }

  const rows = result.profiles.map(p => {
    const verBadge = p.verified ? '<span class="user-badge">✅ Verifiziert</span>' : '';
    const payloads = (p.payload_types || []).join(', ') || '–';
    const installed = p.install_date ? new Date(p.install_date).toLocaleDateString('de-DE') : '–';
    return `<tr>
      <td><strong>${escapeHtml(p.name)}</strong>${verBadge}</td>
      <td>${escapeHtml(p.organization || '–')}</td>
      <td class="mono" style="font-size:11px">${escapeHtml(p.identifier || '–')}</td>
      <td>${escapeHtml(payloads)}</td>
      <td>${installed}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>Name</th><th>Organisation</th><th>Identifier</th><th>Payload-Typen</th><th>Installiert</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── USB-Geräte ───────────────────────────────────────────────────────────────

async function runUSBScan() {
  const btn = document.getElementById('btn-scan-usb');
  const container = document.getElementById('usb-info');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  if (container) container.innerHTML = '<div class="info-placeholder">Scanne USB-Geräte…</div>';
  try {
    const result = await ScanUSBDevices();
    renderUSBDevices(result);
    const count = result?.devices?.length ?? 0;
    setEl('usb-count', count.toString());
    setStatus(`USB-Scan: ${count} Geräte gefunden`);
    addAction(`USB-Scan: ${count} USB-Geräte`, 'info');
  } catch (err) {
    if (container) container.innerHTML = `<div class="info-placeholder">Fehler: ${escapeHtml(String(err))}</div>`;
    addAction('USB-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔌 USB scannen'; }
  }
}

function renderUSBDevices(result) {
  const container = document.getElementById('usb-info');
  if (!container) return;
  if (!result?.devices?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine USB-Geräte gefunden.</div>';
    return;
  }

  const rows = result.devices.map(d => {
    const hubCls = d.is_hub ? 'style="color:var(--muted-color)"' : '';
    return `<tr>
      <td ${hubCls}>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.manufacturer || '–')}</td>
      <td class="mono">${escapeHtml(d.vendor_id || '–')}</td>
      <td class="mono">${escapeHtml(d.product_id || '–')}</td>
      <td class="mono" style="font-size:11px">${escapeHtml(d.serial_number || '–')}</td>
      <td>${escapeHtml(d.speed || '–')}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>Name</th><th>Hersteller</th><th>VID</th><th>PID</th><th>Seriennummer</th><th>Geschwindigkeit</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function runAutoVTScan() {
  const requests = [];
  state.lastAutostartResult?.entries?.forEach(e => {
    if (e.path) requests.push({ name: e.name, path: e.path, item_type: 'autostart' });
  });
  state.lastServicesResult?.services?.forEach(s => {
    if (s.path) requests.push({ name: s.display_name || s.name, path: s.path, item_type: 'service' });
  });
  if (requests.length === 0) return;

  setStatus(`Auto-VT-Scan: ${requests.length} Einträge werden geprüft…`);
  showToast(`Auto-VT-Scan gestartet — ${requests.length} Einträge.`);
  addAction(`Auto-VT-Scan: ${requests.length} Autostart- und Dienste-Einträge`, 'info');

  const auditLog = [];
  const pathToType = {};
  requests.forEach(r => { pathToType[r.path] = r.item_type; });

  try {
    if (window.runtime?.EventsOn) {
      window.runtime.EventsOn('vt:progress', (data) => {
        setStatus(`Auto-VT: ${data.current}/${data.total} — ${data.result?.name ?? ''}`);
        if (data.result) {
          injectVTBadge(data.result);
          if (data.result.status === 'malicious') {
            addAction(`VT-Treffer: ${data.result.name} (${data.result.detections}/${data.result.engines})`, 'error');
          }
          auditLog.push({
            name: data.result.name, path: data.result.path ?? '',
            item_type: pathToType[data.result.path] ?? '',
            status: data.result.status, sha256: data.result.sha256 ?? '',
            detections: data.result.detections ?? 0, engines: data.result.engines ?? 0,
            checked_at: new Date().toISOString(),
          });
        }
      });
    }

    await CheckVirusTotalItems(requests);

    const hits = auditLog.filter(e => e.status === 'malicious').length;
    const msg = hits > 0
      ? `Auto-VT abgeschlossen: ${hits} Treffer von ${requests.length} Einträgen!`
      : `Auto-VT abgeschlossen: ${requests.length} Einträge geprüft, alles sauber.`;
    setStatus(msg);
    showToast(msg);
    addAction(msg, hits > 0 ? 'error' : 'success');

    if (auditLog.length > 0) {
      try { await SaveVTAuditLog(JSON.stringify(auditLog)); } catch {}
    }
  } catch (err) {
    showToast('Auto-VT-Scan Fehler: ' + err);
    addAction('Auto-VT-Scan Fehler: ' + err, 'error');
  } finally {
    if (window.runtime?.EventsOff) window.runtime.EventsOff('vt:progress');
  }
}

function showScanSummary() {
  const modal    = document.getElementById('modal-scan-summary');
  const modGrid  = document.getElementById('summary-modules');
  const modFindings = document.getElementById('summary-findings');
  if (!modal || !modGrid || !modFindings) return;

  // ── Modul-Status ──────────────────────────────────────────────────────────
  const modules = [
    { name: 'System / Hardware', result: state.lastScanResult },
    { name: 'Autostart',         result: state.lastAutostartResult },
    { name: 'Dienste',           result: state.lastServicesResult },
    { name: 'Ereignislog',       result: state.lastEventsResult },
    { name: 'Drucker',           result: state.lastPrinterResult },
    { name: 'Netzwerk',          result: state.lastNetworkResult },
    { name: 'Software',          result: state.lastSoftwareResult },
    { name: 'Extensions',        result: state.lastBrowserExtResult },
  ];

  modGrid.innerHTML = '<div class="summary-modules-grid">' +
    modules.map(m => {
      if (!m.result) {
        return `<div class="summary-module summary-module-error">✗ ${escapeHtml(m.name)}</div>`;
      }
      const errs = m.result.errors?.length ?? 0;
      return errs > 0
        ? `<div class="summary-module summary-module-warning">⚠ ${escapeHtml(m.name)} (${errs})</div>`
        : `<div class="summary-module summary-module-ok">✓ ${escapeHtml(m.name)}</div>`;
    }).join('') +
    '</div>';

  // ── Befunde analysieren ───────────────────────────────────────────────────
  const critical = [];
  const warnings = [];
  const ok       = [];
  const scanErrs = [];

  const sys     = state.lastScanResult;
  const sec     = sys?.security;
  const auto    = state.lastAutostartResult;
  const evtRes  = state.lastEventsResult;

  // Sicherheit
  if (sec) {
    const isMac = sec.platform === 'darwin';
    const encLabel = isMac ? 'FileVault' : 'BitLocker';
    const defLabel = isMac ? 'Gatekeeper / XProtect' : 'Windows Defender';

    if (sec.firewall_known) {
      if (sec.firewall_enabled === false) critical.push('🔥 Firewall ist deaktiviert');
      else if (sec.firewall_enabled === true) ok.push('Firewall aktiv');
    }

    if (sec.defender_enabled === false) critical.push(`🛡 ${defLabel} ist deaktiviert`);
    else if (sec.defender_enabled === true)
      ok.push(`${defLabel} aktiv${sec.defender_version ? ' (' + sec.defender_version + ')' : ''}`);

    if (sec.rdp_enabled === true) {
      const rdpLabel = isMac ? 'Remote Login (SSH)' : 'RDP';
      if (!isMac && !sec.nla_enabled) warnings.push(`🖥 ${rdpLabel} aktiv ohne NLA (Network Level Authentication)`);
      else ok.push(`${rdpLabel} aktiv (Port ${sec.rdp_port || (isMac ? 22 : 3389)})`);
    } else if (sec.rdp_enabled === false) {
      ok.push(isMac ? 'Remote Login (SSH) deaktiviert' : 'RDP deaktiviert');
    }

    const userShares = sec.local_shares?.filter(s => !s.is_system) ?? [];
    if (userShares.length > 0)
      warnings.push(`📂 ${userShares.length} aktive Netzwerkfreigabe(n): ${userShares.map(s => s.name).join(', ')}`);

    const unencrypted = sec.bitlocker_volumes?.filter(v => !v.encrypted) ?? [];
    if (unencrypted.length > 0)
      warnings.push(`🔓 ${unencrypted.length} Laufwerk(e) ohne ${encLabel}-Verschlüsselung`);
    else if (sec.bitlocker_volumes?.length > 0)
      ok.push(`Alle Laufwerke mit ${encLabel} verschlüsselt`);
  }

  // SMART
  if (sys?.smart?.length > 0) {
    const critDisks = sys.smart.filter(d => d.status === 'CRITICAL');
    const warnDisks = sys.smart.filter(d => d.status === 'WARNING');
    if (critDisks.length > 0)
      critical.push(`💾 ${critDisks.length} Festplatte(n) KRITISCHER SMART-Status: ${critDisks.map(d => d.model).join(', ')}`);
    if (warnDisks.length > 0)
      warnings.push(`💾 ${warnDisks.length} Festplatte(n) mit SMART-Warnung: ${warnDisks.map(d => d.model).join(', ')}`);
    if (critDisks.length === 0 && warnDisks.length === 0)
      ok.push(`SMART: alle ${sys.smart.length} Disk(s) OK`);
  }

  // Lizenz / OS
  if (sys?.os?.license_status) {
    const ls = sys.os.license_status;
    if (ls !== 'Licensed' && ls !== 'Lizenziert' && ls !== 'Licensed (OEM)')
      warnings.push(`📋 Betriebssystem-Lizenz: ${ls}`);
  }

  // Speicherplatz
  if (sys?.hardware?.volumes?.length > 0) {
    let allOk = true;
    sys.hardware.volumes.forEach(vol => {
      const pct = vol.total_gb > 0 ? Math.round((vol.used_gb / vol.total_gb) * 100) : 0;
      const lbl = vol.label || vol.letter || 'Volume';
      if (pct >= 95)      { critical.push(`💾 ${lbl}: ${pct}% voll (${vol.free_gb} GB frei)`); allOk = false; }
      else if (pct >= 80) { warnings.push(`💾 ${lbl}: ${pct}% voll (${vol.free_gb} GB frei)`); allOk = false; }
    });
    if (allOk) ok.push('Speicherplatz: alle Volumes unkritisch');
  }

  // Systemereignisse
  if (evtRes?.events?.length > 0) {
    const critEvts  = evtRes.events.filter(e => e.level === 'Kritisch');
    const errorEvts = evtRes.events.filter(e => e.level === 'Fehler');
    if (critEvts.length > 0)
      critical.push(`⚠ ${critEvts.length} kritische Systemereignisse (letzte 7 Tage)`);
    if (errorEvts.length > 0)
      warnings.push(`⚠ ${errorEvts.length} Fehler-Ereignisse im Ereignislog`);
    if (critEvts.length === 0 && errorEvts.length === 0)
      ok.push('Ereignis-Log: keine kritischen Ereignisse');
  } else if (evtRes) {
    ok.push('Ereignis-Log: keine kritischen Ereignisse');
  }

  // Autostart
  if (auto?.entries?.length > 0) {
    const thirdParty = auto.entries.filter(e => !e.is_system && e.is_enabled);
    if (thirdParty.length > 15)
      warnings.push(`🚀 ${thirdParty.length} aktive Drittanbieter-Autostart-Einträge`);
    else
      ok.push(`Autostart: ${thirdParty.length} Drittanbieter-Einträge (${auto.entries.length} gesamt)`);
  }

  // Netzwerk
  if (state.lastNetworkResult?.adapters?.length > 0) {
    const connected = state.lastNetworkResult.adapters.filter(a => a.is_connected).length;
    const total     = state.lastNetworkResult.adapters.length;
    if (connected === 0) warnings.push('🌐 Kein Netzwerkadapter verbunden');
    else ok.push(`Netzwerk: ${connected}/${total} Adapter verbunden`);
  }

  // Partielle Scan-Fehler aus allen Ergebnissen
  const allResults  = [sys, auto, state.lastServicesResult, evtRes, state.lastPrinterResult,
                       state.lastNetworkResult, state.lastSoftwareResult, state.lastBrowserExtResult];
  const modNames    = ['System', 'Autostart', 'Dienste', 'Ereignislog', 'Drucker', 'Netzwerk', 'Software', 'Extensions'];
  allResults.forEach((r, i) => {
    r?.errors?.forEach(e => scanErrs.push(`[${modNames[i]}/${e.module}] ${e.message}`));
  });

  // ── HTML ausgeben ─────────────────────────────────────────────────────────
  let html = '';

  if (critical.length > 0) {
    html += '<div class="summary-section"><div class="summary-section-title">🔴 Kritisch</div>';
    html += critical.map(f => `<div class="summary-finding summary-critical">${escapeHtml(f)}</div>`).join('');
    html += '</div>';
  }
  if (warnings.length > 0) {
    html += '<div class="summary-section"><div class="summary-section-title">🟡 Hinweise</div>';
    html += warnings.map(f => `<div class="summary-finding summary-warning">${escapeHtml(f)}</div>`).join('');
    html += '</div>';
  }
  if (ok.length > 0) {
    html += '<div class="summary-section"><div class="summary-section-title">🟢 OK</div>';
    html += ok.map(f => `<div class="summary-finding summary-ok">${escapeHtml(f)}</div>`).join('');
    html += '</div>';
  }
  if (scanErrs.length > 0) {
    html += '<div class="summary-section"><div class="summary-section-title">⚙ Scan-Hinweise</div>';
    html += scanErrs.map(f => `<div class="summary-finding summary-scan-error">${escapeHtml(f)}</div>`).join('');
    html += '</div>';
  }
  if (!html) {
    html = '<p class="info-placeholder">Keine auffälligen Befunde.</p>';
  }

  modFindings.innerHTML = html;
  modal.classList.remove('hidden');
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
  document.getElementById('btn-export-csv')?.addEventListener('click', () => runExportCSV());
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
  document.getElementById('modal-archive-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-archive-overlay') closeArchiveModal();
  });
}

async function runExport(format) {
  document.getElementById('export-dropdown')?.classList.remove('open');

  const btn = document.getElementById('btn-export');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Exportiere…'; }

  try {
    const path = await ExportSession(format);
    showExportModal(format, path);
    addAction(`Bericht exportiert (${format.toUpperCase()}): ${shortenPath(path)}`, 'success', { filePath: path });
  } catch (err) {
    showExportModal(format, null, String(err));
    addAction(`Export fehlgeschlagen: ${err}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📤 Exportieren ▾'; }
  }
}

async function runExportCSV() {
  document.getElementById('export-dropdown')?.classList.remove('open');

  const btn = document.getElementById('btn-export');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Exportiere…'; }

  try {
    const path = await ExportCSV();
    showExportModal('CSV', path);
    addAction(`CSV exportiert: ${shortenPath(path)}`, 'success', { filePath: path });
  } catch (err) {
    showExportModal('CSV', null, String(err));
    addAction(`CSV-Export fehlgeschlagen: ${err}`, 'error');
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
    title.textContent = `✓ Bericht erstellt (${format.toUpperCase()})`;
    body.innerHTML = `
      <p>Die Datei wurde erfolgreich gespeichert:</p>
      <div class="export-path">${escapeHtml(path)}</div>
      <div class="export-file-actions">
        <button class="btn btn-primary btn-sm" id="btn-open-file">📄 Datei öffnen</button>
        <button class="btn btn-secondary btn-sm" id="btn-reveal-file">📂 Im Finder anzeigen</button>
      </div>
    `;
    // Buttons verdrahten
    document.getElementById('btn-open-file')?.addEventListener('click', async () => {
      try { await OpenFile(path); } catch (e) { addAction('Datei konnte nicht geöffnet werden: ' + e, 'error'); }
    });
    document.getElementById('btn-reveal-file')?.addEventListener('click', async () => {
      try { await RevealFile(path); } catch (e) { addAction('Datei konnte nicht angezeigt werden: ' + e, 'error'); }
    });
  }
  overlay.classList.remove('hidden');
}

function closeExportModal() {
  document.getElementById('export-modal-overlay')?.classList.add('hidden');
}

// ─── Vault-Archivierung ───────────────────────────────────────────────────────

function showArchiveResult(result) {
  const overlay = document.getElementById('modal-archive-result-overlay');
  if (!overlay) return;
  const mb = ((result.copied_bytes || 0) / 1048576).toFixed(1);
  const stats = document.getElementById('archive-result-stats');
  if (stats) stats.textContent = `${result.copied_files} Dateien · ${mb} MB gesichert · ${result.deleted_dirs} Einträge aus Vault gelöscht`;
  const pathEl = document.getElementById('archive-result-path');
  if (pathEl) pathEl.textContent = result.archive_path || '–';

  const revealBtn = document.getElementById('archive-result-reveal');
  if (revealBtn) {
    revealBtn.onclick = async () => {
      try { await RevealFile(result.archive_path); } catch (e) { /* ignore */ }
    };
  }

  const okBtn = document.getElementById('archive-result-ok');
  const closeBtn = document.getElementById('archive-result-close');
  const closeResult = () => overlay.classList.add('hidden');
  if (okBtn) okBtn.onclick = closeResult;
  if (closeBtn) closeBtn.onclick = closeResult;
  overlay.onclick = (e) => { if (e.target === overlay) closeResult(); };

  overlay.classList.remove('hidden');
}

function openArchiveModal() {
  const overlay = document.getElementById('modal-archive-overlay');
  if (!overlay) return;
  // Zustand zurücksetzen
  document.getElementById('archive-dest-display').textContent = 'Kein Ziel ausgewählt';
  const startBtn = document.getElementById('archive-btn-start');
  if (startBtn) { startBtn.disabled = true; delete startBtn.dataset.dest; }
  overlay.classList.remove('hidden');
}

function closeArchiveModal() {
  document.getElementById('modal-archive-overlay')?.classList.add('hidden');
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

  // API-Key Sichtbarkeits-Toggle
  document.querySelectorAll('.api-key-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      // Wenn ••• angezeigt: Feld leeren damit neu eingegeben werden kann
      if (target.value === '••••••••') {
        target.value = '';
        target.type = 'text';
        btn.textContent = '🙈';
        return;
      }
      const isPass = target.type === 'password';
      target.type = isPass ? 'text' : 'password';
      btn.textContent = isPass ? '🙈' : '👁';
    });
  });

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
  const cfg = state.config;
  if (cfg) {
    document.getElementById('setting-company').value  = cfg.branding?.company_name    ?? '';
    document.getElementById('setting-technician').value = cfg.branding?.technician_name ?? '';
    document.getElementById('setting-logo-path').value = cfg.branding?.logo_path       ?? '';
    document.getElementById('setting-wifi-passwords').checked =
      cfg.defaults?.include_wifi_passwords ?? false;
    document.getElementById('setting-auto-vt-scan').checked =
      cfg.defaults?.auto_vt_scan ?? false;
    // API-Keys (nie im Klartext vorausfüllen — nur *** wenn gesetzt)
    const setKeyField = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val ? '••••••••' : '';
      el?.setAttribute('data-has-value', val ? '1' : '0');
    };
    setKeyField('setting-vt-key',        cfg.api_keys?.virustotal);
    setKeyField('setting-openai-key',    cfg.api_keys?.openai);
    setKeyField('setting-anthropic-key', cfg.api_keys?.anthropic);
    setKeyField('setting-groq-key',      cfg.api_keys?.groq);
    setKeyField('setting-openrouter-key', cfg.api_keys?.openrouter);
    // Modell-Felder
    document.getElementById('setting-model-openai').value      = cfg.ai_models?.openai     ?? '';
    document.getElementById('setting-model-anthropic').value   = cfg.ai_models?.anthropic  ?? '';
    document.getElementById('setting-model-groq').value        = cfg.ai_models?.groq       ?? '';
    document.getElementById('setting-model-ollama').value      = cfg.ai_models?.ollama     ?? '';
    document.getElementById('setting-model-lmstudio').value    = cfg.ai_models?.lmstudio   ?? '';
    document.getElementById('setting-model-openrouter').value  = cfg.ai_models?.openrouter ?? '';
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
  if (!state.config) {
    state.config = { branding: {}, defaults: {}, ui: {}, logging: {}, backup: {}, api_keys: {}, ai_models: {} };
  }
  const cfg = state.config;
  if (!cfg.branding)  cfg.branding  = {};
  if (!cfg.defaults)  cfg.defaults  = {};
  if (!cfg.api_keys)  cfg.api_keys  = {};
  if (!cfg.ai_models) cfg.ai_models = {};

  cfg.branding.company_name    = document.getElementById('setting-company').value.trim();
  cfg.branding.technician_name = document.getElementById('setting-technician').value.trim();
  cfg.branding.logo_path       = document.getElementById('setting-logo-path').value.trim();
  cfg.defaults.include_wifi_passwords =
    document.getElementById('setting-wifi-passwords').checked;
  cfg.defaults.auto_vt_scan =
    document.getElementById('setting-auto-vt-scan').checked;

  // API-Keys: nur speichern wenn tatsächlich neu eingegeben (nicht •••)
  const readKeyField = (id, existingVal) => {
    const el = document.getElementById(id);
    if (!el) return existingVal ?? '';
    const v = el.value.trim();
    if (!v || v === '••••••••') return existingVal ?? '';
    return v;
  };
  cfg.api_keys.virustotal  = readKeyField('setting-vt-key',        cfg.api_keys.virustotal);
  cfg.api_keys.openai      = readKeyField('setting-openai-key',    cfg.api_keys.openai);
  cfg.api_keys.anthropic   = readKeyField('setting-anthropic-key', cfg.api_keys.anthropic);
  cfg.api_keys.groq        = readKeyField('setting-groq-key',      cfg.api_keys.groq);
  cfg.api_keys.openrouter  = readKeyField('setting-openrouter-key', cfg.api_keys.openrouter);

  // Modell-Felder
  cfg.ai_models.openai      = document.getElementById('setting-model-openai')?.value.trim()      || '';
  cfg.ai_models.anthropic   = document.getElementById('setting-model-anthropic')?.value.trim()   || '';
  cfg.ai_models.groq        = document.getElementById('setting-model-groq')?.value.trim()        || '';
  cfg.ai_models.ollama      = document.getElementById('setting-model-ollama')?.value.trim()      || '';
  cfg.ai_models.lmstudio    = document.getElementById('setting-model-lmstudio')?.value.trim()    || '';
  cfg.ai_models.openrouter  = document.getElementById('setting-model-openrouter')?.value.trim()  || '';

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
