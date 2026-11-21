// Plattform-Schicht für AdminKit: alles, was zwischen Browser-Portal und App
// verschieden ist, läuft über dieses ctx-Objekt. Werkzeuge prüfen Fähigkeiten
// (z. B. `if (ctx.net?.dns)`), nicht die Plattform.
import { GetToolStates, SaveToolState } from '../../wailsjs/go/main/App';
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

  const ctx = {
    platform: 'adminkit',
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
    net: {
      get online() { return deps.onlineAllowed('dns') || deps.onlineAllowed('link_services'); },
    },
  };
  return ctx;
}
