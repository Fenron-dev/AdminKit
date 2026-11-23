// KI-Hilfe (#126): Texte (Befehlsausgaben, Fehler, Ereignisse, Protokolle) von der
// konfigurierten KI erklären bzw. zusammenfassen lassen. Vorher werden Kundendaten
// automatisch unkenntlich gemacht (#132); der Nutzer sieht und bestätigt, was gesendet wird.
import { esc, ic } from './ui.js';
import { md } from './markdown.js';
import { redact, DEFAULT_ON } from './redact.js';
import { GetAvailableAIProviders, CallAI, CallLocalAI } from '../../wailsjs/go/main/App';

const LOCAL = { ollama: ['Ollama (lokal)', 'http://localhost:11434', 'llama3.2'], lmstudio: ['LM Studio (lokal)', 'http://localhost:1234', 'local-model'] };
const DEFAULT_MODEL = { openai: 'gpt-4o', groq: 'llama-3.3-70b-versatile' };

export function buildPrompt(mode, kind, text) {
  if (mode === 'summary') return `Du schreibst für einen IT-Dienstleister. Erstelle aus dem folgenden Arbeitsprotokoll eine kurze, freundliche Zusammenfassung für den Kunden auf Deutsch (Sie-Form): Was war das Problem, was wurde gemacht, was ist das Ergebnis, was sollte der Kunde ggf. noch tun. Kein Fachjargon, keine Befehle, höchstens 12 Sätze. Platzhalter wie <IP-1> unverändert lassen.\n\n${text}`;
  return `Du bist erfahrener IT-Support-Techniker. Erkläre auf Deutsch knapp für einen Kollegen: 1) Was bedeutet das? 2) Wahrscheinliche Ursache(n) 3) Konkrete nächste Schritte (Windows/macOS beachten). Stichpunkte, keine Einleitung. Platzhalter wie <IP-1> sind anonymisierte Werte.\n\nArt: ${kind || 'Text'}\n\n${text}`;
}

async function providers(ctx) {
  let list = [];
  try { list = ((await GetAvailableAIProviders()) || []).filter(p => p.has_key && !p.is_local).map(p => [p.id, p.name]); } catch (_) { /* ohne Backend */ }
  return list.concat(Object.entries(LOCAL).map(([id, [n]]) => [id, n]));
}
async function call(ctx, provider, prompt) {
  const models = ctx.config?.ai_models || {};
  if (LOCAL[provider]) { const [, url, def] = LOCAL[provider]; return CallLocalAI(url, models[provider] || def, prompt); }
  return CallAI(provider, models[provider] || DEFAULT_MODEL[provider] || '', prompt);
}

// opts: { title, kind, text, mode: 'explain'|'summary', onResult(text) }
export async function explainWithAI(ctx, opts) {
  const prov = await providers(ctx);
  const S = Object.assign({ provider: prov[0]?.[0] || 'ollama', names: '' }, ctx.state.get('aiHelp', {}));
  const ov = document.createElement('div');
  ov.className = 'wz cap-ov';
  ov.innerHTML = `<div class="cap-box" role="dialog" aria-label="KI"><div class="cap-head"><b>${ic('chat')} ${esc(opts.title || 'Erklären lassen')}</b><span style="flex:1"></span><button class="icon-btn" type="button" data-aix="close" title="Schließen">${ic('x')}</button></div>
    <div class="cap-body"><div class="row"><label class="field"><span>KI</span><select class="input" id="aiP">${prov.map(([id, n]) => `<option value="${id}"${id === S.provider ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="field" style="flex:1"><span>Zusätzlich unkenntlich machen (Namen, Firmen), mit Komma</span><input class="input" id="aiN" value="${esc(S.names)}"></label></div>
      <label class="field"><span>Das wird gesendet – Kundendaten sind bereits ersetzt, bitte prüfen <em class="muted" id="aiCnt"></em></span><textarea class="input mono" id="aiT" rows="10" spellcheck="false"></textarea></label>
      <p class="note">${prov.some(([id]) => !LOCAL[id]) ? 'Cloud-KI: Der Text verlässt diesen Rechner. ' : ''}Lokale KI (Ollama/LM Studio) bleibt im eigenen Netz. API-Schlüssel und Modelle stehen in den Einstellungen.</p>
      <div class="row"><button class="btn primary" type="button" data-aix="send">${ic('chat')}Senden</button><button class="btn" type="button" data-aix="close">Abbrechen</button></div>
      <div id="aiOut" class="prose"></div></div></div>`;
  document.body.appendChild(ov);
  const ta = ov.querySelector('#aiT');
  const prep = () => { const r = redact(opts.text, { rules: DEFAULT_ON, names: ov.querySelector('#aiN').value.split(',') }); ta.value = r.text; ov.querySelector('#aiCnt').textContent = r.total ? `(${r.total} Stellen ersetzt)` : ''; };
  ov.querySelector('#aiN').addEventListener('input', prep); prep();
  ov.addEventListener('click', async e => {
    const x = e.target.closest('[data-aix]'); if (!x) return;
    if (x.dataset.aix === 'close') { ov.remove(); return; }
    if (x.dataset.aix === 'copy') { ctx.copy(x.dataset.text, 'Kopiert'); return; }
    if (x.dataset.aix === 'use') { opts.onResult?.(x.dataset.text); ov.remove(); return; }
    const provider = ov.querySelector('#aiP').value, outEl = ov.querySelector('#aiOut');
    ctx.state.set('aiHelp', { provider, names: ov.querySelector('#aiN').value });
    x.disabled = true; outEl.innerHTML = '<p class="muted">KI antwortet …</p>';
    try {
      const res = await call(ctx, provider, buildPrompt(opts.mode, opts.kind, ta.value.slice(0, 24000)));
      outEl.innerHTML = md(res) + `<div class="row"><button class="btn sm" type="button" data-aix="copy" data-text="${esc(res)}">${ic('copy')}Kopieren</button>${opts.onResult ? `<button class="btn sm primary" type="button" data-aix="use" data-text="${esc(res)}">${ic('check')}Übernehmen</button>` : ''}</div>`;
      ctx.addAction('KI-Antwort erhalten (' + provider + ')', 'info');
    } catch (err) { outEl.innerHTML = `<div class="chk warn"><div><strong>Keine Antwort</strong><div class="chk-b">${esc(err)}</div></div></div>`; }
    x.disabled = false;
  });
}
