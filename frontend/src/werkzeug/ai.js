// KI-Hilfe (#126): Texte (Befehlsausgaben, Fehler, Ereignisse, Protokolle) von einer
// KI erklären bzw. zusammenfassen lassen. Vorher werden Kundendaten automatisch
// unkenntlich gemacht (#132).
// Standard sind Browser-Ziele wie in der Ereignisanzeige: Prompt + Text landen in
// der Zwischenablage, die Webseite (ChatGPT, Claude …) öffnet sich, dort nur noch
// einfügen. Lokale KI und API-Schlüssel bleiben als weitere Ziele wählbar.
import { esc, ic } from './ui.js';
import { md } from './markdown.js';
import { redact, DEFAULT_ON } from './redact.js';
import { GetAvailableAIProviders, CallAI, CallLocalAI } from '../../wailsjs/go/main/App';

// Gleiche Ziele wie die Auswahlleiste der Ereignisanzeige (main.js, AI_BROWSER_URLS)
export const BROWSER = {
  chatgpt: ['ChatGPT', 'https://chatgpt.com/'],
  claude: ['Claude.ai', 'https://claude.ai/'],
  mammouth: ['Mammouth AI', 'https://mammouth.ai/app/a/default'],
  perplexity: ['Perplexity', 'https://www.perplexity.ai/'],
  grok: ['Grok', 'https://grok.com/'],
};
const LOCAL = { ollama: ['Ollama (lokal)', 'http://localhost:11434', 'llama3.2'], lmstudio: ['LM Studio (lokal)', 'http://localhost:1234', 'local-model'] };
const DEFAULT_MODEL = { openai: 'gpt-4o', groq: 'llama-3.3-70b-versatile' };

export function buildPrompt(mode, kind, text) {
  if (mode === 'summary') return `Du schreibst für einen IT-Dienstleister. Erstelle aus dem folgenden Arbeitsprotokoll eine kurze, freundliche Zusammenfassung für den Kunden auf Deutsch (Sie-Form): Was war das Problem, was wurde gemacht, was ist das Ergebnis, was sollte der Kunde ggf. noch tun. Kein Fachjargon, keine Befehle, höchstens 12 Sätze. Platzhalter wie <IP-1> unverändert lassen.\n\n${text}`;
  return `Du bist erfahrener IT-Support-Techniker. Erkläre auf Deutsch knapp für einen Kollegen: 1) Was bedeutet das? 2) Wahrscheinliche Ursache(n) 3) Konkrete nächste Schritte (Windows/macOS beachten). Stichpunkte, keine Einleitung. Platzhalter wie <IP-1> sind anonymisierte Werte.\n\nArt: ${kind || 'Text'}\n\n${text}`;
}

