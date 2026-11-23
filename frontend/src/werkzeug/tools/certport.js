// Zertifikat & Port (#108): TLS-Zertifikat einer Webseite oder eines Mailservers
// prüfen (Ablauf, Aussteller, Namen, Kette) und testen, ob Ports erreichbar sind.
// Abfragen laufen über Go; Ziele im lokalen Netz brauchen keine Online-Freigabe.
import { $, esc, ic, chk, segHTML, onSeg } from '../ui.js';

export const CERT_PRESETS = [['Webseite', 443, 'tls'], ['IMAP', 993, 'tls'], ['SMTP SSL', 465, 'tls'], ['SMTP STARTTLS', 587, 'smtp'], ['POP3', 995, 'tls'], ['IMAP STARTTLS', 143, 'imap']];
export const PORT_PRESETS = [['Web', [80, 443]], ['Mail', [25, 465, 587, 993, 995, 143, 110]], ['Remotedesktop', [3389]], ['Dateifreigabe', [445]], ['SSH', [22]], ['Drucker', [9100, 631, 80, 443]], ['NAS', [5000, 5001, 445, 80, 443]]];
export const MODES = { auto: 'Automatisch (nach Port)', tls: 'Direkt TLS', smtp: 'SMTP mit STARTTLS', imap: 'IMAP mit STARTTLS', pop3: 'POP3 mit STARTTLS' };

