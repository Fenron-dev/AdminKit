/**
 * AdminKit – Frontend-Einstiegspunkt
 *
 * Alle Wails-Bindings werden über window.go.main.App.* aufgerufen.
 * Die Bindings werden von Wails beim Build automatisch generiert.
 */
import './style.css';
import { GetAppVersion, GetVaultPath, GetConfig, NewSession } from '../wailsjs/go/main/App';

// ─── Zustand ────────────────────────────────────────────────────────────────

const state = {
  theme: detectInitialTheme(),   // "light" | "dark"
  activeTab: 'dashboard',
  currentSession: null,
  actionLog: [],
};

// ─── Initialisierung ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  initTabs();
  initThemeToggle();
  initSessionModal();
  loadAppInfo();
});

// ─── Theme ──────────────────────────────────────────────────────────────────

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

// ─── Tab-Navigation ──────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
  state.activeTab = tabId;
}

// ─── App-Infos von Wails-Backend laden ───────────────────────────────────────

async function loadAppInfo() {
  try {
    const version = await GetAppVersion();
    const vaultPath = await GetVaultPath();
    const cfg = await GetConfig();

    setEl('app-version', `v${version}`);
    setEl('vault-label', shortenPath(vaultPath));
    setEl('status-vault', shortenPath(vaultPath));

    // Theme aus Konfiguration übernehmen (wenn nicht manuell überschrieben)
    if (cfg?.ui?.theme && !localStorage.getItem('adminkit-theme')) {
      if (cfg.ui.theme !== 'system') {
        state.theme = cfg.ui.theme;
        applyTheme(state.theme);
      }
    }

    setStatus('Bereit');
  } catch (err) {
    // Im Dev-Modus ohne Wails-Runtime graceful degradieren
    console.warn('Wails-Backend nicht verfügbar (Dev-Modus):', err);
    setEl('app-version', 'v1.0.0-dev');
    setEl('vault-label', './adminkit_vault');
    setStatus('Dev-Modus');
  }
}

// ─── Session-Modal ───────────────────────────────────────────────────────────

function initSessionModal() {
  const modal = document.getElementById('modal-session');
  const input = document.getElementById('session-name-input');

  // Session erstellen Button in der Titelleiste (Settings öffnet aktuell Session-Dialog)
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
    input?.focus();
  });

  document.getElementById('btn-session-cancel')?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

  document.getElementById('btn-session-create')?.addEventListener('click', () => {
    createSession(input?.value?.trim());
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createSession(input.value.trim());
    if (e.key === 'Escape') modal?.classList.add('hidden');
  });

  // Klick außerhalb schließt Modal
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

async function createSession(name) {
  if (!name) return;
  const modal = document.getElementById('modal-session');

  try {
    const sessionPath = await NewSession(name);
    state.currentSession = name;
    setEl('status-session', name);
    modal?.classList.add('hidden');
    addAction(`Session "${name}" erstellt`);
    setStatus(`Session: ${name}`);
  } catch (err) {
    console.error('Session konnte nicht erstellt werden:', err);
    // Im Dev-Modus simulieren
    state.currentSession = name;
    setEl('status-session', name);
    modal?.classList.add('hidden');
  }
}

// ─── Aktions-Log ─────────────────────────────────────────────────────────────

function addAction(text, type = 'info') {
  const entry = { text, type, time: new Date() };
  state.actionLog.unshift(entry);

  const list = document.getElementById('action-list');
  if (!list) return;

  // Placeholder entfernen
  list.querySelector('.empty-state')?.remove();

  const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✗' };
  const el = document.createElement('div');
  el.className = 'action-entry';
  el.innerHTML = `
    <span>${icons[type] ?? 'ℹ'}</span>
    <span>${escapeHtml(text)}</span>
    <span class="action-time">${formatTime(entry.time)}</span>
  `;
  list.prepend(el);
}

// ─── Statusleiste ─────────────────────────────────────────────────────────────

function setStatus(text) {
  setEl('status-text', text);
}

// ─── Hilfs-Funktionen ────────────────────────────────────────────────────────

function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/** Kürzt lange Pfade für die Anzeige: /sehr/langer/Pfad → …/Pfad */
function shortenPath(path) {
  if (!path || path.length < 40) return path ?? '–';
  const parts = path.replace(/\\/g, '/').split('/');
  return '…/' + parts.slice(-2).join('/');
}

function formatTime(date) {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