// Ziele als Gruppen: [[Gruppe, [[id, Name], …]], …]
export async function aiTargets() {
  let api = [];
  try { api = ((await GetAvailableAIProviders()) || []).filter(p => p.has_key && !p.is_local).map(p => [p.id, p.name]); } catch (_) { /* ohne Backend */ }
  return [
    ['Browser (kein Schlüssel nötig)', Object.entries(BROWSER).map(([id, [n]]) => [id, n])],
    ['Lokal', Object.entries(LOCAL).map(([id, [n]]) => [id, n])],
    ...(api.length ? [['API (Schlüssel hinterlegt)', api]] : []),
  ];
}
export function targetOptions(groups, sel) {
  return groups.map(([g, L]) => `<optgroup label="${esc(g)}">${L.map(([id, n]) => `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`).join('');
}
export const lastTarget = ctx => ctx.state.get('aiHelp', {}).provider || 'chatgpt';
const pasteKey = ctx => ctx.os === 'macos' ? '⌘ + V' : 'Strg + V';

async function call(ctx, provider, prompt) {
  const models = ctx.config?.ai_models || {};
  if (LOCAL[provider]) { const [, url, def] = LOCAL[provider]; return CallLocalAI(url, models[provider] || def, prompt); }
  return CallAI(provider, models[provider] || DEFAULT_MODEL[provider] || '', prompt);
}

// Browser-Ziel: Prompt kopieren und Webseite öffnen
async function toBrowser(ctx, provider, prompt) {
  const [name, url] = BROWSER[provider];
  await ctx.copy(prompt, `Kopiert – in ${name} mit ${pasteKey(ctx)} einfügen`);
  ctx.open(url);
  ctx.addAction(`KI-Anfrage an ${name} vorbereitet (Zwischenablage)`, 'info');
}

// Direkt ohne Dialog (Auswahlleisten): Kundendaten werden automatisch ersetzt.
// Nur für Browser-Ziele; andere Ziele öffnen den Dialog.
export async function sendToAI(ctx, opts) {
  const provider = opts.provider || lastTarget(ctx);
  if (!BROWSER[provider]) return explainWithAI(ctx, Object.assign({}, opts, { provider }));
  const S = ctx.state.get('aiHelp', {});
  ctx.state.set('aiHelp', Object.assign({}, S, { provider }));
  const r = redact(opts.text, { rules: DEFAULT_ON, names: String(S.names || '').split(',') });
  await toBrowser(ctx, provider, buildPrompt(opts.mode, opts.kind, r.text.slice(0, 24000)));
  if (r.total) ctx.toast(`${r.total} Stellen unkenntlich gemacht · in ${BROWSER[provider][0]} mit ${pasteKey(ctx)} einfügen`);
}

// opts: { title, kind, text, mode: 'explain'|'summary', provider?, onResult(text) }
export async function explainWithAI(ctx, opts) {
  const groups = await aiTargets();
  const S = Object.assign({ names: '' }, ctx.state.get('aiHelp', {}));
  const sel = opts.provider || S.provider || 'chatgpt';
  const ov = document.createElement('div');
  ov.className = 'wz cap-ov';
  ov.innerHTML = `<div class="cap-box" role="dialog" aria-label="KI"><div class="cap-head"><b>${ic('chat')} ${esc(opts.title || 'Erklären lassen')}</b><span style="flex:1"></span><button class="icon-btn" type="button" data-aix="close" title="Schließen">${ic('x')}</button></div>
    <div class="cap-body"><div class="row"><label class="field"><span>KI-Ziel</span><select class="input" id="aiP">${targetOptions(groups, sel)}</select></label>
      <label class="field" style="flex:1"><span>Zusätzlich unkenntlich machen (Namen, Firmen), mit Komma</span><input class="input" id="aiN" value="${esc(S.names)}"></label></div>
      <label class="field"><span>Das wird gesendet – Kundendaten sind bereits ersetzt, bitte prüfen <em class="muted" id="aiCnt"></em></span><textarea class="input mono" id="aiT" rows="10" spellcheck="false"></textarea></label>
      <p class="note" id="aiNote"></p>
      <div class="row"><button class="btn primary" type="button" data-aix="send" id="aiGo"></button><button class="btn" type="button" data-aix="close">Abbrechen</button></div>
      <div id="aiOut" class="prose"></div></div></div>`;
  document.body.appendChild(ov);
  const ta = ov.querySelector('#aiT'), selEl = ov.querySelector('#aiP');
  const prep = () => { const r = redact(opts.text, { rules: DEFAULT_ON, names: ov.querySelector('#aiN').value.split(',') }); ta.value = r.text; ov.querySelector('#aiCnt').textContent = r.total ? `(${r.total} Stellen ersetzt)` : ''; };
  const label = () => {
    const p = selEl.value, b = BROWSER[p];
    ov.querySelector('#aiGo').innerHTML = b ? `${ic('copy')}Kopieren &amp; ${esc(b[0])} öffnen` : `${ic('chat')}Senden`;
    ov.querySelector('#aiNote').textContent = b ? `Anfrage und Text kommen in die Zwischenablage, ${b[0]} öffnet sich im Browser – dort nur noch ${pasteKey(ctx)} drücken und absenden.`
      : LOCAL[p] ? 'Lokale KI: Der Text bleibt im eigenen Netz. Modell in den Einstellungen.' : 'API: Der Text wird direkt an den Anbieter gesendet. Schlüssel und Modell in den Einstellungen.';
  };
  ov.querySelector('#aiN').addEventListener('input', prep); prep();
  selEl.addEventListener('change', label); label();
  ov.addEventListener('click', async e => {
    const x = e.target.closest('[data-aix]'); if (!x) return;
    if (x.dataset.aix === 'close') { ov.remove(); return; }
    if (x.dataset.aix === 'copy') { ctx.copy(x.dataset.text, 'Kopiert'); return; }
    if (x.dataset.aix === 'use') { const v = x.dataset.text ?? ov.querySelector('#aiAns')?.value ?? ''; if (v.trim()) opts.onResult?.(v.trim()); ov.remove(); return; }
    const provider = selEl.value, outEl = ov.querySelector('#aiOut');
    ctx.state.set('aiHelp', { provider, names: ov.querySelector('#aiN').value });
    const prompt = buildPrompt(opts.mode, opts.kind, ta.value.slice(0, 24000));
    if (BROWSER[provider]) {
      await toBrowser(ctx, provider, prompt);
      if (!opts.onResult) { ov.remove(); return; }
      // Antwort aus dem Browser zurückholen (z. B. Kundenzusammenfassung übernehmen)
      outEl.innerHTML = `<label class="field"><span>Antwort aus ${esc(BROWSER[provider][0])} hier einfügen</span><textarea class="input" id="aiAns" rows="6"></textarea></label><div class="row"><button class="btn sm primary" type="button" data-aix="use">${ic('check')}Übernehmen</button></div>`;
      return;
    }
    x.disabled = true; outEl.innerHTML = '<p class="muted">KI antwortet …</p>';
    try {
      const res = await call(ctx, provider, prompt);
      outEl.innerHTML = md(res) + `<div class="row"><button class="btn sm" type="button" data-aix="copy" data-text="${esc(res)}">${ic('copy')}Kopieren</button>${opts.onResult ? `<button class="btn sm primary" type="button" data-aix="use" data-text="${esc(res)}">${ic('check')}Übernehmen</button>` : ''}</div>`;
      ctx.addAction('KI-Antwort erhalten (' + provider + ')', 'info');
    } catch (err) { outEl.innerHTML = `<div class="chk warn"><div><strong>Keine Antwort</strong><div class="chk-b">${esc(err)}</div></div></div>`; }
    x.disabled = false;
  });
}