// „https://www.x.de:8443/pfad“ → { host, port }
export function parseTarget(s, defPort) {
  let t = String(s || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/[/?#].*$/, '');
  let port = defPort;
  const m = t.match(/^\[([^\]]+)\](?::(\d+))?$/) || t.match(/^([^:]+):(\d+)$/);
  if (m) { t = m[1]; if (m[2]) port = +m[2]; }
  return { host: t.toLowerCase(), port };
}
export function parsePorts(s) {
  const out = [];
  for (const x of String(s || '').split(/[\s,;]+/)) { const n = parseInt(x, 10); if (n >= 1 && n <= 65535 && !out.includes(n)) out.push(n); }
  return out;
}
export function certVerdict(r) {
  if (r.error || !r.chain?.length) return ['err', 'Keine Prüfung möglich'];
  if (r.days_left < 0) return ['err', 'Zertifikat abgelaufen'];
  if (!r.hostname_ok) return ['err', 'Zertifikat passt nicht zum Namen'];
  if (!r.trusted) return ['err', 'Zertifikat nicht vertrauenswürdig'];
  if (r.days_left <= 14) return ['warn', `Läuft in ${r.days_left} Tagen ab`];
  if (/1\.[01]$/.test(r.tls_version || '')) return ['warn', 'Veraltete TLS-Version'];
  return ['ok', 'Zertifikat in Ordnung'];
}
const STATE = { open: ['ok', 'erreichbar'], closed: ['err', 'abgelehnt'], timeout: ['warn', 'keine Antwort'], error: ['err', 'Fehler'] };
const fmtD = d => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const S = { mode: 'cert', target: '', port: 443, tmode: 'auto', phost: '', ports: '443' };

export default {
  id: 'certport', name: 'Zertifikat & Port', group: 'Netzwerk & Mail', icon: 'lock', tags: ['Netzwerk', 'Zertifikat', 'Mail', 'Fehlersuche'],
  keys: 'zertifikat ssl tls https ablauf abgelaufen certificate port erreichbar firewall telnet offen geschlossen rdp 3389 smb 445 9100', online: true,
  render(p, ctx) {
    Object.assign(S, ctx.state.get('certport', {}), ctx.takePrefill('certport') || {});
    p.innerHTML = `<div class="util wide"><h3>Zertifikat & Port</h3><p>Zertifikat einer Webseite oder eines Mailservers prüfen bzw. testen, ob ein Dienst von diesem Rechner aus erreichbar ist. Nur Verbindungsaufbau, es werden keine Daten gesendet.</p>
      ${segHTML('cpm', [['cert', 'Zertifikat'], ['port', 'Ports']], S.mode)}<div id="cpBody"></div><div id="cpOut" aria-live="polite"></div></div>`;
    const body = $('#cpBody', p), out = $('#cpOut', p);
    const save = () => ctx.state.set('certport', { mode: S.mode, target: S.target, port: S.port, tmode: S.tmode, phost: S.phost, ports: S.ports });
    const draw = () => {
      out.innerHTML = '';
      body.innerHTML = S.mode === 'cert'
        ? `<form class="row cp-form" id="cpF"><label class="field" style="flex:1"><span>Adresse oder Server</span><input class="input mono" name="t" value="${esc(S.target)}" placeholder="kunde.de, mail.kunde.de, https://…:8443" spellcheck="false" required></label>
           <label class="field cp-port"><span>Port</span><input class="input mono" name="p" value="${esc(S.port)}" inputmode="numeric"></label>
           <label class="field"><span>Verbindung</span><select class="input" name="m">${Object.entries(MODES).map(([v, l]) => `<option value="${v}"${S.tmode === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
           <button class="btn primary">${ic('search')}Prüfen</button></form>
           <div class="lst-modes">${CERT_PRESETS.map(([l, pt, m]) => `<button type="button" class="lk-chip" data-cpp="${pt}" data-cpm="${m}">${l} ${pt}</button>`).join('')}</div>`
        : `<form class="row cp-form" id="cpF"><label class="field" style="flex:1"><span>Host oder IP</span><input class="input mono" name="h" value="${esc(S.phost)}" placeholder="192.168.178.20, server.kunde.de" spellcheck="false" required></label>
           <label class="field" style="flex:1"><span>Ports (max. 10)</span><input class="input mono" name="ps" value="${esc(S.ports)}" placeholder="443, 3389" spellcheck="false"></label>
           <button class="btn primary">${ic('search')}Testen</button></form>
           <div class="lst-modes">${PORT_PRESETS.map(([l, ps]) => `<button type="button" class="lk-chip" data-cpps="${ps.join(',')}">${l}</button>`).join('')}</div>`;
      $('#cpF', p).addEventListener('submit', e => { e.preventDefault(); run(new FormData(e.target)); });
    };
    const run = async fd => {
      if (S.mode === 'cert') {
        const t = parseTarget(fd.get('t'), parseInt(fd.get('p'), 10) || 443);
        S.target = String(fd.get('t')).trim(); S.port = t.port; S.tmode = String(fd.get('m')); save();
        if (!t.host) return;
        out.innerHTML = `<p class="muted">Verbinde mit ${esc(t.host)}:${t.port}…</p>`;
        let r; try { r = await ctx.net.cert(t.host, t.port, S.tmode); } catch (e) { out.innerHTML = chk('err', 'Prüfung nicht möglich', esc(e)); return; }
        const [st, title] = certVerdict(r), leaf = r.chain?.[0];
        out.innerHTML = `<div class="verdict ${st}"><div class="v-i">${ic(st === 'ok' ? 'check' : st === 'warn' ? 'alert' : 'x')}</div><div><span>${esc(t.host)}:${t.port}${r.mode !== 'tls' ? ' · ' + esc(r.mode.toUpperCase()) + ' STARTTLS' : ''}</span><h4>${esc(title)}</h4>
          <p>${r.error ? esc(r.error) : leaf ? `Gültig bis <b>${fmtD(leaf.not_after)}</b> (${r.days_left} Tage), ausgestellt von ${esc(leaf.issuer)}.` : ''}${r.verify_error ? ' ' + esc(r.verify_error) + '.' : ''}</p></div></div>
          ${leaf ? `<div class="sub"><h5>Details</h5><dl class="kv mc-kv"><dt>Ausgestellt für</dt><dd>${esc(leaf.subject)}</dd><dt>Gilt für Namen</dt><dd class="mono">${esc((leaf.dns_names || []).join(', ') || '–')}</dd>
            <dt>Gültig</dt><dd>${fmtD(leaf.not_before)} – ${fmtD(leaf.not_after)}</dd><dt>Verbindung</dt><dd>${esc(r.tls_version || '')} · ${esc(r.cipher || '')}</dd><dt>Schlüssel</dt><dd>${esc(leaf.key)} · ${esc(leaf.sig_alg)}</dd><dt>Antwortzeit</dt><dd>${r.millis} ms</dd></dl></div>
          <div class="sub"><h5>Zertifikatskette <small>${r.chain.length}</small></h5><ol class="cp-chain">${r.chain.map(c => `<li><b>${esc(c.subject)}</b><span>Aussteller: ${esc(c.issuer)} · bis ${fmtD(c.not_after)}${c.self_signed ? ' · selbst signiert' : ''}</span></li>`).join('')}</ol>
            ${!r.trusted && r.chain.length === 1 && !r.chain[0].self_signed ? '<p class="note">Nur ein Zertifikat geliefert: Der Server schickt das Zwischenzertifikat nicht mit. Browser gleichen das oft aus, Mailprogramme und Geräte nicht.</p>' : ''}</div>` : ''}`;
      } else {
        const ports = parsePorts(fd.get('ps')).slice(0, 10), host = parseTarget(fd.get('h')).host;
        S.phost = String(fd.get('h')).trim(); S.ports = ports.join(', '); save();
        if (!host || !ports.length) { ctx.toast('Host und mindestens einen Port angeben'); return; }
        out.innerHTML = `<p class="muted">Teste ${ports.length} Port${ports.length > 1 ? 's' : ''} auf ${esc(host)}…</p>`;
        let r; try { r = await ctx.net.ports(host, ports); } catch (e) { out.innerHTML = chk('err', 'Test nicht möglich', esc(e)); return; }
        out.innerHTML = `<div class="sub"><h5>${esc(host)}</h5><div class="chks">${r.map(x => { const [s, l] = STATE[x.state] || ['info', x.state]; return chk(s, `Port ${x.port}: ${l}`, `${x.error ? esc(x.error) : 'Verbindung aufgebaut'} · ${x.millis} ms`); }).join('')}</div>
          <p class="note"><b>Erreichbar:</b> Dienst nimmt Verbindungen an. <b>Abgelehnt:</b> Host antwortet, aber auf dem Port läuft nichts. <b>Keine Antwort:</b> Firewall filtert oder Host ist aus.</p></div>`;
      }
    };
    onSeg(p, 'cpm', v => { S.mode = v; save(); draw(); });
    p.addEventListener('click', e => {
      const c = e.target.closest('[data-cpp]'); if (c) { const f = $('#cpF', p); f.p.value = c.dataset.cpp; f.m.value = c.dataset.cpm; return; }
      const ps = e.target.closest('[data-cpps]'); if (ps) { $('#cpF', p).ps.value = ps.dataset.cpps.split(',').join(', '); }
    });
    draw();
  },
};
