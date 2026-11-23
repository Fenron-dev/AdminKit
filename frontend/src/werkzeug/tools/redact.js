// Daten unkenntlich machen (#132): Logs/Texte vor dem Weitergeben bereinigen.
import { $, esc, ic } from '../ui.js';
import { RULES, DEFAULT_ON, redact } from '../redact.js';

let lastIn = '';
export default {
  id: 'redact', name: 'Daten unkenntlich machen', group: 'Sicherheit & Passwörter', icon: 'eye', tags: ['Datenschutz', 'Text', 'Logs'],
  keys: 'anonymisieren schwärzen unkenntlich datenschutz dsgvo log bereinigen email ip kennwort maskieren redact', online: false,
  render(p, ctx) {
    const S = Object.assign({ rules: DEFAULT_ON, names: '' }, ctx.state.get('redact', {}));
    p.innerHTML = `<div class="util wide"><h3>Daten unkenntlich machen</h3><p>Log, Fehlermeldung oder Mailtext einfügen: E-Mail-Adressen, IPs, Kennwörter, Benutzernamen usw. werden durch Platzhalter ersetzt – gleiche Werte bekommen denselben Platzhalter. Alles lokal, bevor etwas an Hersteller, Forum oder KI geht.</p>
      <div class="lst-checks">${RULES.map(([id, l]) => `<label class="check"><input type="checkbox" data-rr="${id}"${S.rules.includes(id) ? ' checked' : ''}>${l}</label>`).join('')}</div>
      <label class="field"><span>Eigene Begriffe (Namen, Firmen, Domains), mit Komma getrennt</span><input class="input" id="rdN" value="${esc(S.names)}" placeholder="Müller, Praxis Sonnenschein, kunde.de"></label>
      <div class="lst-grid"><label class="field"><span>Original</span><textarea class="input mono" id="rdIn" rows="12" spellcheck="false">${esc(lastIn)}</textarea></label>
        <label class="field"><span>Bereinigt <em class="muted" id="rdStat"></em></span><textarea class="input mono" id="rdOut" rows="12" readonly></textarea></label></div>
      <div class="row"><button class="btn primary" type="button" id="rdCopy">${ic('copy')}Bereinigt kopieren</button><button class="btn ghost" type="button" id="rdClr">Leeren</button></div>
      <p class="note">Automatik findet nicht alles: vor dem Weitergeben das Ergebnis lesen. Kundennamen am besten als eigene Begriffe eintragen.</p></div>`;
    const inp = $('#rdIn', p), out = $('#rdOut', p);
    const run = () => {
      lastIn = inp.value; S.names = $('#rdN', p).value; ctx.state.set('redact', S);
      const r = redact(inp.value, { rules: S.rules, names: S.names.split(',') });
      out.value = r.text; $('#rdStat', p).textContent = r.total ? `${r.total} Stellen ersetzt` : '';
    };
    p.addEventListener('change', e => { const id = e.target.dataset.rr; if (!id) return; S.rules = e.target.checked ? [...new Set([...S.rules, id])] : S.rules.filter(x => x !== id); run(); });
    inp.addEventListener('input', run); $('#rdN', p).addEventListener('input', run);
    $('#rdCopy', p).onclick = () => out.value && ctx.copy(out.value, 'Bereinigter Text kopiert');
    $('#rdClr', p).onclick = () => { inp.value = ''; run(); };
    run();
  },
};
