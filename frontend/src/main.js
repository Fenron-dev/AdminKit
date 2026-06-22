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
  OpenEventInConsole,
  GetSuggestions,
  RunFix,
  RunQuickAction,
  ScanEventsRange,
  GetDiagnosticReport,
  EjectUSBDevice,
  ToggleAutostartEntry,
  GetCleanupSizes,
  GetHostname,
  SaveScanSnapshot,
  LoadSession,
  GetPeriodicStatus,
  RunPeriodicMaintenance,
  GetHomebrewOutdated,
  RunHomebrewUpgrade,
  GetSSHStatus,
  SetSSHEnabled,
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
  initConfirmModal();
  initActionResultModal();
  initEventDetailModal();
  initQuickActions();
  initWorkflows();
  initPeriodicMaintenance();
  initHomebrew();
  initSSHManagement();
  initDiagnosticReport();
  initSidebarNav();
  initSysPrefsLinks();
  initWikiTab();
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

// ─── Scan-Snapshot (Session-Laden) ───────────────────────────────────────────

async function saveSnapshot(key, data) {
  if (!state.currentSessionPath) return;
  try {
    await SaveScanSnapshot(state.currentSessionPath, key, JSON.stringify(data));
  } catch (e) {
    console.warn('Snapshot konnte nicht gespeichert werden:', key, e);
  }
}

// ─── Zusammenklappbare Sektionen ──────────────────────────────────────────────

