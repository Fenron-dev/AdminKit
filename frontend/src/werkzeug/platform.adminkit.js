// Plattform-Schicht für AdminKit: alles, was zwischen Browser-Portal und App
// verschieden ist, läuft über dieses ctx-Objekt. Werkzeuge prüfen Fähigkeiten
// (z. B. `if (ctx.net?.dns)`), nicht die Plattform.
import { OpenSystemApp, DNSQuery, GetResolverChoices, SMTPProbe, RDAPLookup, LinkPreview, URLScanSearch, SaveSessionNote, GetToolStates, SaveToolState, ExportDocument, RecordWork, GetSessionTiming, OpenTextFileDialog, SaveDataURL, PickFileForHash, HashFile, CancelHash, GetEntries, SaveEntries, GetDeviceIdentity, GetGateways, CertCheck, PortCheck, WakeOnLAN, ARPTable, ProbeDevice, OpenCommandTarget, RunCommand, IsElevated, GetPlatform } from '../../wailsjs/go/main/App';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';

// Ein gemeinsamer Kontext für Werkzeugkasten, Links und Befehlspalette
let shared = null;
export function getContext(deps) {
  if (!shared) shared = createContext(deps);
  return shared;
}

export async function createContext(deps) {
  let states = {};
  try { states = (await GetToolStates()) || {}; } catch (e) { console.warn('Werkzeug-Zustand nicht lesbar', e); }
  const timers = {};
  // Betriebssystem für Plattform-Varianten (windows | macos | linux)
  let os = /Mac/.test(navigator.platform || '') ? 'macos' : 'windows';
  try { const p = String(await GetPlatform()).trim(); os = p === 'darwin' ? 'macos' : p || os; } catch (_) { /* Vorgabe aus dem Browser */ }

  const ctx = {
    platform: 'adminkit',
    os,
    state: {
      // Synchron aus dem beim Start geladenen Stand
      get(key, def) { return Object.prototype.hasOwnProperty.call(states, key) ? states[key] : def; },
      // Speichern gebündelt (Schieberegler feuern sehr oft)
      set(key, val) {
        states[key] = val;
        clearTimeout(timers[key]);
        timers[key] = setTimeout(() => {
          SaveToolState(key, JSON.stringify(val ?? null)).catch(e => console.warn('Werkzeug-Zustand', key, e));
        }, 400);
      },
    },
    async copy(text, label = 'Kopiert') {
      try { await navigator.clipboard.writeText(text); }
      catch (_) {
        try { await window.runtime?.ClipboardSetText?.(text); }
        catch (__) { deps.showToast('Kopieren nicht möglich'); return; }
      }
      deps.showToast(label);
    },
    toast: msg => deps.showToast(msg),
    open(url) {
      if (!/^https?:\/\//i.test(url || '')) return;
      try { BrowserOpenURL(url); } catch (_) { window.open(url, '_blank', 'noopener'); }
    },
    confirm: opts => deps.showConfirm(opts),
    addAction: (t, k) => deps.addAction(t, k),
    get config() { return deps.getConfig() || {}; },
    get branding() { return (deps.getConfig() || {}).branding || {}; },
    get session() { const p = deps.getSessionPath(); return p ? { path: p } : null; },
    // Kundendokument mit Branding erzeugen (HTML im Standardbrowser → drucken / PDF)
    async print(kind, title, bodyHTML, opts = {}) {
      try {
        const path = await ExportDocument(kind, title, bodyHTML, !!opts.card, opts.workTitle || '', opts.workDetail || '');
        deps.addAction(`${title}: Dokument erzeugt`, 'success', { filePath: path });
        return path;
      } catch (e) { deps.showToast('Dokument konnte nicht erzeugt werden: ' + e); return null; }
    },
    async recordWork(title, detail) {
      try { await RecordWork(title, detail); deps.addAction(`Im Bericht vermerkt: ${title}`, 'success'); return true; }
      catch (e) { deps.showToast(String(e)); return false; }
    },
    sessionTiming: () => GetSessionTiming(),
    async saveDataURL(name, dataURL) {
      try { const p = await SaveDataURL(name, dataURL); if (p) deps.addAction('Gespeichert: ' + p, 'success', { filePath: p }); return p; }
      catch (e) { deps.showToast('Speichern fehlgeschlagen: ' + e); return null; }
    },
    files: {
      async openText(title, pattern) {
        try { return await OpenTextFileDialog(title, pattern || ''); } catch (e) { deps.showToast(String(e)); return null; }
      },
      pickForHash: () => PickFileForHash(),
      hash: path => HashFile(path),
      cancelHash: () => CancelHash(),
    },
    // Eigene Einträge (#105): Sammlungen im Vault (werkzeug/eintraege/<art>.json)
    entries: {
      load: kind => GetEntries(kind),
      save: (kind, obj) => SaveEntries(kind, JSON.stringify(obj)),
    },
    // Befehle-Starter (#110): Öffnen nur erlaubter Ziele, Ausführen mit Ausgabe
    cmd: {
      open: (target, args) => OpenCommandTarget(target, args || []),
      run: req => RunCommand(req),
      elevated: () => IsElevated(),
    },
    deviceIdentity: () => GetDeviceIdentity(),
    gateways: () => GetGateways(),
    systemScan: () => (deps.getSystemScan ? deps.getSystemScan() : null),
    async openSystemApp(kind) { try { await OpenSystemApp(kind); } catch (e) { deps.showToast(String(e)); } },
    // Werkzeug-Verknüpfungen (werden von index.js gesetzt)
    hasTool: () => false,
    openTool: () => {},
    _prefill: {},
    takePrefill(id) { const v = this._prefill[id]; delete this._prefill[id]; return v; },
    net: {
      get online() { return deps.onlineAllowed('dns') || deps.onlineAllowed('link_services'); },
      allowed: area => deps.onlineAllowed(area),
      dns: (name, type, server) => DNSQuery(name, type, server || 'system'),
      resolvers: () => GetResolverChoices(),
      smtp: (host, port) => SMTPProbe(host, port),
      cert: (host, port, mode) => CertCheck(host, port, mode || 'auto'),
      ports: (host, ports) => PortCheck(host, ports),
      arp: () => ARPTable(),
      probe: ip => ProbeDevice(ip),
      wol: (mac, bc, port) => WakeOnLAN(mac, bc || '', port || 9),
      rdap: domain => RDAPLookup(domain),
      preview: url => LinkPreview(url),
      urlscan: domain => URLScanSearch(domain),
      async saveNote(folder, name, md, workTitle) {
        try { return await SaveSessionNote(folder, name, md, workTitle || ''); }
        catch (e) { deps.showToast(String(e)); return null; }
      },
    },
  };
  return ctx;
}