function initCollapsibleSections() {
  document.addEventListener('click', (e) => {
    const sectionTitle = e.target.closest('.info-section > .section-title');
    if (sectionTitle) {
      sectionTitle.closest('.info-section').classList.toggle('collapsed');
      return;
    }
    const groupTitle = e.target.closest('.autostart-group > .autostart-group-title');
    if (groupTitle) {
      groupTitle.closest('.autostart-group').classList.toggle('collapsed');
    }
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
    const [version, vaultPath, cfg, hostname] = await Promise.all([
      GetAppVersion(), GetVaultPath(), GetConfig(), GetHostname(),
    ]);
    setEl('app-version', `v${version}`);
    setEl('vault-label', shortenPath(vaultPath));
    setEl('status-vault', shortenPath(vaultPath));

    state.config   = cfg;
    state.hostname = hostname || '';
    updateBrandingBar();
    applyQuickActionVisibility();

    if (cfg?.ui?.theme && !localStorage.getItem('adminkit-theme') && cfg.ui.theme !== 'system') {
      state.theme = cfg.ui.theme;
      applyTheme(state.theme);
    }
    setStatus('Bereit');

    // Beim ersten Start direkt Session-Dialog anzeigen
    if (!state.currentSession) {
      openStartupSessionModal();
    }
  } catch (err) {
    console.warn('Wails-Backend nicht verfügbar (Dev-Modus):', err);
    setEl('app-version', 'v1.0.0-dev');
    setEl('vault-label', './adminkit_vault');
    setStatus('Dev-Modus');
  }
}

// Erzeugt den Vorschlags-Sessionsnamen: YYYY-MM-DD_Techniker_Gerät
function buildDefaultSessionName(customer) {
  var today  = new Date().toISOString().slice(0, 10);
  var tech   = (state.config?.branding?.technician_name || '').replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_').replace(/_+/g, '_');
  var device = (state.hostname || '').replace(/[^a-zA-Z0-9äöüÄÖÜß\-]/g, '_').replace(/_+/g, '_');
  var cust   = (customer || '').trim().replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_').replace(/_+/g, '_');
  var parts  = [today];
  if (tech)   parts.push(tech);
  if (cust)   parts.push(cust);
  if (device) parts.push(device);
  return parts.join('_');
}

function openStartupSessionModal() {
  var modal   = document.getElementById('modal-session');
  var custIn  = document.getElementById('session-customer-input');
  var preview = document.getElementById('session-name-preview');
  if (!modal) return;
  // Preview aktualisieren während Eingabe
  function refreshPreview() {
    if (preview) preview.textContent = buildDefaultSessionName(custIn?.value || '');
  }
  refreshPreview();
  custIn?.removeEventListener('input', refreshPreview);
  custIn?.addEventListener('input', refreshPreview);
  modal.classList.remove('hidden');
  custIn?.focus();
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

// Vordefinierte Workflows: [Label, async Scan-Funktion]
// Jeder Workflow ist eine Teilmenge oder spezifische Kombination der Scanner.
var WORKFLOW_DEFS = [
  {
    id: 'new-pc',
    icon: '🖥',
    name: 'Neue PC-Einrichtung',
    desc: 'Vollscan + Sicherheits-Check + Autostart-Prüfung. Ideal als Einrichtungsprotokoll.',
    steps: [
      ['System',              () => runSystemScan()],
      ['Autostart',          () => runAutostartScan()],
      ['Dienste',            () => runServicesScan()],
      ['Software',           () => runSoftwareScan()],
      ['Benutzerkonten',     () => runUsersScan()],
      ['Konfigurationsprofile', () => runProfilesScan()],
    ],
  },
  {
    id: 'maintenance',
    icon: '🔧',
    name: 'Wöchentliche Wartung',
    desc: 'Ereignisse, Dienste, Autostart und Netzwerk — schnelle Routineprüfung.',
    steps: [
      ['System',    () => runSystemScan()],
      ['Ereignisse', () => runEventsScan()],
      ['Dienste',   () => runServicesScan()],
      ['Autostart', () => runAutostartScan()],
      ['Netzwerk',  () => runNetworkScanBasic()],
    ],
  },
  {
    id: 'troubleshoot',
    icon: '🔍',
    name: 'Problembehandlung',
    desc: 'Ereignisse, Prozesse und Netzwerk — gezielter Blick auf laufende Probleme.',
    steps: [
      ['Ereignisse', () => runEventsScan()],
      ['Prozesse',   () => runProcessScan()],
      ['Netzwerk',   () => runNetworkScanBasic()],
      ['Dienste',    () => runServicesScan()],
    ],
  },
  {
    id: 'security',
    icon: '🛡',
    name: 'Sicherheitsaudit',
    desc: 'Vollständige Sicherheitsprüfung: Autostart, Benutzer, Profile, USB-History.',
    steps: [
      ['System',               () => runSystemScan()],
      ['Autostart',            () => runAutostartScan()],
      ['Browser-Extensions',   () => runBrowserExtScan()],
      ['Benutzerkonten',       () => runUsersScan()],
      ['Konfigurationsprofile', () => runProfilesScan()],
      ['USB-Geräte',           () => runUSBScan()],
    ],
  },
];

/** Vollständiger Scan: alle Scanner nacheinander.
 *  Netzwerk-Scan läuft im Basic-Modus (kein Passwort-Dialog). */
// Vollscan-Schritte: [Label, async Funktion]
var FULLSCAN_STEPS = [
  ['System',              () => runSystemScan()],
  ['Autostart',          () => runAutostartScan()],
  ['Dienste',            () => runServicesScan()],
  ['Prozesse',           () => runProcessScan()],
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

// Bestätigungs-Texte für Quick-Actions (var statt const — verhindert Terser-TDZ)
var QUICK_ACTION_CONFIRM = {
  internet_fix: {
    title:  'Internet-Fix ausführen?',
    what:   'Führt folgende Schritte aus:\n• DNS-Cache leeren\n• mDNSResponder neu starten (macOS) / Winsock zurücksetzen (Windows)\n• IP-Konfiguration freigeben und erneuern',
    impact: 'Alle laufenden Netzwerkverbindungen werden kurz unterbrochen. Downloads, VPN-Verbindungen und Remote-Sessions können abbrechen.',
  },
  printer_fix: {
    title:  'Drucker-Fix ausführen?',
    what:   'Führt folgende Schritte aus:\n• Druckdienst (CUPS / Spooler) stoppen\n• Druckwarteschlange leeren\n• Druckdienst neu starten',
    impact: 'Alle laufenden Druckaufträge werden unwiderruflich abgebrochen und aus der Warteschlange gelöscht. Sie müssen erneut gesendet werden.',
  },
  quick_clean: {
    title:  'Schnellbereinigung ausführen?',
    what:   'Führt folgende Schritte aus:\n• Temporäre Dateien in /tmp bzw. %TEMP% löschen\n• Windows-Update-Cache leeren (Windows)\n• Papierkorb leeren',
    impact: 'Dateien im Papierkorb werden unwiderruflich gelöscht. Temporäre Dateien von laufenden Programmen können verloren gehen (z.B. nicht gespeicherte Dokumente aus Temp-Ordnern).',
  },
  dns_flush: {
    title:  'DNS-Cache leeren?',
    what:   'Löscht den lokalen DNS-Auflösungs-Cache des Betriebssystems.',
    impact: 'Alle DNS-Einträge müssen neu abgefragt werden. Kurze Verzögerung beim ersten Aufrufen von Webseiten möglich. Keine dauerhaften Auswirkungen.',
  },
};

// KI Browser-Redirect URLs (var statt const — verhindert Terser-TDZ)
var AI_BROWSER_URLS = {
  chatgpt:    'https://chatgpt.com/',
  claude:     'https://claude.ai/',
  perplexity: 'https://www.perplexity.ai/',
  grok:       'https://grok.com/',
  mammouth:   'https://mammouth.ai/app/a/default',
};

// Bestätigungs-Texte für Fix-Buttons in der Empfehlungen-Karte
var FIX_CONFIRM = {
  enable_firewall: {
    title:  'Firewall aktivieren?',
    what:   'Aktiviert die System-Firewall. Eingehende Verbindungen werden nach den aktuellen Regeln gefiltert.',
    impact: 'Bestimmte Netzwerk-Dienste oder Anwendungen könnten blockiert werden, wenn keine Ausnahmeregel vorhanden ist.',
  },
  disable_ssh: {
    title:  'Remote Login (SSH) deaktivieren?',
    what:   'Deaktiviert den SSH-Server sofort über systemsetup -setremotelogin off.',
    impact: 'Alle aktiven SSH-Verbindungen zu diesem Mac werden sofort getrennt. Fernzugriff ist danach nicht mehr möglich.',
  },
  quick_clean: QUICK_ACTION_CONFIRM.quick_clean,
};

async function updateSuggestions() {
  try {
    const suggestions = await GetSuggestions();
    const card   = document.getElementById('card-suggestions');
    const list   = document.getElementById('suggestions-list');
    const count  = document.getElementById('suggestions-count');
    if (!card || !list) return;

    if (!suggestions || suggestions.length === 0) {
      card.classList.add('hidden');
      return;
    }

    count.textContent = suggestions.length;
    list.innerHTML = '';

    suggestions.forEach(s => {
      const severityIcon = s.severity === 'critical' ? '🔴' : s.severity === 'warning' ? '🟠' : '🔵';
      const div = document.createElement('div');
      div.className = 'suggestion-item suggestion-' + s.severity;

      let fixBtn = '';
      if (s.fix_type !== 'none' && s.fix_id && s.fix_label) {
        const warn = s.fix_warning
          ? `onclick="return confirm('${escapeHtml(s.fix_warning)}')"` : '';
        fixBtn = `<button class="btn btn-xs suggestion-fix-btn" data-fix="${escapeHtml(s.fix_id)}" data-warn="${escapeHtml(s.fix_warning || '')}">${escapeHtml(s.fix_label)}</button>`;
      }

      div.innerHTML = `
        <div class="suggestion-header">
          <span class="suggestion-icon">${severityIcon}</span>
          <span class="suggestion-title">${escapeHtml(s.title)}</span>
          ${s.risk_score > 0 ? riskBadgeHtml(s.risk_score) : ''}
          <span class="suggestion-spacer"></span>
          ${fixBtn}
        </div>
        <div class="suggestion-detail">${escapeHtml(s.detail)}</div>`;
      list.appendChild(div);
    });

    // Fix-Button-Listener
    list.addEventListener('click', async ev => {
      const btn = ev.target.closest('.suggestion-fix-btn');
      if (!btn) return;
      const fixID    = btn.dataset.fix;
      const fixLabel = btn.textContent.trim();
      const conf     = FIX_CONFIRM[fixID];

      if (conf) {
        const ok = await showConfirm(conf);
        if (!ok) return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Wird ausgeführt…';

      try {
        const result = await RunFix(fixID);
        if (result.output?.startsWith('navigate:')) {
          const dest = result.output.replace('navigate:', '');
          if (dest === 'autostart' || dest === 'events') switchTab('system');
          btn.textContent = '✓ Geöffnet';
          btn.disabled = false;
        } else {
          showActionResult(result.output || '', result.success);
          btn.textContent = result.success ? '✓ Erledigt' : '✗ Fehler';
        }
      } catch (e) {
        btn.textContent = fixLabel;
        btn.disabled = false;
        showToast('Fix fehlgeschlagen: ' + e);
      }
    }, { once: false });

    card.classList.remove('hidden');
  } catch (e) {
    // Vorschläge nicht verfügbar — still ignorieren
  }
}

// Zeigt das Ergebnis einer Quick-Action / eines Fixes in einem Overlay an.
function showActionResult(text, success) {
  const overlay = document.getElementById('modal-action-result-overlay');
  const pre     = document.getElementById('modal-action-result-text');
  if (overlay && pre) {
    pre.textContent = text;
    overlay.classList.remove('hidden');
  } else {
    // Fallback: direkt in qa-output anzeigen
    const qaOut = document.getElementById('qa-output');
    const qaPre = document.getElementById('qa-output-text');
    if (qaOut && qaPre) {
      qaPre.textContent = text;
      qaOut.classList.remove('hidden');
      document.getElementById('qa-output-title').textContent =
        success ? '✓ Abgeschlossen' : '✗ Fehler aufgetreten';
    }
  }
}

function initQuickActions() {
  const actions = [
    ['qa-internet-fix',  'internet_fix',  'Internet-Fix'],
    ['qa-printer-fix',   'printer_fix',   'Drucker-Fix'],
    ['qa-quick-clean',   'quick_clean',   'Schnellbereinigung'],
    ['qa-dns-flush',     'dns_flush',     'DNS leeren'],
  ];

  // Sichtbarkeit wird nach Konfigurationsladung in loadAppInfo() gesetzt

  const qaOut   = document.getElementById('qa-output');
  const qaPre   = document.getElementById('qa-output-text');
  const qaTitle = document.getElementById('qa-output-title');
  const qaClose = document.getElementById('qa-output-close');

  qaClose?.addEventListener('click', () => qaOut?.classList.add('hidden'));

  actions.forEach(([btnId, actionId, label]) => {
    document.getElementById(btnId)?.addEventListener('click', async () => {
      // Bestätigung einholen
      var conf = Object.assign({}, QUICK_ACTION_CONFIRM[actionId] || { title: label + ' ausführen?', what: '', impact: '' });
      // Für Schnellbereinigung: aktuelle Größen vorab anzeigen
      if (actionId === 'quick_clean') {
        try {
          const sizes = await GetCleanupSizes();
          conf.what = conf.what + '\n\nAktuelle Größen:\n' +
            '• /tmp: ' + (sizes['tmp'] || '–') + '\n' +
            '• ~/Library/Caches: ' + (sizes['caches'] || '–') + '\n' +
            '• Papierkorb: ' + (sizes['trash'] || '–');
        } catch (_) {}
      }
      const ok = await showConfirm(conf);
      if (!ok) return;

      // Output-Bereich einblenden
      if (qaOut) {
        qaOut.classList.remove('hidden');
        if (qaPre) qaPre.textContent = label + ' wird ausgeführt…';
        if (qaTitle) qaTitle.textContent = '⏳ ' + label;
      }
      try {
        const result = await RunQuickAction(actionId);
        if (qaOut) {
          if (qaPre) qaPre.textContent = result.output || '(kein Output)';
          if (qaTitle) qaTitle.textContent = result.success ? '✓ ' + label : '✗ ' + label + ' – Fehler';
        }
        addAction(label + (result.success ? ' abgeschlossen' : ' mit Fehler'), result.success ? 'ok' : 'error');
      } catch (e) {
        if (qaPre) qaPre.textContent = 'Fehler: ' + e;
        if (qaTitle) qaTitle.textContent = '✗ ' + label;
      }
    });
  });
}

// ─── Workflows ───────────────────────────────────────────────────────────────

function initWorkflows() {
  const container = document.getElementById('workflows-grid');
  if (!container) return;

  container.innerHTML = WORKFLOW_DEFS.map(w => `
    <button class="workflow-card" data-workflow="${escapeHtml(w.id)}">
      <span class="workflow-icon">${w.icon}</span>
      <span class="workflow-name">${escapeHtml(w.name)}</span>
      <span class="workflow-desc">${escapeHtml(w.desc)}</span>
    </button>
  `).join('');

  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.workflow-card');
    if (!btn) return;
    const wf = WORKFLOW_DEFS.find(w => w.id === btn.dataset.workflow);
    if (!wf) return;

    const stepNames = wf.steps.map(([label]) => '• ' + label).join('\n');
    const ok = await showConfirm({
      title: wf.icon + ' ' + wf.name + ' starten?',
      what: `Führt folgende Scans sequentiell aus:\n${stepNames}`,
      impact: 'Laufende Scans werden abgebrochen. Stellen Sie sicher, dass eine Session aktiv ist.',
    });
    if (!ok) return;

    switchTab('system');
    const total = wf.steps.length;
    setFullscanProgress(0, total, wf.steps[0][0]);

    for (let i = 0; i < wf.steps.length; i++) {
      const [label, fn] = wf.steps[i];
      setFullscanProgress(i + 1, total, label);
      await fn();
    }
    setFullscanProgress(total, total, null);
    showScanSummary();
    await updateHealthScore();
    await updateSuggestions();
    addAction('Workflow abgeschlossen: ' + wf.name, 'success');
  });
}

// ─── Periodic Maintenance ────────────────────────────────────────────────────

function initPeriodicMaintenance() {
  const out    = document.getElementById('periodic-output');
  const pre    = document.getElementById('periodic-output-text');
  const title  = document.getElementById('periodic-output-title');
  const close  = document.getElementById('periodic-output-close');

  close?.addEventListener('click', () => out?.classList.add('hidden'));

  // Status beim Laden abfragen
  async function refreshStatus() {
    try {
      const s = await GetPeriodicStatus();
      document.getElementById('periodic-daily-date').textContent   = s['daily']   || '–';
      document.getElementById('periodic-weekly-date').textContent  = s['weekly']  || '–';
      document.getElementById('periodic-monthly-date').textContent = s['monthly'] || '–';
    } catch (_) {}
  }
  refreshStatus();
  document.getElementById('btn-periodic-refresh')?.addEventListener('click', refreshStatus);

  const levels = [
    ['btn-periodic-daily',   'daily',   'Periodic Daily'],
    ['btn-periodic-weekly',  'weekly',  'Periodic Weekly'],
    ['btn-periodic-monthly', 'monthly', 'Periodic Monthly'],
  ];

  levels.forEach(([btnId, level, label]) => {
    document.getElementById(btnId)?.addEventListener('click', async () => {
      const ok = await showConfirm({
        title:  label + ' ausführen?',
        what:   `Führt 'sudo periodic ${level}' aus — Systemwartungsaufgaben die normalerweise nachts ausgeführt werden.`,
        impact: level === 'monthly'
          ? 'Der Monthly-Lauf kann mehrere Minuten dauern. Admin-Passwort wird abgefragt.'
          : 'Kurzfristig erhöhte CPU-Last. Admin-Passwort wird abgefragt.',
      });
      if (!ok) return;
      if (out) out.classList.remove('hidden');
      if (pre) pre.textContent = label + ' wird ausgeführt…';
      if (title) title.textContent = '⏳ ' + label;
      try {
        const result = await RunPeriodicMaintenance(level);
        if (pre) pre.textContent = result || '✓ Abgeschlossen (kein Output)';
        if (title) title.textContent = '✓ ' + label;
        addAction(label + ' abgeschlossen', 'success');
        refreshStatus();
      } catch (e) {
        if (pre) pre.textContent = 'Fehler: ' + e;
        if (title) title.textContent = '✗ ' + label;
        addAction(label + ' fehlgeschlagen: ' + e, 'error');
      }
    });
  });
}

// ─── Homebrew ────────────────────────────────────────────────────────────────

function initHomebrew() {
  const out   = document.getElementById('brew-output');
  const pre   = document.getElementById('brew-output-text');
  const title = document.getElementById('brew-output-title');
  const close = document.getElementById('brew-output-close');
  const list  = document.getElementById('brew-outdated-list');
  const upgradeAll = document.getElementById('btn-brew-upgrade-all');

  close?.addEventListener('click', () => out?.classList.add('hidden'));

  async function runUpgrade(packages) {
    const pkgLabel = packages?.length ? packages.join(', ') : 'alle';
    const ok = await showConfirm({
      title:  'Homebrew Update starten?',
      what:   packages?.length
        ? `Aktualisiert: ${pkgLabel}`
        : 'Führt brew upgrade aus — aktualisiert alle veralteten Homebrew-Pakete.',
      impact: 'Pakete werden heruntergeladen und aktualisiert. Laufende Dienste können kurz unterbrochen werden.',
    });
    if (!ok) return;
    if (out) out.classList.remove('hidden');
    if (pre) pre.textContent = 'brew upgrade ' + pkgLabel + ' wird ausgeführt…';
    if (title) title.textContent = '⏳ Homebrew Upgrade';
    try {
      const result = await RunHomebrewUpgrade(packages || []);
      if (pre) pre.textContent = result || '✓ Abgeschlossen';
      if (title) title.textContent = '✓ Homebrew Upgrade';
      addAction('Homebrew Upgrade abgeschlossen: ' + pkgLabel, 'success');
    } catch (e) {
      if (pre) pre.textContent = 'Fehler: ' + e;
      if (title) title.textContent = '✗ Homebrew Upgrade fehlgeschlagen';
      addAction('Homebrew Upgrade fehlgeschlagen: ' + e, 'error');
    }
  }

  document.getElementById('btn-brew-check')?.addEventListener('click', async () => {
    if (list) { list.innerHTML = '<div class="info-placeholder">Prüfe veraltete Pakete…</div>'; list.classList.remove('hidden'); }
    if (upgradeAll) upgradeAll.classList.add('hidden');
    try {
      const pkgs = await GetHomebrewOutdated();
      if (!pkgs || pkgs.length === 0) {
        if (list) list.innerHTML = '<div class="info-placeholder">✓ Alle Homebrew-Pakete sind aktuell.</div>';
        return;
      }
      if (list) {
        list.innerHTML = `<table class="data-table"><thead><tr><th>Paket</th><th>Installiert</th><th>Aktuell</th><th></th></tr></thead><tbody>
          ${pkgs.map(p => `<tr>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td class="mono-cell">${escapeHtml(p.installed_version || '–')}</td>
            <td class="mono-cell">${escapeHtml(p.current_version || '–')}</td>
            <td><button class="btn btn-sm btn-secondary brew-upgrade-single" data-pkg="${escapeHtml(p.name)}">↑</button></td>
          </tr>`).join('')}
        </tbody></table>`;
        list.querySelectorAll('.brew-upgrade-single').forEach(btn => {
          btn.addEventListener('click', () => runUpgrade([btn.dataset.pkg]));
        });
      }
      if (upgradeAll) upgradeAll.classList.remove('hidden');
      addAction(`Homebrew: ${pkgs.length} Update(s) verfügbar`, 'info');
    } catch (e) {
      if (list) list.innerHTML = `<div class="info-placeholder text-danger">Fehler: ${escapeHtml(String(e))}</div>`;
    }
  });

  upgradeAll?.addEventListener('click', () => runUpgrade(null));
}

// ─── SSH-Verwaltung ──────────────────────────────────────────────────────────

function initSSHManagement() {
  const badge      = document.getElementById('ssh-status-badge');
  const toggleBtn  = document.getElementById('btn-ssh-toggle');
  const refreshBtn = document.getElementById('btn-ssh-refresh');
  const sessionsEl = document.getElementById('ssh-sessions');

  var currentEnabled = false;

  async function refreshSSH() {
    if (badge) badge.textContent = '⏳ Prüfe…';
    try {
      const s = await GetSSHStatus();
      currentEnabled = s.enabled;
      if (badge) {
        badge.className = s.enabled
          ? 'status-badge badge-warning'
          : 'status-badge badge-ok';
        badge.textContent = s.enabled ? '🟡 Aktiviert' : '🟢 Deaktiviert';
      }
      if (toggleBtn) {
        toggleBtn.classList.remove('hidden');
        toggleBtn.textContent = s.enabled ? '🔒 SSH deaktivieren' : '🔓 SSH aktivieren';
        toggleBtn.className = s.enabled
          ? 'btn btn-danger btn-sm'
          : 'btn btn-secondary btn-sm';
      }
      if (sessionsEl) {
        if (s.sessions && s.sessions.length > 0) {
          sessionsEl.classList.remove('hidden');
          sessionsEl.innerHTML = '<strong>Aktive Sessions:</strong><br>' +
            s.sessions.map(l => `<span class="mono-cell">${escapeHtml(l)}</span>`).join('<br>');
        } else {
          sessionsEl.classList.add('hidden');
        }
      }
    } catch (e) {
      if (badge) { badge.className = 'status-badge badge-unknown'; badge.textContent = '⚪ Fehler: ' + e; }
    }
  }

  refreshBtn?.addEventListener('click', refreshSSH);

  toggleBtn?.addEventListener('click', async () => {
    const enabling = !currentEnabled;
    const ok = await showConfirm({
      title: enabling ? 'Remote Login (SSH) aktivieren?' : 'Remote Login (SSH) deaktivieren?',
      what: enabling
        ? 'Aktiviert den SSH-Server auf diesem Mac (systemsetup -setremotelogin on).'
        : 'Deaktiviert den SSH-Server auf diesem Mac (systemsetup -setremotelogin off).',
      impact: enabling
        ? '⚠ SSH öffnet Port 22. Stelle sicher, dass starke Passwörter oder SSH-Keys verwendet werden. Admin-Passwort wird abgefragt.'
        : 'Alle aktiven SSH-Verbindungen zu diesem Mac werden sofort getrennt. Admin-Passwort wird abgefragt.',
    });
    if (!ok) return;
    try {
      await SetSSHEnabled(enabling);
      addAction('Remote Login (SSH) ' + (enabling ? 'aktiviert' : 'deaktiviert'), enabling ? 'warning' : 'success');
      showToast('SSH ' + (enabling ? 'aktiviert' : 'deaktiviert'));
      await refreshSSH();
    } catch (e) {
      showToast('Fehler: ' + e, 'error');
      addAction('SSH-Toggle fehlgeschlagen: ' + e, 'error');
    }
  });

  // Initial laden wenn Tools-Tab sichtbar
  refreshSSH();
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
  await updateSuggestions();

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

  setPlaceholder('hw-info',          'Scanne Hardware…');
  setPlaceholder('os-info',          'Scanne Betriebssystem…');
  setPlaceholder('smart-info',       'Scanne Festplatten (SMART)…');
  setPlaceholder('timemachine-info', 'Scanne Time Machine…');

  try {
    const result = await ScanSystem();
    state.lastScanResult = result;

    renderHardware(result.hardware);
    renderBattery(result.hardware?.battery);
    renderOS(result.os);
    renderSmart(result.smart);
    renderTimeMachine(result.time_machine);
    renderSecurity(result.security);
    updateDashboardBadges(result);

    if (state.currentSessionPath) {
      await SaveSystemScan(result, state.currentSessionPath);
      addAction('System-Scan in Vault gespeichert', 'success');
    }
    await saveSnapshot('system', result);
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
    await saveSnapshot('network', result);
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
    await saveSnapshot('network', result);
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
    await saveSnapshot('software', result);
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
    await saveSnapshot('printers', result);
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
  setScanningIndicator(disabled);
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
    await saveSnapshot('autostart', result);
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

// ─── Generische Spalten-Sortierung ────────────────────────────────────────────
// Macht alle <th> in einem data-table klickbar für auf-/absteigende Sortierung.
// Spalten mit class="cb-col" oder ohne Text werden übersprungen.
function makeSortable(table) {
  var headers = table.querySelectorAll('thead th');
  var sortCol = -1;
  var sortDir = 1;
  headers.forEach(function(th, colIdx) {
    if (th.classList.contains('cb-col') || !th.textContent.trim()) return;
    th.style.cursor = 'pointer';
    th.title = 'Klicken zum Sortieren';
    th.addEventListener('click', function() {
      if (sortCol === colIdx) sortDir = -sortDir;
      else { sortCol = colIdx; sortDir = 1; }
      // Sortier-Pfeil
      headers.forEach(function(h) { h.classList.remove('sort-asc', 'sort-desc'); });
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      var rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort(function(a, b) {
        var ta = (a.querySelectorAll('td')[colIdx]?.textContent || '').trim().toLowerCase();
        var tb = (b.querySelectorAll('td')[colIdx]?.textContent || '').trim().toLowerCase();
        // Zahlen-Vergleich
        var na = parseFloat(ta), nb = parseFloat(tb);
        if (!isNaN(na) && !isNaN(nb)) return sortDir * (na - nb);
        return sortDir * ta.localeCompare(tb, 'de');
      });
      rows.forEach(function(r) { tbody.appendChild(r); });
    });
  });
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
    table.innerHTML = `<thead><tr><th class="cb-col"><input type="checkbox" class="check-all" title="Alle auswählen"></th><th>Name</th><th>Pfad / Befehl</th><th>System</th><th>Aktiv</th><th></th></tr></thead>`;
    const tbody = document.createElement('tbody');

    items.forEach(e => {
      const path = (e.path || '').toLowerCase();
      const isSuspAutostart = !e.is_system && path && (
        path.includes('/tmp/') || path.includes('/private/tmp/') ||
        path.includes('/var/folders/') || path.includes('/downloads/') ||
        path.includes('appdata\\local\\temp') || path.includes('\\temp\\')
      );
      const tr = document.createElement('tr');
      if (isSuspAutostart) tr.classList.add('row-danger');
      else if (!e.is_system) tr.classList.add('highlight-third-party');
      const suspIcon = isSuspAutostart ? ' ⚠️' : '';
      const sys = e.is_system ? '✓' : (isSuspAutostart
        ? '<span class="text-danger">⛔ Verdächtig</span>'
        : '<span class="text-warning">⚠ Drittanbieter</span>');
      const active = e.is_enabled ? '✓' : '<span class="text-muted">–</span>';
      const cbId = `autostart:${e.name}:${e.path || ''}`;
      const canToggle = !e.is_system && e.plist_path;
      const toggleBtn = canToggle
        ? `<button class="btn-action btn-autostart-toggle" data-path="${escapeHtml(e.plist_path)}" data-name="${escapeHtml(e.name)}" data-enabled="${e.is_enabled ? '1' : '0'}" title="${e.is_enabled ? 'Deaktivieren' : 'Aktivieren'}">${e.is_enabled ? '⏸' : '▶'}</button>`
        : '';
      tr.innerHTML = `
        <td class="cb-col"><input type="checkbox" class="item-check" data-id="${escapeHtml(cbId)}" data-name="${escapeHtml(e.name)}" data-path="${escapeHtml(e.path || '')}" data-type="autostart"></td>
        <td><strong>${escapeHtml(e.name)}</strong>${suspIcon}</td>
        <td class="mono-cell" style="font-size:11px;word-break:break-all">${escapeHtml(e.path || '–')}</td>
        <td style="text-align:center">${sys}</td>
        <td style="text-align:center">${active}</td>
        <td style="text-align:center">${toggleBtn}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    section.appendChild(table);
    container.appendChild(section);

    // Autostart-Toggle (launchctl load/unload)
    tbody.addEventListener('click', async function(e) {
      const btn = e.target.closest('.btn-autostart-toggle');
      if (!btn) return;
      const plistPath = btn.dataset.path;
      const name      = btn.dataset.name;
      const enabled   = btn.dataset.enabled === '1';
      const action    = enabled ? 'deaktivieren' : 'aktivieren';
      const ok = await showConfirm({
        title: `Autostart-Eintrag ${action}`,
        what: `"${name}" wird per launchctl ${enabled ? 'entladen (unload -w)' : 'geladen (load -w)'}.`,
        impact: enabled
          ? 'Das Programm startet beim nächsten Login nicht mehr automatisch.'
          : 'Das Programm startet ab dem nächsten Login wieder automatisch.',
      });
      if (!ok) return;
      try {
        await ToggleAutostartEntry(plistPath, !enabled);
        btn.dataset.enabled = enabled ? '0' : '1';
        btn.textContent = enabled ? '▶' : '⏸';
        btn.title = enabled ? 'Aktivieren' : 'Deaktivieren';
        const td = btn.closest('td').previousElementSibling;
        if (td) td.innerHTML = enabled ? '<span class="text-muted">–</span>' : '✓';
        showToast(`${name} ${enabled ? 'deaktiviert' : 'aktiviert'}.`);
        addAction(`Autostart ${enabled ? 'deaktiviert' : 'aktiviert'}: ${name}`, 'success');
      } catch (err) {
        showToast(`Fehler: ${err}`, 'error');
        addAction(`Autostart-Toggle fehlgeschlagen: ${err}`, 'error');
      }
    });

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
    await saveSnapshot('services', result);
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
  makeSortable(tbl);
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
    await saveSnapshot('events', result);
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

// ─── Bestätigungs-Modal ───────────────────────────────────────────────────────
// Vor jeder schreibenden/verändernden Aktion aufrufen.
// Gibt Promise<boolean> zurück — true = Nutzer hat bestätigt, false = abgebrochen.
var _confirmResolve = null;

function showConfirm({ title, what, impact }) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    const overlay  = document.getElementById('modal-confirm-overlay');
    const titleEl  = document.getElementById('modal-confirm-title');
    const whatEl   = document.getElementById('modal-confirm-what');
    const impactEl = document.getElementById('modal-confirm-impact');
    const impactWrap = document.getElementById('modal-confirm-impact-wrap');
    if (!overlay) { resolve(true); return; }

    titleEl.textContent = title || 'Aktion bestätigen';
    whatEl.textContent  = what  || '';
    if (impact) {
      impactEl.textContent = impact;
      impactWrap.classList.remove('hidden');
    } else {
      impactWrap.classList.add('hidden');
    }

    overlay.classList.remove('hidden');
    document.getElementById('modal-confirm-cancel')?.focus();
  });
}

function initConfirmModal() {
  const overlay = document.getElementById('modal-confirm-overlay');
  const cancel  = document.getElementById('modal-confirm-cancel');
  const proceed = document.getElementById('modal-confirm-proceed');

  cancel?.addEventListener('click',  () => { overlay?.classList.add('hidden'); _confirmResolve?.(false); });
  proceed?.addEventListener('click', () => { overlay?.classList.add('hidden'); _confirmResolve?.(true);  });
  overlay?.addEventListener('click', ev => {
    if (ev.target === overlay) { overlay.classList.add('hidden'); _confirmResolve?.(false); }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !overlay?.classList.contains('hidden')) {
      overlay?.classList.add('hidden');
      _confirmResolve?.(false);
    }
  });
}

// Aktions-Ergebnis-Modal initialisieren
function initActionResultModal() {
  const overlay = document.getElementById('modal-action-result-overlay');
  document.getElementById('modal-action-result-close')?.addEventListener('click', () => overlay?.classList.add('hidden'));
  document.getElementById('modal-action-result-ok')?.addEventListener('click',    () => overlay?.classList.add('hidden'));
  overlay?.addEventListener('click', ev => { if (ev.target === overlay) overlay.classList.add('hidden'); });
}

// var statt const/let — verhindert Terser-TDZ-Hoisting in Produktions-Build
var _currentEventDetail = null;
var RISK_THRESHOLD = 20;

// Modul-level State für renderEvents (vermeidet Closures über let/const)
var _evtSorted    = null;
var _evtShowAll   = false;
var _evtContainer = null;

function riskBadgeHtml(score) {
  if (score === undefined || score === null) return '';
  var cls, label;
  if      (score >= 80) { cls = 'risk-critical'; label = score + ' Kritisch'; }
  else if (score >= 50) { cls = 'risk-high';     label = score + ' Hoch'; }
  else if (score >= 20) { cls = 'risk-medium';   label = score + ' Mittel'; }
  else if (score >= 5)  { cls = 'risk-low';      label = score + ' Niedrig'; }
  else                  { cls = 'risk-info';      label = score + ' Info'; }
  return '<span class="risk-badge ' + cls + '">' + label + '</span>';
}

function renderEvents(evtList) {
  _evtContainer = document.getElementById('events-info');
  if (!_evtContainer) return;
  if (!evtList || !evtList.length) {
    _evtContainer.innerHTML = '<div class="info-placeholder">Keine kritischen Ereignisse in den letzten 7 Tagen.</div>';
    return;
  }
  _evtSorted  = evtList.slice().sort(function(a, b) { return ((b.risk_score || 0) - (a.risk_score || 0)); });
  _evtShowAll = false;
  _doRenderEvents();
}

function _buildEventTable(list) {
  var table = document.createElement('table');
  table.className = 'data-table';
  table.innerHTML = '<thead><tr><th class="cb-col"><input type="checkbox" class="check-all" title="Alle auswählen"></th><th>Risiko</th><th>Zeit</th><th>Prozess</th><th>Meldung</th><th></th></tr></thead>';
  var tbody = document.createElement('tbody');
  for (var i = 0; i < list.length; i++) {
    var e    = list[i];
    var tr   = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.dataset.origIdx = _evtSorted ? _evtSorted.indexOf(e) : i;
    var time     = e.time ? new Date(e.time).toLocaleString('de-DE') : '–';
    var proc     = e.process_name || e.source || '–';
    var msg      = e.message || '';
    var cbId     = 'event:' + i + ':' + proc;
    var shortMsg = msg.length > 120
      ? escapeHtml(msg.slice(0, 120)) + '<span style="color:var(--color-text-muted)">…</span>'
      : escapeHtml(msg);
    tr.innerHTML =
      '<td class="cb-col" style="cursor:default" onclick="event.stopPropagation()"><input type="checkbox" class="item-check" data-id="' + escapeHtml(cbId) + '" data-name="' + escapeHtml(proc) + '" data-extra="' + escapeHtml(msg.slice(0, 300)) + '" data-type="event"></td>' +
      '<td style="white-space:nowrap">' + riskBadgeHtml(e.risk_score) + '</td>' +
      '<td style="white-space:nowrap;font-size:11px">' + escapeHtml(time) + '</td>' +
      '<td style="font-size:11px;white-space:nowrap;font-weight:500">' + escapeHtml(proc) + '</td>' +
      '<td style="font-size:12px">' + shortMsg + '</td>' +
      '<td style="white-space:nowrap"><button class="btn-event-detail" title="Details">🔍</button></td>';
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  // Checkbox-Handler
  var checkAll = table.querySelector('.check-all');
  if (checkAll) {
    checkAll.addEventListener('change', function(ev) {
      table.querySelectorAll('.item-check').forEach(function(cb) {
        toggleItemSelection(cb, ev.target.checked);
        cb.checked = ev.target.checked;
      });
      updateActionBar();
    });
  }
  table.addEventListener('change', function(ev) {
    var cb = ev.target.closest('.item-check');
    if (!cb) return;
    toggleItemSelection(cb, cb.checked);
    updateActionBar();
  });

  table.addEventListener('click', function(ev) {
    if (ev.target.closest('.item-check') || ev.target.closest('.check-all')) return;
    var row = ev.target.closest('tr');
    if (!row || row.parentElement.tagName === 'THEAD') return;
    var origIdx = parseInt(row.dataset.origIdx || -1);
    if (origIdx >= 0 && _evtSorted) showEventDetail(_evtSorted[origIdx]);
  });
  makeSortable(table);
  return table;
}

function _doRenderEvents() {
  if (!_evtSorted || !_evtContainer) return;
  var riskEvents  = _evtSorted.filter(function(e) { return (e.risk_score || 0) >= 20; });
  var noiseEvents = _evtSorted.filter(function(e) { return (e.risk_score || 0) <  20; });
  var displayList = _evtShowAll ? _evtSorted : riskEvents;

  _evtContainer.innerHTML = '';
  var meta = document.createElement('p');
  meta.className = 'section-meta';
  var toggleBtn = document.createElement('button');
  toggleBtn.style.cssText = 'margin-left:12px;padding:3px 10px;font-size:12px;font-weight:600;border-radius:99px;cursor:pointer;border:1px solid;';

  if (_evtShowAll) {
    meta.textContent  = _evtSorted.length + ' Ereignisse gesamt';
    toggleBtn.textContent = '✕ Rauschen ausblenden (' + noiseEvents.length + ')';
    toggleBtn.style.background = 'color-mix(in srgb, var(--color-warning) 15%, transparent)';
    toggleBtn.style.borderColor = 'var(--color-warning)';
    toggleBtn.style.color = 'var(--color-warning)';
  } else {
    meta.textContent  = riskEvents.length + ' risikorelevante Ereignisse';
    if (noiseEvents.length > 0) {
      toggleBtn.textContent = '+ ' + noiseEvents.length + ' ausgeblendete System-Ereignisse anzeigen';
      toggleBtn.style.background = 'color-mix(in srgb, var(--color-primary) 12%, transparent)';
      toggleBtn.style.borderColor = 'var(--color-primary)';
      toggleBtn.style.color = 'var(--color-primary)';
    } else {
      toggleBtn.textContent = '';
    }
  }
  toggleBtn.addEventListener('click', function() { _evtShowAll = !_evtShowAll; _doRenderEvents(); });
  meta.appendChild(toggleBtn);

  // KI-Analyse-Button für sichtbare Risiko-Ereignisse
  if (riskEvents.length > 0) {
    var aiBtn = document.createElement('button');
    aiBtn.style.cssText = 'margin-left:12px;padding:3px 10px;font-size:12px;font-weight:600;border-radius:99px;cursor:pointer;border:1px solid var(--color-primary);background:color-mix(in srgb,var(--color-primary) 12%,transparent);color:var(--color-primary);';
    aiBtn.textContent = '🤖 KI analysieren (' + riskEvents.length + ')';
    aiBtn.addEventListener('click', function() {
      var provider = document.getElementById('ai-provider-select')?.value ?? 'chatgpt';
      runEventsAIAnalyze(riskEvents, provider);
    });
    meta.appendChild(aiBtn);
  }

  _evtContainer.appendChild(meta);

  if (displayList.length === 0) {
    _evtContainer.insertAdjacentHTML('beforeend', '<div class="info-placeholder">Keine risikorelevanten Ereignisse — System sieht sauber aus.</div>');
  } else {
    _evtContainer.appendChild(_buildEventTable(displayList));
  }
}

function runEventsAIAnalyze(events, provider) {
  var prompt = '=== AdminKit: Systemereignis-Analyse ===\n\n';
  prompt += 'Die folgenden ' + events.length + ' risikorelevanten Systemereignisse wurden auf diesem Mac gefunden:\n\n';
  events.slice(0, 50).forEach(function(e, i) {
    var time = e.time ? new Date(e.time).toLocaleString('de-DE') : '–';
    prompt += '[' + (i+1) + '] Risiko: ' + (e.risk_score || 0) + ' | Zeit: ' + time +
      ' | Prozess: ' + (e.process_name || e.source || '–') +
      ' | Meldung: ' + (e.message || '–').slice(0, 200) + '\n';
  });
  if (events.length > 50) prompt += '… (' + (events.length - 50) + ' weitere Ereignisse ausgelassen)\n';
  prompt += '\n=== Frage ===\n';
  prompt += 'Welche dieser Ereignisse sind echte Sicherheitsrisiken vs. normales Systemverhalten? ' +
    'Was sollte der Administrator prüfen oder tun? Bitte auf Deutsch antworten.';

  if (AI_BROWSER_URLS[provider]) {
    try { navigator.clipboard.writeText(prompt); } catch(_) {}
    if (window.runtime?.BrowserOpenURL) window.runtime.BrowserOpenURL(AI_BROWSER_URLS[provider]);
    showToast('Prompt kopiert. Füge ihn im Browser ein.');
    return;
  }
  var modal = document.getElementById('modal-ai-response');
  var title = document.getElementById('ai-response-title');
  var pre   = document.getElementById('ai-response-text');
  if (!modal || !pre) return;
  title.textContent = '🤖 Ereignis-Analyse (' + provider + ')';
  pre.textContent = 'Analyse läuft…';
  modal.classList.remove('hidden');
  var p;
  if (provider === 'ollama' || provider === 'lmstudio') {
    var baseURL = provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234';
    var model = provider === 'ollama' ? (state.config?.ai_models?.ollama || 'llama3.2') : (state.config?.ai_models?.lmstudio || 'local-model');
    p = CallLocalAI(baseURL, model, prompt);
  } else {
    p = CallAI(provider, state.config?.ai_models?.[provider] || defaultModelFor(provider), prompt);
  }
  p.then(function(r) { pre.textContent = r; addAction('Ereignis-KI-Analyse abgeschlossen', 'success'); })
   .catch(function(err) { pre.textContent = 'Fehler: ' + err; addAction('Ereignis-KI-Analyse fehlgeschlagen: ' + err, 'error'); });
}

function showEventDetail(e) {
  _currentEventDetail = e;
  const overlay = document.getElementById('modal-event-overlay');
  const title   = document.getElementById('modal-event-title');
  const meta    = document.getElementById('modal-event-meta');
  const msgEl   = document.getElementById('modal-event-msg');
  const consBtn = document.getElementById('modal-event-console');
  if (!overlay) return;

  const levelIcon = e.level === 'Kritisch' ? '🔴' : (e.level === 'Fehler' ? '🟠' : '🟡');
  title.textContent = `${levelIcon} ${e.level} — ${e.process_name || e.source || 'Unbekannt'}`;

  const time = e.time ? new Date(e.time).toLocaleString('de-DE') : '–';
  const rows = [
    ['Zeit',     time],
    ['Level',    e.level],
    ['Prozess',  e.process_name || '–'],
    ['PID',      e.pid || '–'],
    ['Subsystem',e.subsystem || '–'],
    ['Quelle',   e.source || '–'],
    ['Log',      e.log || '–'],
  ];
  meta.innerHTML = rows.map(([k,v]) =>
    `<tr><th style="width:100px;text-align:left;padding:3px 8px 3px 0;font-weight:600;color:var(--color-text-muted);font-size:12px">${escapeHtml(k)}</th>` +
    `<td style="padding:3px 0;font-size:12px">${escapeHtml(String(v))}</td></tr>`
  ).join('');

  msgEl.textContent = e.message || '–';

  // Console-Button nur anzeigen wenn Prozessname vorhanden
  consBtn.style.display = e.process_name ? '' : 'none';

  overlay.classList.remove('hidden');
}

// Event-Detail-Modal Listener (werden einmalig in initUI registriert)
function initEventDetailModal() {
  const overlay = document.getElementById('modal-event-overlay');
  document.getElementById('modal-event-close')?.addEventListener('click', () => overlay?.classList.add('hidden'));
  document.getElementById('modal-event-ok')?.addEventListener('click',    () => overlay?.classList.add('hidden'));
  overlay?.addEventListener('click', ev => { if (ev.target === overlay) overlay.classList.add('hidden'); });

  document.getElementById('modal-event-copy')?.addEventListener('click', () => {
    if (_currentEventDetail?.message) {
      navigator.clipboard.writeText(_currentEventDetail.message);
      showToast('Meldung in Zwischenablage kopiert.');
    }
  });

  document.getElementById('modal-event-console')?.addEventListener('click', async () => {
    if (_currentEventDetail?.process_name) {
      try {
        await OpenEventInConsole(_currentEventDetail.process_name);
        showToast('Console.app geöffnet — nach „' + _currentEventDetail.process_name + '" suchen.');
      } catch (e) {
        showToast('Konnte Console nicht öffnen: ' + e);
      }
    }
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

  // Akku-Sektion (nur bei MacBooks)
  renderBattery(hw.battery);

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

function renderBattery(bat) {
  const container = document.getElementById('battery-section');
  if (!container) return;
  if (!bat?.present) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');

  const chargePct = bat.charge_pct ?? 0;
  const capPct    = bat.max_capacity_pct >= 0 ? bat.max_capacity_pct : null;
  const cycles    = bat.cycle_count >= 0 ? bat.cycle_count : null;

  const condClass = bat.condition === 'Normal' ? 'ok'
                  : bat.condition === 'Service empfohlen' ? 'warning' : 'critical';
  const condIcon  = bat.condition === 'Normal' ? '🟢'
                  : bat.condition === 'Service empfohlen' ? '🟡' : '🔴';
  const chargeBarClass = chargePct > 50 ? 'ok' : chargePct > 20 ? 'warning' : 'critical';

  const remaining = bat.remaining_minutes > 0
    ? `${Math.floor(bat.remaining_minutes / 60)}:${String(bat.remaining_minutes % 60).padStart(2, '0')} verbleibend`
    : null;

  const rows = [
    ['Ladestand', `${chargePct}% – ${bat.status}${remaining ? ' · ' + remaining : ''}`],
    capPct !== null ? ['Kapazität (Gesundheit)', `${capPct}% der Original-Kapazität`] : null,
    cycles !== null ? ['Ladezyklen', `${cycles}`] : null,
    bat.temperature ? ['Temperatur', bat.temperature] : null,
    bat.condition ? ['Zustand', `${condIcon} ${bat.condition}`] : null,
  ].filter(Boolean);

  container.innerHTML = `
    <div class="battery-header">
      <span class="battery-icon">${chargePct > 80 ? '🔋' : chargePct > 20 ? '🪫' : '🪫'}</span>
      <span class="battery-title">Akku-Gesundheit</span>
      ${bat.condition ? `<span class="battery-health-badge ${condClass}">${condIcon} ${bat.condition}</span>` : ''}
    </div>
    ${capPct !== null ? `
    <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:3px">Kapazität: ${capPct}%</div>
    <div class="battery-bar-wrap">
      <div class="battery-bar ${capPct > 80 ? 'ok' : capPct > 50 ? 'warning' : 'critical'}" style="width:${capPct}%"></div>
    </div>` : ''}
    <div class="info-grid" style="margin-top:10px">${rows.map(([l,v]) =>
      `<span class="info-label">${escapeHtml(l)}</span><span class="info-value">${escapeHtml(String(v))}</span>`
    ).join('')}</div>`;
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

function renderTimeMachine(tm) {
  const container = document.getElementById('timemachine-info');
  if (!container) return;

  if (!tm) {
    container.innerHTML = '<div class="info-placeholder">Keine Time-Machine-Daten (macOS only).</div>';
    return;
  }

  const statusClass = { OK: 'badge-ok', WARNING: 'badge-warning', CRITICAL: 'badge-error', UNKNOWN: 'badge-unknown' }[tm.status] ?? 'badge-unknown';
  const statusIcon  = { OK: '🟢', WARNING: '🟡', CRITICAL: '🔴', UNKNOWN: '⚪' }[tm.status] ?? '⚪';

  let lastBackupStr = '–';
  if (tm.last_backup && tm.last_backup !== '0001-01-01T00:00:00Z') {
    const d = new Date(tm.last_backup);
    const days = tm.days_since_backup;
    const dayLabel = days === 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`;
    lastBackupStr = `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', {hour:'2-digit',minute:'2-digit'})} (${dayLabel})`;
  } else if (tm.enabled) {
    lastBackupStr = 'Noch kein Backup erstellt';
  }

  const rows = [
    ['Status', `<span class="status-badge ${statusClass}">${statusIcon} ${escapeHtml(tm.status)}</span>`],
    ['Aktiviert', tm.enabled ? '✓ Ja' : '✗ Kein Ziel konfiguriert'],
    ['Läuft gerade', tm.running ? '⏳ Backup läuft…' : '–'],
    ['Letztes Backup', lastBackupStr],
    ['Backup-Ziel', escapeHtml(tm.dest_name || '–')],
  ];

  container.innerHTML = '';
  container.appendChild(buildInfoGrid(rows, true));
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
    const fwRisk = sec.firewall_enabled ? '' : riskBadgeHtml(75);
    rows.push(['Firewall', sec.firewall_enabled
      ? '<span style="color:var(--color-success)">✓ Aktiv</span>'
      : `<span style="color:var(--color-error)">✗ Deaktiviert</span> ${fwRisk}`]);
  }
  if (sec.sip_known) {
    const sipOn = sec.sip_enabled;
    const sipRisk = sipOn ? '' : riskBadgeHtml(80);
    rows.push(['SIP (System Integrity Protection)', sipOn
      ? '<span style="color:var(--color-success)">✓ Aktiv</span>'
      : `<span style="color:var(--color-error)">✗ Deaktiviert</span> ${sipRisk}`]);
  }
  if (sec.defender_version || sec.defender_enabled) {
    const defLabel = isMac ? 'Gatekeeper / XProtect' : 'Windows Defender';
    const defRisk = sec.defender_enabled ? '' : riskBadgeHtml(80);
    rows.push([defLabel, sec.defender_enabled
      ? '<span style="color:var(--color-success)">✓ Aktiv</span>'
      : `<span style="color:var(--color-error)">✗ Deaktiviert</span> ${defRisk}`]);
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
      const fvRisk = v.encrypted ? '' : riskBadgeHtml(70);
      tr.innerHTML = `<td>${escapeHtml(v.drive)}</td><td>${icon} ${v.encrypted ? 'Ja' : 'Nein'} ${fvRisk}</td><td>${escapeHtml(v.status || '–')}</td>`;
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
    await saveSnapshot('browser_ext', result);
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
    tbl.innerHTML = '<thead><tr><th>Session</th><th>Erstellt</th><th>Gespeicherte Daten</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    sessions.forEach(s => {
      const tr = document.createElement('tr');
      const date = s.created_at ? new Date(s.created_at).toLocaleString('de-DE') : '–';
      const isActive = s.path === state.currentSessionPath;
      const snapshotHint = s.has_snapshots
        ? '<span style="color:var(--color-success);font-size:11px">✓ Ladbar</span>'
        : '<span style="color:var(--color-text-muted);font-size:11px">Nur Markdown</span>';
      tr.innerHTML = `
        <td>
          <strong>${escapeHtml(s.name)}</strong>
          ${isActive ? '<span class="user-badge" style="margin-left:4px">Aktiv</span>' : ''}
          <br><span style="font-size:11px;color:var(--color-text-muted)">${escapeHtml(shortenPath(s.path))}</span>
        </td>
        <td style="white-space:nowrap;font-size:12px">${escapeHtml(date)}</td>
        <td>${snapshotHint}</td>
        <td style="white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
          ${!isActive ? `<button class="btn btn-sm btn-primary btn-load-session" data-path="${escapeHtml(s.path)}" data-name="${escapeHtml(s.name)}">↩ Laden</button>` : ''}
          ${s.has_snapshots && state.currentSessionPath && s.path !== state.currentSessionPath
            ? `<button class="btn btn-sm btn-secondary btn-compare-session" data-path="${escapeHtml(s.path)}" data-name="${escapeHtml(s.name)}" title="Mit aktueller Session vergleichen">⚖ Vergleichen</button>`
            : ''}
        </td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    list.innerHTML = `<p class="section-meta">${sessions.length} Sessions · Klick auf "Laden" stellt alle gespeicherten Scan-Daten wieder her</p>`;
    list.appendChild(tbl);

    list.addEventListener('click', async (e) => {
      const loadBtn = e.target.closest('.btn-load-session');
      if (loadBtn) {
        loadBtn.disabled = true;
        loadBtn.textContent = '⏳';
        await loadSession({ path: loadBtn.dataset.path, name: loadBtn.dataset.name });
        return;
      }
      const cmpBtn = e.target.closest('.btn-compare-session');
      if (cmpBtn) {
        closeSessionHistory();
        await openBaselineCompare(cmpBtn.dataset.path, cmpBtn.dataset.name);
      }
    });
  } catch (err) {
    list.innerHTML = `<p class="info-placeholder">Fehler beim Laden: ${escapeHtml(String(err))}</p>`;
  }
}

async function loadSession(sessionInfo) {
  try {
    const snapshots = await LoadSession(sessionInfo.path);
    const keys = Object.keys(snapshots);

    if (keys.length === 0) {
      alert('Diese Session enthält noch keine ladbaren Snapshot-Daten.\nNur Sessions die mit dieser Version von AdminKit erstellt wurden, können geladen werden.');
      return;
    }

    state.currentSession = sessionInfo.name;
    state.currentSessionPath = sessionInfo.path;
    setEl('session-name', sessionInfo.name);

    const loaded = [];

    if (snapshots.system) {
      const r = JSON.parse(snapshots.system);
      renderHardware(r.hardware);
      renderBattery(r.hardware?.battery);
      renderOS(r.os);
      renderSmart(r.smart);
      renderTimeMachine(r.time_machine);
      renderSecurity(r.security);
      updateDashboardBadges(r);
      loaded.push('System');
    }
    if (snapshots.network) {
      const r = JSON.parse(snapshots.network);
      renderAdapters(r.adapters);
      renderShares(r.shares);
      renderWiFi(r.wifi);
      updateNetworkBadge(r);
      loaded.push('Netzwerk');
    }
    if (snapshots.software) {
      const r = JSON.parse(snapshots.software);
      renderSoftware(r);
      updateSoftwareBadge(r);
      loaded.push('Software');
    }
    if (snapshots.autostart) {
      const r = JSON.parse(snapshots.autostart);
      renderAutostart(r.entries);
      setEl('autostart-count', r.entries?.length ?? 0);
      loaded.push('Autostart');
    }
    if (snapshots.services) {
      const r = JSON.parse(snapshots.services);
      renderServices(r.services);
      setEl('services-count', r.services?.length ?? 0);
      loaded.push('Dienste');
    }
    if (snapshots.events) {
      const r = JSON.parse(snapshots.events);
      renderEvents(r.events);
      setEl('events-count', r.events?.length ?? 0);
      loaded.push('Ereignisse');
    }
    if (snapshots.printers) {
      const r = JSON.parse(snapshots.printers);
      renderPrinters(r.printers);
      loaded.push('Drucker');
    }
    if (snapshots.processes) {
      const r = JSON.parse(snapshots.processes);
      renderProcesses(r);
      setEl('processes-count', r?.length ?? 0);
      loaded.push('Prozesse');
    }
    if (snapshots.browser_ext) {
      const r = JSON.parse(snapshots.browser_ext);
      renderBrowserExtensions(r.extensions);
      setEl('extensions-count', r.extensions?.length ?? 0);
      loaded.push('Browser-Ext');
    }
    if (snapshots.users) {
      const r = JSON.parse(snapshots.users);
      renderUsers(r);
      setEl('users-count', r?.users?.length ?? 0);
      loaded.push('Benutzer');
    }
    if (snapshots.tasks) {
      const r = JSON.parse(snapshots.tasks);
      renderTasks(r);
      setEl('tasks-count', r?.tasks?.length ?? 0);
      loaded.push('Aufgaben');
    }
    if (snapshots.profiles) {
      const r = JSON.parse(snapshots.profiles);
      renderProfiles(r);
      setEl('profiles-count', r?.profiles?.length ?? 0);
      loaded.push('Profile');
    }
    if (snapshots.usb) {
      const r = JSON.parse(snapshots.usb);
      renderUSBDevices(r);
      setEl('usb-count', r?.devices?.length ?? 0);
      loaded.push('USB');
    }

    closeSessionHistory();
    addAction(`Session geladen: ${sessionInfo.name} (${loaded.join(', ')})`, 'success');
    setStatus(`Session "${sessionInfo.name}" wiederhergestellt`);
  } catch (err) {
    console.error('Session laden fehlgeschlagen:', err);
    addAction('Session laden fehlgeschlagen: ' + err, 'error');
  }
}

function closeSessionHistory() {
  document.getElementById('modal-session-history')?.classList.add('hidden');
}

// ─── Baseline-Vergleich ───────────────────────────────────────────────────────

async function openBaselineCompare(comparePath, compareName) {
  const modal  = document.getElementById('modal-baseline-compare');
  const header = document.getElementById('baseline-compare-header');
  const body   = document.getElementById('baseline-compare-body');
  if (!modal || !header || !body) return;

  modal.classList.remove('hidden');
  body.innerHTML = '<p class="info-placeholder">Lade Session-Daten…</p>';
  document.getElementById('btn-baseline-close')?.addEventListener('click', () => modal.classList.add('hidden'), { once: true });
  document.getElementById('btn-baseline-cancel')?.addEventListener('click', () => modal.classList.add('hidden'), { once: true });

  try {
    const [baseSnaps, compSnaps] = await Promise.all([
      LoadSession(state.currentSessionPath),
      LoadSession(comparePath),
    ]);

    const currentName = state.currentSession || 'Aktuelle Session';
    header.innerHTML = `
      <div class="baseline-sessions">
        <span class="baseline-label">🔵 Aktuell: <strong>${escapeHtml(currentName)}</strong></span>
        <span class="baseline-vs">vs.</span>
        <span class="baseline-label">🟡 Vergleich: <strong>${escapeHtml(compareName)}</strong></span>
      </div>`;

    const sections = [];

    // ── Dienste vergleichen ──
    if (baseSnaps.services && compSnaps.services) {
      const base = JSON.parse(baseSnaps.services).services || [];
      const comp = JSON.parse(compSnaps.services).services || [];
      const baseNames = new Set(base.map(s => s.name));
      const compNames = new Set(comp.map(s => s.name));
      const added   = comp.filter(s => !baseNames.has(s.name));
      const removed = base.filter(s => !compNames.has(s.name));
      const changed = base.filter(s => {
        const c = comp.find(x => x.name === s.name);
        return c && c.status !== s.status;
      }).map(s => ({ name: s.name, before: s.status, after: comp.find(x => x.name === s.name)?.status }));

      if (added.length || removed.length || changed.length) {
        sections.push(buildDiffSection('⚙ Dienste', added.map(s => s.name), removed.map(s => s.name),
          changed.map(c => `${c.name}: ${c.before} → ${c.after}`)));
      }
    }

    // ── Autostart vergleichen ──
    if (baseSnaps.autostart && compSnaps.autostart) {
      const base = JSON.parse(baseSnaps.autostart).entries || [];
      const comp = JSON.parse(compSnaps.autostart).entries || [];
      const baseKey = e => e.name + '|' + (e.path || '');
      const compKey = e => e.name + '|' + (e.path || '');
      const baseKeys = new Set(base.map(baseKey));
      const compKeys = new Set(comp.map(compKey));
      const added   = comp.filter(e => !baseKeys.has(compKey(e))).map(e => e.name);
      const removed = base.filter(e => !compKeys.has(baseKey(e))).map(e => e.name);
      if (added.length || removed.length) {
        sections.push(buildDiffSection('🚀 Autostart', added, removed, []));
      }
    }

    // ── Software vergleichen ──
    if (baseSnaps.software && compSnaps.software) {
      const base = JSON.parse(baseSnaps.software).apps || [];
      const comp = JSON.parse(compSnaps.software).apps || [];
      const baseNames = new Set(base.map(a => a.name));
      const compNames = new Set(comp.map(a => a.name));
      const added   = comp.filter(a => !baseNames.has(a.name)).map(a => a.name);
      const removed = base.filter(a => !compNames.has(a.name)).map(a => a.name);
      if (added.length || removed.length) {
        sections.push(buildDiffSection('📦 Software', added, removed, []));
      }
    }

    // ── Speicher vergleichen ──
    if (baseSnaps.system && compSnaps.system) {
      const baseVols = JSON.parse(baseSnaps.system).hardware?.volumes || [];
      const compVols = JSON.parse(compSnaps.system).hardware?.volumes || [];
      const diskLines = [];
      baseVols.forEach(bv => {
        const cv = compVols.find(v => v.mount_point === bv.mount_point);
        if (cv) {
          const diff = cv.free_gb - bv.free_gb;
          if (Math.abs(diff) > 0.1) {
            const sign = diff > 0 ? '+' : '';
            diskLines.push(`${bv.mount_point}: ${sign}${diff.toFixed(1)} GB frei`);
          }
        }
      });
      if (diskLines.length) {
        sections.push(`<div class="diff-section"><div class="diff-title">💽 Speicher (Δ frei)</div>
          <ul class="diff-list">${diskLines.map(l => `<li class="diff-changed">${escapeHtml(l)}</li>`).join('')}</ul></div>`);
      }
    }

    if (sections.length === 0) {
      body.innerHTML = '<p class="info-placeholder">✓ Keine wesentlichen Unterschiede gefunden.</p>';
    } else {
      body.innerHTML = sections.join('');
    }
  } catch (e) {
    body.innerHTML = `<p class="info-placeholder">Fehler: ${escapeHtml(String(e))}</p>`;
  }
}

function buildDiffSection(title, added, removed, changed) {
  let html = `<div class="diff-section"><div class="diff-title">${escapeHtml(title)}</div><ul class="diff-list">`;
  added.forEach(n => { html += `<li class="diff-added">+ ${escapeHtml(n)}</li>`; });
  removed.forEach(n => { html += `<li class="diff-removed">- ${escapeHtml(n)}</li>`; });
  changed.forEach(c => { html += `<li class="diff-changed">~ ${escapeHtml(c)}</li>`; });
  html += '</ul></div>';
  return html;
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
    await saveSnapshot('processes', procs);
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

// Heuristik: Prozess aus verdächtigem Pfad (Temp, Downloads, kein Systemverzeichnis)
function isSuspiciousProcessPath(p) {
  var path = (p.path || '').toLowerCase();
  if (!path) return false;
  return path.includes('/tmp/') ||
    path.includes('/private/tmp/') ||
    path.includes('/var/folders/') ||
    path.includes('/downloads/') ||
    path.includes('appdata\\local\\temp') ||
    path.includes('\\temp\\') ||
    // Root-Prozess aus nicht-systemischen Pfaden
    (p.user === 'root' && !path.startsWith('/usr/') && !path.startsWith('/system/') &&
     !path.startsWith('/sbin/') && !path.startsWith('/bin/') &&
     !path.startsWith('/library/apple/') && !path.startsWith('/private/var/db/'));
}

function renderProcesses(procs) {
  const container = document.getElementById('processes-info');
  if (!container) return;
  if (!procs?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine Prozesse gefunden.</div>';
    return;
  }

  // Sortierung: Verdächtige zuerst, dann CPU% absteigend
  const sorted = [...procs].sort((a, b) => {
    var da = isSuspiciousProcessPath(a) ? 2 : (a.cpu_pct > 20 || a.memory_mb > 500 ? 1 : 0);
    var db = isSuspiciousProcessPath(b) ? 2 : (b.cpu_pct > 20 || b.memory_mb > 500 ? 1 : 0);
    return db - da || (b.cpu_pct - a.cpu_pct) || (b.memory_mb - a.memory_mb);
  });

  const tbl = document.createElement('table');
  tbl.className = 'data-table';
  tbl.innerHTML = `<thead><tr>
    <th class="cb-col"><input type="checkbox" class="check-all" title="Alle auswählen"></th>
    <th>PID</th><th>Name</th><th>Benutzer</th><th>CPU%</th><th>RAM (MB)</th>
  </tr></thead>`;

  const tbody = document.createElement('tbody');
  sorted.forEach(p => {
    const cbId = `process:${p.pid}:${p.name}`;
    const isSusp = isSuspiciousProcessPath(p);
    const isHigh = !isSusp && (p.cpu_pct > 20 || p.memory_mb > 500);
    const tr = document.createElement('tr');
    if (isSusp) tr.classList.add('row-danger');
    else if (isHigh) tr.classList.add('row-warning');
    const suspIcon = isSusp ? ' <span title="Verdächtiger Pfad (Temp/Downloads)">⚠️</span>' : '';
    tr.innerHTML = `
      <td class="cb-col"><input type="checkbox" class="item-check"
        data-id="${escapeHtml(cbId)}"
        data-name="${escapeHtml(p.name)}"
        data-path="${escapeHtml(p.path || '')}"
        data-type="process"></td>
      <td class="mono">${p.pid}</td>
      <td>${escapeHtml(p.name)}${suspIcon}${p.path ? `<span class="item-path" title="${escapeHtml(p.path)}"> ${escapeHtml(p.path)}</span>` : ''}</td>
      <td>${escapeHtml(p.user || '–')}</td>
      <td class="${p.cpu_pct > 20 ? (isSusp ? 'text-danger' : 'text-warning') : ''}">${p.cpu_pct.toFixed(1)}</td>
      <td class="${p.memory_mb > 500 ? (isSusp ? 'text-danger' : 'text-warning') : ''}">${p.memory_mb.toFixed(0)}</td>`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  makeSortable(tbl);

  container.innerHTML = '';
  container.appendChild(tbl);

  var checkAll = tbl.querySelector('.check-all');
  if (checkAll) {
    checkAll.addEventListener('change', function(e) {
      tbl.querySelectorAll('.item-check').forEach(function(cb) {
        toggleItemSelection(cb, e.target.checked);
      });
      updateActionBar();
    });
  }
  tbl.addEventListener('click', function(e) {
    var cb = e.target.closest('.item-check');
    if (!cb) return;
    toggleItemSelection(cb, cb.checked);
    updateActionBar();
  });
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
  try {
    if (result.os) {
      setEl('info-hostname', result.os.hostname || result.os.name || '–');
      setEl('info-os', (result.os.name || '') + ' ' + (result.os.build || ''));
      if (result.os.last_boot_time) {
        setEl('info-uptime', calcUptime(result.os.last_boot_time));
      }
    }
  } catch(e) { console.error('updateDashboardBadges os:', e); }

  try {
    if (result.users && result.users.length) {
      var lastUser = result.users
        .filter(function(u) { return u.is_enabled && u.last_logon && String(u.last_logon).indexOf('0001') !== 0; })
        .sort(function(a, b) { return new Date(b.last_logon) - new Date(a.last_logon); })[0];
      if (lastUser) {
        setEl('info-lastlogin', lastUser.name + ' (' + formatDate(lastUser.last_logon) + ')');
      }
    }
  } catch(e) { console.error('updateDashboardBadges users:', e); }

  try {
    var hw = result.hardware;
    var hwName = (hw && hw.cpu && hw.cpu.name) ? hw.cpu.name : '';
    if (!hwName && hw) {
      // Fallback: Kerne + RAM wenn cpu.name leer (z.B. Apple Silicon macOS 26)
      var parts = [];
      if (hw.cpu && hw.cpu.cores > 0) parts.push(hw.cpu.cores + '-Kern CPU');
      if (hw.total_ram_gb > 0) parts.push(hw.total_ram_gb + ' GB RAM');
      if (parts.length > 0) hwName = parts.join(', ');
    }
    setBadge('badge-hardware', 'detail-hardware', hwName ? 'OK' : 'UNKNOWN', hwName || 'Kein CPU-Name');
  } catch(e) { console.error('updateDashboardBadges hw:', e); }

  try {
    var osName = (result.os && result.os.name) ? result.os.name : '';
    var osDetail = osName ? (osName + (result.os.version ? ' ' + result.os.version : '')) : 'Keine Daten';
    setBadge('badge-os', 'detail-os', osName ? 'OK' : 'UNKNOWN', osDetail);
  } catch(e) { console.error('updateDashboardBadges os badge:', e); }

  try {
    if (result.smart && result.smart.length > 0) {
      var worst = result.smart.reduce(function(acc, d) {
        var order = { CRITICAL: 3, WARNING: 2, UNKNOWN: 1, OK: 0 };
        return ((order[d.status] || 0) > (order[acc.status] || 0)) ? d : acc;
      }, result.smart[0]);
      setBadge('badge-smart', 'detail-smart', worst.status, result.smart.length + ' Disk(s) — ' + worst.status);
    } else {
      setBadge('badge-smart', 'detail-smart', 'UNKNOWN', 'Keine SMART-Daten');
    }
  } catch(e) { console.error('updateDashboardBadges smart:', e); }
}

function setBadge(badgeId, detailId, status, detail) {
  var badge = document.getElementById(badgeId);
  if (badge) {
    var classMap = { OK: 'badge-ok', WARNING: 'badge-warning', CRITICAL: 'badge-error', UNKNOWN: 'badge-unknown' };
    var icons = { OK: '🟢 OK', WARNING: '🟡 Warnung', CRITICAL: '🔴 Kritisch', UNKNOWN: '⚪ Unbekannt' };
    badge.className = 'status-badge ' + (classMap[status] || 'badge-unknown');
    badge.textContent = icons[status] || '⚪';
    setEl(detailId, detail != null ? detail : '');
  }
}

// ─── Session-Modal ────────────────────────────────────────────────────────────

function initSessionModal() {
  const modal   = document.getElementById('modal-session');
  const custIn  = document.getElementById('session-customer-input');
  const preview = document.getElementById('session-name-preview');

  document.getElementById('btn-new-session')?.addEventListener('click', () => {
    if (custIn) custIn.value = '';
    if (preview) preview.textContent = buildDefaultSessionName('');
    openStartupSessionModal();
  });
  document.getElementById('btn-session-cancel')?.addEventListener('click', () => {
    modal?.classList.add('hidden');
    // "Überspringen" → Auto-Session mit Datum+Gerät anlegen
    if (!state.currentSession) createSession(buildDefaultSessionName(''));
  });
  document.getElementById('btn-session-create')?.addEventListener('click', () => {
    var name = buildDefaultSessionName(custIn?.value || '');
    createSession(name);
  });
  custIn?.addEventListener('keydown', e => {
    if (e.key === 'Enter') createSession(buildDefaultSessionName(custIn.value));
    if (e.key === 'Escape') modal?.classList.add('hidden');
  });
}

async function createSession(name) {
  if (!name) name = buildDefaultSessionName('');
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

function setScanningIndicator(active) {
  const bar     = document.getElementById('statusbar');
  const spinner = document.getElementById('scan-spinner');
  bar?.classList.toggle('scanning', active);
  spinner?.classList.toggle('hidden', !active);
}

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
  // ── macOS System-Apps ────────────────────────────────────────────────────
  document.querySelectorAll('.tool-btn-sysapp').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var appPath = btn.dataset.path;
      var appName = btn.dataset.app;
      if (!appPath) return;
      RunRawCommand('open "' + appPath + '"')
        .then(function() { addAction('Geöffnet: ' + appName, 'info'); })
        .catch(function(err) { showToast('Fehler: ' + err); });
    });
  });

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

var CONSOLE_TOOL_DEFS = [
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

var CONSOLE_PRESETS = {
  ping:       ['google.com', '8.8.8.8', '1.1.1.1', 'cloudflare.com', 'microsoft.com'],
  traceroute: ['google.com', '8.8.8.8', '1.1.1.1'],
  dns:        ['google.com', 'github.com', 'microsoft.com', 'apple.com'],
  portscan:   ['localhost:80,443,22,3389', 'localhost:1-1024', '192.168.1.1:22,80,443'],
  curl:       ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://httpbin.org/ip', 'https://httpbin.org/get'],
};

var TOOL_INFO = {
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

  // Bei aktiver Suche alle Gruppen aufklappen, damit Treffer sichtbar sind
  sysTab.querySelectorAll('.autostart-group.collapsed').forEach(g => g.classList.remove('collapsed'));

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
  // "Letzte Zusammenfassung" Button in Titelleiste
  document.getElementById('btn-show-last-summary')?.addEventListener('click', () => {
    if (state.lastScanSummaryHtml) reopenScanSummary();
  });
}

function closeScanSummary() {
  document.getElementById('modal-scan-summary')?.classList.add('hidden');
}

function reopenScanSummary() {
  const modal = document.getElementById('modal-scan-summary');
  const modGrid = document.getElementById('summary-modules');
  const modFindings = document.getElementById('summary-findings');
  if (!modal || !state.lastScanSummaryHtml) return;
  if (modGrid)    modGrid.innerHTML    = state.lastScanSummaryModulesHtml || '';
  if (modFindings) modFindings.innerHTML = state.lastScanSummaryHtml;
  attachSummaryJumpListeners();
  modal.classList.remove('hidden');
}

function attachSummaryJumpListeners() {
  document.querySelectorAll('.summary-finding[data-jump-tab]').forEach(el => {
    el.style.cursor = 'pointer';
    el.title = 'Klicken um zu diesem Abschnitt zu springen';
    el.onclick = () => {
      const tab    = el.dataset.jumpTab;
      const target = el.dataset.jumpTarget;
      closeScanSummary();
      if (tab) switchTab(tab);
      if (target) {
        setTimeout(() => {
          var targetEl = document.getElementById(target);
          if (!targetEl) return;
          // Übergeordnete info-section aufklappen falls zugeklappt
          var parentSection = targetEl.closest('.info-section');
          if (parentSection && parentSection.classList.contains('collapsed')) {
            parentSection.classList.remove('collapsed');
          }
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    };
  });
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
    await saveSnapshot('users', result);
    setStatus(`Benutzer-Scan: ${count} Konten gefunden`);
    addAction(`Benutzer-Scan: ${count} lokale Konten`, 'info');
  } catch (err) {
    if (container) container.innerHTML = `<div class="info-placeholder">Fehler: ${escapeHtml(String(err))}</div>`;
    addAction('Benutzer-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || '↺'; }
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
    const adminBadge = u.is_admin    ? '<span class="user-badge user-admin">Admin</span>' : '';
    const sysBadge   = u.is_system   ? '<span class="user-badge user-system">System</span>' : '';
    const disBadge   = u.is_disabled ? '<span class="user-badge user-disabled">Deaktiviert</span>' : '';
    // "Kein Passwort" nur bei aktiven (nicht-deaktivierten) Konten anzeigen —
    // deaktivierte Systemkonten (root, _www etc.) sind absichtlich passwortlos gesperrt
    const pwBadge    = (!u.has_password && !u.is_disabled && !u.is_system)
      ? '<span class="user-badge user-nopw">Kein Passwort</span>' : '';
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
    const groupRows = result.groups.map(g => {
      const members = (g.members ?? []);
      return `<tr>
        <td style="font-weight:600;white-space:nowrap">${escapeHtml(g.name)}</td>
        <td style="font-size:12px">${members.length > 0
          ? members.map(m => `<span class="user-badge user-system" style="margin:1px 2px;display:inline-block">${escapeHtml(m)}</span>`).join(' ')
          : '<span style="color:var(--color-text-muted)">–</span>'
        }</td>
      </tr>`;
    }).join('');
    groupHtml = `
    <h4 style="margin:16px 0 6px;font-size:13px;color:var(--color-text-muted);font-weight:600">Gruppen</h4>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Gruppe</th><th>Mitglieder</th></tr></thead>
        <tbody>${groupRows}</tbody>
      </table>
    </div>`;
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
    await saveSnapshot('tasks', result);
    setStatus(`Aufgaben-Scan: ${count} Aufgaben gefunden`);
    addAction(`Aufgaben-Scan: ${count} geplante Aufgaben`, 'info');
  } catch (err) {
    if (container) container.innerHTML = `<div class="info-placeholder">Fehler: ${escapeHtml(String(err))}</div>`;
    addAction('Aufgaben-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || '↺'; }
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
    await saveSnapshot('profiles', result);
    setStatus(`Profil-Scan: ${count} Profile gefunden`);
    addAction(`Profil-Scan: ${count} Konfigurationsprofile`, 'info');
  } catch (err) {
    if (container) container.innerHTML = `<div class="info-placeholder">Fehler: ${escapeHtml(String(err))}</div>`;
    addAction('Profil-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || '↺'; }
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
    await saveSnapshot('usb', result);
    setStatus(`USB-Scan: ${count} Geräte gefunden`);
    addAction(`USB-Scan: ${count} USB-Geräte`, 'info');
  } catch (err) {
    if (container) container.innerHTML = `<div class="info-placeholder">Fehler: ${escapeHtml(String(err))}</div>`;
    addAction('USB-Scan fehlgeschlagen: ' + err, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || '↺'; }
  }
}

function renderUSBDevices(result) {
  const container = document.getElementById('usb-info');
  if (!container) return;
  if (!result?.devices?.length) {
    container.innerHTML = '<div class="info-placeholder">Keine USB-Geräte gefunden.</div>';
    return;
  }

  const tbody = document.createElement('tbody');
  result.devices.forEach(d => {
    const tr = document.createElement('tr');
    if (d.is_hub) tr.style.color = 'var(--color-muted)';
    const ejectBtn = d.bsd_name && !d.is_hub
      ? `<button class="btn-action btn-eject-usb" data-bsd="${escapeHtml(d.bsd_name)}" data-name="${escapeHtml(d.name)}" title="Gerät auswerfen">⏏</button>`
      : '';
    tr.innerHTML = `
      <td>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.manufacturer || '–')}</td>
      <td class="mono">${escapeHtml(d.vendor_id || '–')}</td>
      <td class="mono">${escapeHtml(d.product_id || '–')}</td>
      <td class="mono" style="font-size:11px">${escapeHtml(d.serial_number || '–')}</td>
      <td>${escapeHtml(d.speed || '–')}</td>
      <td>${ejectBtn}</td>`;
    tbody.appendChild(tr);
  });

  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  const tbl = document.createElement('table');
  tbl.className = 'data-table';
  tbl.innerHTML = `<thead><tr>
    <th>Name</th><th>Hersteller</th><th>VID</th><th>PID</th><th>Seriennummer</th><th>Geschwindigkeit</th><th></th>
  </tr></thead>`;
  tbl.appendChild(tbody);
  wrapper.appendChild(tbl);
  container.appendChild(wrapper);

  container.addEventListener('click', async function(e) {
    const btn = e.target.closest('.btn-eject-usb');
    if (!btn) return;
    const bsd  = btn.dataset.bsd;
    const name = btn.dataset.name;
    const ok = await showConfirm({
      title: 'USB-Gerät auswerfen',
      what: `"${name}" (${bsd}) wird sicher ausgeworfen.`,
      impact: 'Laufende Dateiübertragungen werden unterbrochen. Gerät erst danach physisch entfernen.',
    });
    if (!ok) return;
    try {
      await EjectUSBDevice(bsd);
      btn.closest('tr').remove();
      showToast(`${name} wurde ausgeworfen.`);
      addAction(`USB ausgeworfen: ${name}`, 'success');
    } catch (err) {
      showToast('Auswerfen fehlgeschlagen: ' + err, 'error');
      addAction('USB-Auswerfen fehlgeschlagen: ' + err, 'error');
    }
  });
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

  // Sicherheit — alle mit Jump-Ziel security-info
  const sec_t = { tab: 'system', target: 'security-info' };
  if (sec) {
    const isMac = sec.platform === 'darwin';
    const encLabel = isMac ? 'FileVault' : 'BitLocker';
    const defLabel = isMac ? 'Gatekeeper / XProtect' : 'Windows Defender';

    if (sec.firewall_known) {
      if (sec.firewall_enabled === false) critical.push({ text: '🔥 Firewall ist deaktiviert', ...sec_t });
      else if (sec.firewall_enabled === true) ok.push({ text: 'Firewall aktiv' });
    }

    if (sec.defender_enabled === false) critical.push({ text: `🛡 ${defLabel} ist deaktiviert`, ...sec_t });
    else if (sec.defender_enabled === true)
      ok.push({ text: `${defLabel} aktiv${sec.defender_version ? ' (' + sec.defender_version + ')' : ''}` });

    if (sec.rdp_enabled === true) {
      const rdpLabel = isMac ? 'Remote Login (SSH)' : 'RDP';
      if (!isMac && !sec.nla_enabled) warnings.push({ text: `🖥 ${rdpLabel} aktiv ohne NLA`, ...sec_t });
      else ok.push({ text: `${rdpLabel} aktiv (Port ${sec.rdp_port || (isMac ? 22 : 3389)})` });
    } else if (sec.rdp_enabled === false) {
      ok.push({ text: isMac ? 'Remote Login (SSH) deaktiviert' : 'RDP deaktiviert' });
    }

    const userShares = sec.local_shares?.filter(s => !s.is_system) ?? [];
    if (userShares.length > 0)
      warnings.push({ text: `📂 ${userShares.length} aktive Netzwerkfreigabe(n): ${userShares.map(s => s.name).join(', ')}`, tab: 'network' });

    const unencrypted = sec.bitlocker_volumes?.filter(v => !v.encrypted) ?? [];
    if (unencrypted.length > 0)
      warnings.push({ text: `🔓 ${unencrypted.length} Laufwerk(e) ohne ${encLabel}-Verschlüsselung`, ...sec_t });
    else if (sec.bitlocker_volumes?.length > 0)
      ok.push({ text: `Alle Laufwerke mit ${encLabel} verschlüsselt` });
  }

  // SMART
  if (sys?.smart?.length > 0) {
    const critDisks = sys.smart.filter(d => d.status === 'CRITICAL');
    const warnDisks = sys.smart.filter(d => d.status === 'WARNING');
    if (critDisks.length > 0)
      critical.push({ text: `💾 ${critDisks.length} Festplatte(n) KRITISCHER SMART-Status: ${critDisks.map(d => d.model).join(', ')}`, tab: 'system', target: 'hw-info' });
    if (warnDisks.length > 0)
      warnings.push({ text: `💾 ${warnDisks.length} Festplatte(n) mit SMART-Warnung: ${warnDisks.map(d => d.model).join(', ')}`, tab: 'system', target: 'hw-info' });
    if (critDisks.length === 0 && warnDisks.length === 0)
      ok.push({ text: `SMART: alle ${sys.smart.length} Disk(s) OK` });
  }

  // Lizenz / OS
  if (sys?.os?.license_status) {
    const ls = sys.os.license_status;
    if (ls !== 'Licensed' && ls !== 'Lizenziert' && ls !== 'Licensed (OEM)')
      warnings.push({ text: `📋 Betriebssystem-Lizenz: ${ls}`, tab: 'system', target: 'os-info' });
  }

  // Speicherplatz
  if (sys?.hardware?.volumes?.length > 0) {
    let allOk = true;
    sys.hardware.volumes.forEach(vol => {
      const pct = vol.total_gb > 0 ? Math.round((vol.used_gb / vol.total_gb) * 100) : 0;
      const lbl = vol.label || vol.letter || 'Volume';
      if (pct >= 95)      { critical.push({ text: `💾 ${lbl}: ${pct}% voll (${vol.free_gb} GB frei)`, tab: 'system', target: 'hw-info' }); allOk = false; }
      else if (pct >= 80) { warnings.push({ text: `💾 ${lbl}: ${pct}% voll (${vol.free_gb} GB frei)`, tab: 'system', target: 'hw-info' }); allOk = false; }
    });
    if (allOk) ok.push({ text: 'Speicherplatz: alle Volumes unkritisch' });
  }

  // Systemereignisse — nur risk_score-basiert, damit Summary mit Events-Ansicht übereinstimmt
  // Events-Ansicht zeigt ebenfalls nur risk_score >= 20, daher keine macOS-Level-Zählung
  if (evtRes?.events?.length > 0) {
    const highRiskEvts = evtRes.events.filter(e => (e.risk_score || 0) >= 60);
    const medRiskEvts  = evtRes.events.filter(e => (e.risk_score || 0) >= 20 && (e.risk_score || 0) < 60);
    if (highRiskEvts.length > 0)
      critical.push({ text: `⚠ ${highRiskEvts.length} hochriskante Systemereignisse (Score ≥ 60)`, tab: 'system', target: 'events-info' });
    if (medRiskEvts.length > 0)
      warnings.push({ text: `⚠ ${highRiskEvts.length + medRiskEvts.length} risikorelevante Ereignisse im Log`, tab: 'system', target: 'events-info' });
    if (highRiskEvts.length === 0 && medRiskEvts.length === 0)
      ok.push({ text: 'Ereignis-Log: keine risikorelevanten Ereignisse' });
  } else if (evtRes) {
    ok.push({ text: 'Ereignis-Log: keine kritischen Ereignisse' });
  }

  // Autostart
  if (auto?.entries?.length > 0) {
    const thirdParty = auto.entries.filter(e => !e.is_system && e.is_enabled);
    if (thirdParty.length > 15)
      warnings.push({ text: `🚀 ${thirdParty.length} aktive Drittanbieter-Autostart-Einträge`, tab: 'system', target: 'autostart-info' });
    else
      ok.push({ text: `Autostart: ${thirdParty.length} Drittanbieter-Einträge (${auto.entries.length} gesamt)` });
  }

  // Netzwerk
  if (state.lastNetworkResult?.adapters?.length > 0) {
    const connected = state.lastNetworkResult.adapters.filter(a => a.is_connected).length;
    const total     = state.lastNetworkResult.adapters.length;
    if (connected === 0) warnings.push({ text: '🌐 Kein Netzwerkadapter verbunden', tab: 'network' });
    else ok.push({ text: `Netzwerk: ${connected}/${total} Adapter verbunden` });
  }

  // Partielle Scan-Fehler aus allen Ergebnissen
  const allResults  = [sys, auto, state.lastServicesResult, evtRes, state.lastPrinterResult,
                       state.lastNetworkResult, state.lastSoftwareResult, state.lastBrowserExtResult];
  const modNames    = ['System', 'Autostart', 'Dienste', 'Ereignislog', 'Drucker', 'Netzwerk', 'Software', 'Extensions'];
  allResults.forEach((r, i) => {
    r?.errors?.forEach(e => scanErrs.push({ text: `[${modNames[i]}/${e.module}] ${e.message}` }));
  });

  const critFinal = critical;
  const warnFinal = warnings;
  const okFinal   = ok;
  const errFinal  = scanErrs;

  // ── HTML ausgeben ─────────────────────────────────────────────────────────
  const findingHtml = (f, cls) => {
    const jump = f.tab ? `data-jump-tab="${f.tab}"${f.target ? ` data-jump-target="${f.target}"` : ''}` : '';
    const hint = f.tab ? ' <span class="summary-jump-hint">→ anzeigen</span>' : '';
    return `<div class="summary-finding ${cls}"${jump ? ' ' + jump : ''}>${escapeHtml(f.text)}${hint}</div>`;
  };

  let html = '';
  if (critFinal.length > 0) {
    html += '<div class="summary-section"><div class="summary-section-title">🔴 Kritisch</div>';
    html += critFinal.map(f => findingHtml(f, 'summary-critical')).join('');
    html += '</div>';
  }
  if (warnFinal.length > 0) {
    html += '<div class="summary-section"><div class="summary-section-title">🟡 Hinweise</div>';
    html += warnFinal.map(f => findingHtml(f, 'summary-warning')).join('');
    html += '</div>';
  }
  if (okFinal.length > 0) {
    html += '<div class="summary-section"><div class="summary-section-title">🟢 OK</div>';
    html += okFinal.map(f => findingHtml(f, 'summary-ok')).join('');
    html += '</div>';
  }
  if (errFinal.length > 0) {
    html += '<div class="summary-section"><div class="summary-section-title">⚙ Scan-Hinweise</div>';
    html += errFinal.map(f => findingHtml(f, 'summary-scan-error')).join('');
    html += '</div>';
  }
  if (!html) {
    html = '<p class="info-placeholder">Keine auffälligen Befunde.</p>';
  }

  modFindings.innerHTML = html;

  // Zusammenfassung in State cachen damit sie re-geöffnet werden kann
  state.lastScanSummaryHtml        = html;
  state.lastScanSummaryModulesHtml = modGrid.innerHTML;
  document.getElementById('btn-show-last-summary')?.classList.remove('hidden');

  attachSummaryJumpListeners();
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
  document.getElementById('btn-export-pdf')?.addEventListener('click', () => runExportPDF());
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

function runExportPDF() {
  document.getElementById('export-dropdown')?.classList.remove('open');
  // Ersten HTML-Bericht erstellen, dann drucken — oder direkt Drucken wenn Bericht schon offen.
  // Einfachster Weg: HTML-Bericht als Datei exportieren, dann im Browser via Druckdialog als PDF.
  // Da wir WKWebView nutzen, öffnen wir den erstellten HTML-Bericht im System-Browser
  // und der Nutzer wählt "Als PDF sichern" im macOS-Druckdialog.
  // Kurzweg: direkt window.print() auf den aktuellen App-Inhalt.
  window.print();
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
    // Schnellaktionen-Sichtbarkeit
    const disabledQA = cfg.defaults?.disabled_quick_actions || [];
    ['internet_fix', 'printer_fix', 'quick_clean', 'dns_flush'].forEach(id => {
      const el = document.getElementById('qa-toggle-' + id);
      if (el) el.checked = !disabledQA.includes(id);
    });
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
  const hasLogo    = !!(branding?.logo_path);

  if (!company && !technician && !hasLogo) {
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

  // Schnellaktionen: deaktivierte IDs sammeln
  cfg.defaults.disabled_quick_actions = ['internet_fix', 'printer_fix', 'quick_clean', 'dns_flush']
    .filter(id => !document.getElementById('qa-toggle-' + id)?.checked);

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
    // Schnellaktionen-Sichtbarkeit sofort aktualisieren
    applyQuickActionVisibility();
  }
}

function applyQuickActionVisibility() {
  const disabled = state.config?.defaults?.disabled_quick_actions || [];
  [['qa-internet-fix','internet_fix'],['qa-printer-fix','printer_fix'],
   ['qa-quick-clean','quick_clean'],['qa-dns-flush','dns_flush']].forEach(([btnId, actionId]) => {
    const el = document.getElementById(btnId);
    if (el) el.style.display = disabled.includes(actionId) ? 'none' : '';
  });
}

// ─── Diagnose-Bericht ─────────────────────────────────────────────────────────

function initDiagnosticReport() {
  const btnRun   = document.getElementById('btn-diag-run');
  const btnCopy  = document.getElementById('btn-diag-copy');
  const btnClose = document.getElementById('btn-diag-close');
  const result   = document.getElementById('diag-result');
  const output   = document.getElementById('diag-output');
  const summary  = document.getElementById('diag-result-summary');

  // Preset-Buttons
  document.getElementById('diag-preset-1h')?.addEventListener('click', () => setDiagPreset(1));
  document.getElementById('diag-preset-24h')?.addEventListener('click', () => setDiagPreset(24));
  document.getElementById('diag-preset-7d')?.addEventListener('click', () => setDiagPreset(24 * 7));

  btnClose?.addEventListener('click', () => result?.classList.add('hidden'));

  btnCopy?.addEventListener('click', () => {
    const text = output?.textContent || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const prev = btnCopy.textContent;
      btnCopy.textContent = '✓ Kopiert!';
      setTimeout(() => { btnCopy.textContent = prev; }, 2000);
    });
  });

  btnRun?.addEventListener('click', async () => {
    const from    = isoToGoTime(document.getElementById('diag-from')?.value || '');
    const to      = isoToGoTime(document.getElementById('diag-to')?.value || '');
    const process = (document.getElementById('diag-process')?.value || '').trim();

    btnRun.disabled = true;
    btnRun.textContent = '⏳ Wird erstellt…';
    result?.classList.add('hidden');

    try {
      const report = await GetDiagnosticReport(from, to, process);
      if (!report) throw new Error('Keine Antwort vom Backend');

      const clusterCount = report.clusters?.length || 0;
      const crashCount   = report.crash_reports?.length || 0;
      summary.textContent = `${report.total_events} Ereignisse · ${clusterCount} Fehlermuster · ${crashCount} Crash-Reports`;
      output.textContent  = report.markdown_report || '(Kein Bericht generiert)';
      result?.classList.remove('hidden');
      result?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      addAction('Diagnose-Bericht fehlgeschlagen: ' + err, 'error');
    } finally {
      btnRun.disabled = false;
      btnRun.textContent = '🔬 Bericht erstellen';
    }
  });
}

// Setzt Von/Bis-Felder auf jetzt minus `hoursBack` Stunden
function setDiagPreset(hoursBack) {
  const now  = new Date();
  const from = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  const fmt  = d => d.toISOString().slice(0, 16); // "yyyy-MM-ddTHH:mm"
  const fromEl = document.getElementById('diag-from');
  const toEl   = document.getElementById('diag-to');
  if (fromEl) fromEl.value = fmt(from);
  if (toEl)   toEl.value   = fmt(now);
}

// Wandelt "2024-06-15T14:30" → "2024-06-15 14:30:00" (Go-Format), leer bleibt leer
function isoToGoTime(iso) {
  if (!iso) return '';
  return iso.replace('T', ' ') + ':00';
}

// ─── Dashboard-Karten Navigation ──────────────────────────────────────────────

function initSidebarNav() {
  document.querySelectorAll('.sidebar-link[data-target]').forEach(function(link) {
    link.addEventListener('click', function() {
      var sectionId = link.dataset.target;
      var section = document.getElementById(sectionId);
      if (!section) return;
      // Sektion aufklappen falls zugeklappt
      if (section.classList.contains('collapsed')) {
        section.classList.remove('collapsed');
      }
      // Innerhalb des nächsten .tab-content-area scrollt
      var area = section.closest('.tab-content-area');
      if (area) {
        var top = section.offsetTop - area.offsetTop - 8;
        area.scrollTo({ top: top < 0 ? 0 : top, behavior: 'smooth' });
      } else {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Aktiven Link markieren
      var sidebar = link.closest('.section-sidebar');
      if (sidebar) {
        sidebar.querySelectorAll('.sidebar-link').forEach(function(l) { l.classList.remove('sidebar-active'); });
        link.classList.add('sidebar-active');
      }
    });
  });

  // Scroll-Spy: aktiven Abschnitt in der Sidebar hervorheben
  document.querySelectorAll('.tab-content-area').forEach(function(area) {
    area.addEventListener('scroll', function() {
      var sections = area.querySelectorAll('.info-section[id], div[id].table-wrapper');
      var sidebar = area.closest('.tab-panel')?.querySelector('.section-sidebar');
      if (!sidebar) return;
      var areaTop = area.scrollTop;
      var active = null;
      sections.forEach(function(sec) {
        if (sec.offsetTop - area.offsetTop <= areaTop + 40) active = sec.id;
      });
      if (active) {
        sidebar.querySelectorAll('.sidebar-link').forEach(function(l) {
          l.classList.toggle('sidebar-active', l.dataset.target === active);
        });
      }
    }, { passive: true });
  });
}

// ─── Systemeinstellungen Quick-Links ─────────────────────────────────────────
// Fügt kleine ⚙-Buttons in Sektions-Titelzeilen ein die direkt
// zur passenden macOS-Systemeinstellungs-Seite öffnen.
function initSysPrefsLinks() {
  // Mapping: SektionsID → { url, label }
  var sysPrefsMap = {
    'section-hw':        { url: 'x-apple.systempreferences:com.apple.settings.Storage',           label: 'Lagerung' },
    'section-os':        { url: 'x-apple.systempreferences:com.apple.preference.softwareupdate',   label: 'Software-Aktualisierung' },
    'section-smart':       { url: 'x-apple.systempreferences:com.apple.settings.Storage',                     label: 'Lagerung' },
    'section-timemachine': { url: 'x-apple.systempreferences:com.apple.prefs.backup',                          label: 'Time Machine' },
    'section-autostart': { url: 'x-apple.systempreferences:com.apple.LoginItems-Settings.extension', label: 'Anmeldeobjekte' },
    'section-security':  { url: 'x-apple.systempreferences:com.apple.preference.security',        label: 'Datenschutz & Sicherheit' },
    'section-users':     { url: 'x-apple.systempreferences:com.apple.preference.accounts',        label: 'Benutzer:innen & Gruppen' },
    'section-printer':   { url: 'x-apple.systempreferences:com.apple.preference.printfax',        label: 'Drucker & Scanner' },
    'section-profiles':  { url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_DeviceManagement', label: 'Profile (Datenschutz)' },
    'section-adapter':   { url: 'x-apple.systempreferences:com.apple.preference.network',         label: 'Netzwerk' },
    'section-wifi':      { url: 'x-apple.systempreferences:com.apple.WiFiSettings',               label: 'WLAN' },
    'section-shares':    { url: 'x-apple.systempreferences:com.apple.preferences.sharing',        label: 'Sharing' },
  };
  Object.keys(sysPrefsMap).forEach(function(id) {
    var section = document.getElementById(id);
    if (!section) return;
    var h3 = section.querySelector('.section-title');
    if (!h3) return;
    var info = sysPrefsMap[id];
    var btn = document.createElement('button');
    btn.className = 'btn-sysprefs';
    btn.title = 'Systemeinstellungen → ' + info.label;
    btn.textContent = '⚙';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (window.runtime?.BrowserOpenURL) {
        window.runtime.BrowserOpenURL(info.url);
      } else {
        RunRawCommand('open "' + info.url + '"').catch(function(){});
      }
    });
    h3.appendChild(btn);
  });
}

function initDashboardCardNav() {
  document.querySelectorAll('.card-nav[data-nav-tab]').forEach(card => {
    card.addEventListener('click', () => {
      const tab = card.dataset.navTab;
      if (tab) switchTab(tab);
    });
  });
}

// ─── Wiki-Tab ─────────────────────────────────────────────────────────────────

function initWikiTab() {
  // WIKI_DATA ist lokal definiert um Terser-TDZ-Probleme zu vermeiden
  var wikiData = [
    // macOS Befehle
    { os: 'macos', cat: 'Netzwerk',    title: 'Ping',                cmd: 'ping -c 4 google.com',                       desc: 'Erreichbarkeit eines Hosts prüfen (4 Pakete)' },
    { os: 'macos', cat: 'Netzwerk',    title: 'Traceroute',          cmd: 'traceroute google.com',                      desc: 'Netzwerkpfad zum Ziel anzeigen' },
    { os: 'macos', cat: 'Netzwerk',    title: 'DNS-Lookup',          cmd: 'nslookup google.com',                        desc: 'DNS-Auflösung eines Hostnamens' },
    { os: 'macos', cat: 'Netzwerk',    title: 'Netzwerkadapter',     cmd: 'ifconfig',                                   desc: 'Alle Netzwerkinterfaces und IP-Adressen' },
    { os: 'macos', cat: 'Netzwerk',    title: 'Offene Ports',        cmd: 'sudo lsof -iTCP -sTCP:LISTEN -n -P',        desc: 'Alle lauschenden TCP-Ports' },
    { os: 'macos', cat: 'Netzwerk',    title: 'DNS-Cache leeren',    cmd: 'sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder', desc: 'macOS DNS-Cache zurücksetzen' },
    { os: 'macos', cat: 'Netzwerk',    title: 'ARP-Tabelle',         cmd: 'arp -a',                                     desc: 'MAC-Adressen im lokalen Netzwerk' },
    { os: 'macos', cat: 'Netzwerk',    title: 'Aktive Verbindungen', cmd: 'netstat -an | grep ESTABLISHED',             desc: 'Aktive TCP-Verbindungen' },
    { os: 'macos', cat: 'System',      title: 'Systeminformation',   cmd: 'system_profiler SPHardwareDataType',         desc: 'Hardware-Übersicht (CPU, RAM, Seriennummer)' },
    { os: 'macos', cat: 'System',      title: 'macOS-Version',       cmd: 'sw_vers',                                    desc: 'Produktname, Version und Build-Nummer' },
    { os: 'macos', cat: 'System',      title: 'Uptime',              cmd: 'uptime',                                     desc: 'Systemlaufzeit und Durchschnittslast' },
    { os: 'macos', cat: 'System',      title: 'Laufende Prozesse',   cmd: 'ps aux | head -20',                          desc: 'Top-20 laufende Prozesse' },
    { os: 'macos', cat: 'System',      title: 'Festplatten',         cmd: 'diskutil list',                              desc: 'Alle Datenträger und Partitionen' },
    { os: 'macos', cat: 'System',      title: 'Speicherplatz',       cmd: 'df -h',                                      desc: 'Belegter und freier Speicherplatz' },
    { os: 'macos', cat: 'System',      title: 'RAM-Nutzung',         cmd: 'vm_stat',                                    desc: 'Virtueller Speicher Statistik' },
    { os: 'macos', cat: 'System',      title: 'Kernel-Version',      cmd: 'uname -a',                                   desc: 'Kernel-Version und Architektur' },
    { os: 'macos', cat: 'System',      title: 'FileVault-Status',    cmd: 'fdesetup status',                            desc: 'Festplattenverschlüsselung Status' },
    { os: 'macos', cat: 'System',      title: 'SIP-Status',          cmd: 'csrutil status',                             desc: 'System Integrity Protection Status' },
    { os: 'macos', cat: 'Benutzer',    title: 'Aktueller Benutzer',  cmd: 'whoami',                                     desc: 'Angemeldeter Benutzername' },
    { os: 'macos', cat: 'Benutzer',    title: 'Alle Benutzer',       cmd: 'dscl . -list /Users',                        desc: 'Alle lokalen Benutzerkonten' },
    { os: 'macos', cat: 'Benutzer',    title: 'Admin-Gruppe',        cmd: 'dscl . -read /Groups/admin GroupMembership', desc: 'Mitglieder der Admin-Gruppe' },
    { os: 'macos', cat: 'Benutzer',    title: 'Login-Items',         cmd: "osascript -e 'tell application \"System Events\" to get the name of every login item'", desc: 'Autostart-Programme (Login-Objekte)' },
    { os: 'macos', cat: 'LaunchCtl',   title: 'Dienste auflisten',   cmd: 'launchctl list | grep -v "com.apple"',       desc: 'Drittanbieter-LaunchAgents' },
    { os: 'macos', cat: 'LaunchCtl',   title: 'Dienst aktivieren',   cmd: 'launchctl load -w ~/Library/LaunchAgents/com.example.plist',   desc: 'LaunchAgent aktivieren' },
    { os: 'macos', cat: 'LaunchCtl',   title: 'Dienst deaktivieren', cmd: 'launchctl unload -w ~/Library/LaunchAgents/com.example.plist', desc: 'LaunchAgent deaktivieren' },
    { os: 'macos', cat: 'Shortcuts',   title: 'Aktivitätsanzeige',   cmd: 'Cmd+Space → Aktivitätsanzeige',              desc: 'CPU, RAM, Netzwerk, Energie überwachen' },
    { os: 'macos', cat: 'Shortcuts',   title: 'Force Quit',          cmd: 'Alt+Cmd+Esc',                                desc: 'Nicht reagierende App sofort beenden' },
    { os: 'macos', cat: 'Shortcuts',   title: 'Screenshot Bereich',  cmd: 'Cmd+Shift+4',                                desc: 'Bereichs-Screenshot (in Zwischenablage: + Ctrl)' },
    { os: 'macos', cat: 'Shortcuts',   title: 'Spotlight',           cmd: 'Cmd+Space',                                  desc: 'Suche, Apps starten, Berechnungen' },
    { os: 'macos', cat: 'Shortcuts',   title: 'Mission Control',     cmd: 'Ctrl+Pfeil oben',                            desc: 'Alle offenen Fenster Übersicht' },
    { os: 'macos', cat: 'Shortcuts',   title: 'Finder Versteckte',   cmd: 'Cmd+Shift+.',                                desc: 'Versteckte Dateien im Finder ein-/ausblenden' },
    // Windows Befehle
    { os: 'windows', cat: 'Netzwerk',  title: 'Ping',                cmd: 'ping -n 4 google.com',                       desc: 'Erreichbarkeit prüfen (4 Pakete)' },
    { os: 'windows', cat: 'Netzwerk',  title: 'Traceroute',          cmd: 'tracert google.com',                         desc: 'Netzwerkpfad anzeigen' },
    { os: 'windows', cat: 'Netzwerk',  title: 'DNS-Lookup',          cmd: 'nslookup google.com',                        desc: 'DNS-Auflösung' },
    { os: 'windows', cat: 'Netzwerk',  title: 'Netzwerkadapter',     cmd: 'ipconfig /all',                              desc: 'Alle Netzwerkinterfaces' },
    { os: 'windows', cat: 'Netzwerk',  title: 'DNS-Cache leeren',    cmd: 'ipconfig /flushdns',                         desc: 'DNS-Cache zurücksetzen' },
    { os: 'windows', cat: 'Netzwerk',  title: 'Offene Verbindungen', cmd: 'netstat -an',                                desc: 'Aktive Ports und Verbindungen' },
    { os: 'windows', cat: 'System',    title: 'Systeminfo',          cmd: 'systeminfo',                                 desc: 'Hardware, OS und Patch-Level' },
    { os: 'windows', cat: 'System',    title: 'Windows-Version',     cmd: 'winver',                                     desc: 'Windows-Version anzeigen' },
    { os: 'windows', cat: 'System',    title: 'Laufende Prozesse',   cmd: 'tasklist',                                   desc: 'Alle laufenden Prozesse' },
    { os: 'windows', cat: 'System',    title: 'Prozess beenden',     cmd: 'taskkill /PID <PID> /F',                     desc: 'Prozess per PID beenden' },
    { os: 'windows', cat: 'System',    title: 'Festplatten',         cmd: 'diskpart → list disk',                       desc: 'Alle Datenträger auflisten' },
    { os: 'windows', cat: 'System',    title: 'Speicherplatz',       cmd: 'dir C:\\ /s',                                desc: 'Speicherbelegung C-Laufwerk' },
    { os: 'windows', cat: 'System',    title: 'BitLocker-Status',    cmd: 'manage-bde -status',                         desc: 'Verschlüsselungsstatus aller Laufwerke' },
    { os: 'windows', cat: 'Shortcuts', title: 'Task-Manager',        cmd: 'Ctrl+Shift+Esc',                             desc: 'Prozesse, CPU, RAM überwachen' },
    { os: 'windows', cat: 'Shortcuts', title: 'Ausführen',           cmd: 'Win+R',                                      desc: 'Programme, Pfade, Befehle starten' },
    { os: 'windows', cat: 'Shortcuts', title: 'Geräte-Manager',      cmd: 'Win+X → M',                                 desc: 'Hardware-Treiber verwalten' },
    { os: 'windows', cat: 'Shortcuts', title: 'Ereignisanzeige',     cmd: 'Win+R → eventvwr',                          desc: 'Windows Ereignisprotokoll' },
    { os: 'windows', cat: 'Shortcuts', title: 'Versteckte Dateien',  cmd: 'Explorer → Ansicht → Versteckte Elemente',  desc: 'Versteckte Dateien/Ordner anzeigen' },
  ];

  var osFilterEl = document.getElementById('wiki-os-filter');
  var initialOs = osFilterEl ? osFilterEl.value : 'all';
  renderWiki(wikiData, initialOs, '');

  document.getElementById('wiki-search')?.addEventListener('input', function(e) {
    var os = document.getElementById('wiki-os-filter')?.value || 'all';
    renderWiki(wikiData, os, e.target.value.trim().toLowerCase());
  });
  document.getElementById('wiki-os-filter')?.addEventListener('change', function(e) {
    var q = document.getElementById('wiki-search')?.value.trim().toLowerCase() || '';
    renderWiki(wikiData, e.target.value, q);
  });
}

function renderWiki(wikiData, osFilter, query) {
  var container = document.getElementById('wiki-content');
  if (!container) return;

  var data = wikiData.filter(function(item) {
    if (osFilter !== 'all' && item.os !== osFilter) return false;
    if (query) {
      var haystack = (item.title + ' ' + item.cmd + ' ' + item.desc + ' ' + item.cat).toLowerCase();
      return haystack.indexOf(query) !== -1;
    }
    return true;
  });

  if (data.length === 0) {
    container.innerHTML = '<div class="info-placeholder">Keine Einträge gefunden.</div>';
    return;
  }

  // Nach Kategorie gruppieren
  var groups = {};
  data.forEach(function(item) {
    var key = item.os + ':' + item.cat;
    if (!groups[key]) groups[key] = { os: item.os, cat: item.cat, items: [] };
    groups[key].items.push(item);
  });

  container.innerHTML = '';
  Object.values(groups).forEach(function(g) {
    var sec = document.createElement('div');
    sec.className = 'wiki-section';
    var osLabel = g.os === 'macos' ? '🍎 macOS' : '🪟 Windows';
    sec.innerHTML = '<h3 class="wiki-cat-title">' + osLabel + ' — ' + escapeHtml(g.cat) + '</h3>';
    var tbl = document.createElement('table');
    tbl.className = 'wiki-table';
    tbl.innerHTML = '<thead><tr><th>Aktion</th><th>Befehl / Kürzel</th><th>Beschreibung</th><th></th></tr></thead>';
    var tbody = document.createElement('tbody');
    g.items.forEach(function(item) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><strong>' + escapeHtml(item.title) + '</strong></td>' +
        '<td><code class="wiki-cmd">' + escapeHtml(item.cmd) + '</code></td>' +
        '<td class="wiki-desc">' + escapeHtml(item.desc) + '</td>' +
        '<td><button class="btn-action wiki-copy-btn" title="Kopieren" data-cmd="' + escapeHtml(item.cmd) + '">📋</button></td>';
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    sec.appendChild(tbl);
    container.appendChild(sec);
  });

  container.querySelectorAll('.wiki-copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      navigator.clipboard.writeText(btn.dataset.cmd).then(function() {
        btn.textContent = '✓';
        setTimeout(function() { btn.textContent = '📋'; }, 1500);
      }).catch(function() {});
    });
  });
}
