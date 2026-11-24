// Mailkonto-Einstellungen (#107): Server, Ports, Verschlüsselung und Hinweise
// für gängige Anbieter. Adresse eingeben → Anbieter über die Domain oder (bei
// eigenen Domains) über den MX-Eintrag erkennen. Eigene Einträge (z. B. Hoster
// eines Kunden) liegen im Vault (Sammlung „mailkonten“) und haben Vorrang.
import { $, esc, ic } from '../ui.js';
import { mdInline } from '../markdown.js';
import { PROVIDERS, SEC, AUTH } from '../data/mailcfg.js';
import { parseCollection, emptyCollection, splitTags, uniqueId } from '../entries.js';

const KIND = 'mailkonten';
export const cleanDomain = s => String(s || '').trim().toLowerCase().replace(/^.*@/, '').replace(/^[a-z]+:\/\//, '').replace(/[\/?#:\s].*$/, '').replace(/\.$/, '');

export function byDomain(domain, list) { return domain ? list.filter(p => (p.domains || []).includes(domain)) : []; }
export function byMx(hosts, list) {
  const H = hosts.map(h => String(h).toLowerCase().replace(/\.$/, ''));
  return list.filter(p => (p.mx || []).some(m => H.some(h => h === m || h.endsWith('.' + m))));
}
export function byText(q, list) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(p => words.every(w => [p.name, (p.domains || []).join(' '), (p.mx || []).join(' '), (p.tags || []).join(' ')].join(' ').toLowerCase().includes(w)));
}
export const mxHosts = answers => (answers || []).filter(a => a.type === 15).map(a => String(a.data).split(/\s+/).pop().replace(/\.$/, '')).filter(h => h && h !== '.');

let coll = emptyCollection(), lastQ = '';

export default {
  id: 'mailcfg', name: 'Mailkonto-Einstellungen', group: 'Netzwerk & Mail', icon: 'mail', tags: ['Mail', 'Einrichtung', 'Outlook'],
  keys: 'imap pop pop3 smtp server port ssl tls starttls postausgang posteingang einrichten konto outlook thunderbird apple mail app-passwort',
  online: false,
  async render(p, ctx) {
    const pre = ctx.takePrefill('mailcfg');
    if (pre?.q) lastQ = pre.q;
    try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
    const all = () => coll.entries.map(e => Object.assign({ own: true }, e)).concat(PROVIDERS);
    p.innerHTML = `<div class="util wide"><h3>Mailkonto-Einstellungen</h3><p>E-Mail-Adresse oder Anbieter eingeben: Server, Ports, Verschlüsselung und worauf man achten muss. Eigene Domains werden über den MX-Eintrag dem Hoster zugeordnet (braucht die Freigabe für DNS-Abfragen).</p>
      <div class="row"><label class="field" style="flex:1"><span class="sr">Adresse oder Anbieter</span><input class="input" id="mcIn" value="${esc(lastQ)}" placeholder="z. B. kunde@t-online.de, info@kunden-firma.de oder „gmx“" spellcheck="false"></label>
      <button class="btn primary" type="button" id="mcGo">${ic('search')}Suchen</button><button class="btn" type="button" id="mcNew">${ic('plus')}Eigener Eintrag</button></div>
      <div id="mcForm"></div><div id="mcOut" aria-live="polite"></div><div id="mcList"></div></div>`;
    const inp = $('#mcIn', p), out = $('#mcOut', p), listEl = $('#mcList', p), form = $('#mcForm', p);

    const srv = (label, s) => s ? `<tr><th>${label}</th><td class="mono">${esc(s[0])}${/^\(/.test(s[0]) ? '' : ` <button class="icon-btn" type="button" data-copy="${esc(s[0])}" title="Kopieren">${ic('copy')}</button>`}</td><td class="mono">${esc(s[1])}</td><td>${esc(SEC[s[2]] || s[2] || '')}</td></tr>` : '';
    const card = (x, note = '') => `<div class="er-card mc-card${x.own ? ' er-own' : ''}"><div class="er-head"><b>${esc(x.name)}</b>${x.own ? '<span class="tag">eigener Eintrag</span>' : ''}${(x.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        ${x.own ? `<button class="icon-btn" type="button" data-mced="${esc(x.id)}" title="Bearbeiten">${ic('pencil')}</button>` : `<button class="icon-btn" type="button" data-mccopy="${esc(x.id)}" title="Als eigenen Eintrag übernehmen und anpassen">${ic('pencil')}</button>`}</div>
      ${note ? `<p class="muted">${note}</p>` : ''}
      <div class="table"><table class="mc-t"><thead><tr><th></th><th>Server</th><th>Port</th><th>Verschlüsselung</th></tr></thead><tbody>
        ${srv('Posteingang IMAP', x.imap)}${srv('Posteingang POP3', x.pop)}${(x.smtp || []).map((s, i) => srv(i ? 'oder' : 'Postausgang SMTP', s)).join('')}</tbody></table></div>
      <dl class="kv mc-kv"><dt>Benutzername</dt><dd>${esc(x.user || 'Vollständige E-Mail-Adresse')}</dd><dt>Anmeldung</dt><dd>${esc(AUTH[x.auth] || x.auth || AUTH.passwort)}</dd>
        ${(x.domains || []).length ? `<dt>Adressen</dt><dd>${x.domains.map(esc).join(', ')}</dd>` : ''}</dl>
      ${(x.hints || []).length ? `<div class="todo"><strong>Worauf achten?</strong><ul>${x.hints.map(h => `<li>${mdInline(h)}</li>`).join('')}</ul></div>` : ''}</div>`;

    const renderList = q => {
      const L = q ? byText(q, all()) : all();
      listEl.innerHTML = `<div class="sub"><h5>${q ? 'Passende Anbieter' : 'Alle Anbieter'} <small>${L.length}</small></h5>${L.map(x => `<details class="er-group"><summary>${esc(x.name)}${x.own ? ' <em>eigener Eintrag</em>' : ''} <em>${esc((x.domains || []).slice(0, 3).join(', '))}</em></summary>${card(x)}</details>`).join('') || '<p class="muted">Kein Anbieter passt.</p>'}</div>`;
    };

    let seq = 0;
    const run = async () => {
      lastQ = inp.value;
      const q = inp.value.trim(), my = ++seq;
      out.innerHTML = '';
      if (!q) { renderList(''); return; }
      const isAddr = /@|\.[a-z]{2,}$/i.test(q);
      if (!isAddr) { renderList(q); return; }
      const d = cleanDomain(q);
      const hit = byDomain(d, all());
      if (hit.length) { out.innerHTML = `<div class="sub"><h5>${esc(d)}</h5>${hit.map(x => card(x)).join('')}</div>`; listEl.innerHTML = ''; return; }
      if (!ctx.net?.dns || !ctx.net.allowed?.('dns')) {
        out.innerHTML = `<div class="chk info"><div><strong>${esc(d)} ist kein bekannter Anbieter</strong><div class="chk-b">Um den Hoster über den MX-Eintrag zu erkennen, DNS-Abfragen in den Einstellungen (Online-Funktionen) erlauben – oder einen eigenen Eintrag anlegen.</div></div></div>`;
        renderList(''); return;
      }
      out.innerHTML = `<p class="muted">Frage MX-Eintrag von ${esc(d)} ab…</p>`;
      let hosts = [];
      try { const j = await ctx.net.dns(d, 'MX'); hosts = mxHosts(j.Answer); } catch (e) { if (my === seq) out.innerHTML = `<div class="chk warn"><div><strong>DNS-Abfrage fehlgeschlagen</strong><div class="chk-b">${esc(e)}</div></div></div>`; return; }
      if (my !== seq) return;
      const mh = byMx(hosts, all());
      const mxNote = hosts.length ? `Erkannt über den MX-Eintrag: <span class="mono">${hosts.map(esc).join(', ')}</span>` : '';
      if (mh.length) { out.innerHTML = `<div class="sub"><h5>${esc(d)}</h5>${mh.map(x => card(x, mxNote)).join('')}</div>`; listEl.innerHTML = ''; return; }
      out.innerHTML = `<div class="sub"><h5>${esc(d)}</h5><div class="chk info"><div><strong>Hoster nicht erkannt</strong><div class="chk-b">${hosts.length ? `Mailserver (MX): <span class="mono">${hosts.map(esc).join(', ')}</span>. ` : 'Kein MX-Eintrag gefunden. '}
        Bei eigenen Servern (z. B. Plesk) ist der Servername oft <span class="mono">mail.${esc(d)}</span> oder der MX-Name – das bitte beim Hoster oder in der Serververwaltung prüfen.</div></div></div>
        <button class="btn sm" type="button" data-mcnewd="${esc(d)}" data-mx="${esc(hosts.join(','))}">${ic('plus')}Eigenen Eintrag für ${esc(d)} anlegen</button>
        ${ctx.hasTool('dns') ? `<button class="btn sm ghost" type="button" data-mcdns="${esc(d)}">${ic('globe')}Mail-Check für ${esc(d)}</button>` : ''}</div>`;
      renderList('');
    };

    const srvFields = (pfx, label, s, def) => `<fieldset class="mc-fs"><legend>${label}</legend><div class="mc-row"><input class="input mono" name="${pfx}h" value="${esc(s?.[0] || '')}" placeholder="${def[0]}" spellcheck="false">
      <input class="input mono" name="${pfx}p" value="${esc(s?.[1] || def[1])}" inputmode="numeric" aria-label="Port"><select class="input" name="${pfx}s">${Object.entries(SEC).map(([v, l]) => `<option value="${v}"${(s?.[2] || def[2]) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></fieldset>`;
    const showForm = (o, seed = {}) => {
      const x = o || Object.assign({ name: '', domains: [], mx: [], imap: null, pop: null, smtp: [], user: '', auth: 'passwort', hints: [], tags: [] }, seed);
      form.innerHTML = `<form class="panel lk-form" id="mcF"><strong>${o ? 'Eigenen Eintrag bearbeiten' : 'Eigener Eintrag'}</strong>
        <div class="lk-grid"><label class="field"><span>Name</span><input class="input" name="name" value="${esc(x.name)}" required maxlength="80" placeholder="z. B. Kunde Müller – Hoster XY"></label>
        <label class="field"><span>Adress-Domains, mit Komma getrennt</span><input class="input mono" name="domains" value="${esc((x.domains || []).join(', '))}" placeholder="kunde-firma.de"></label>
        <label class="field"><span>MX enthält (optional, für Erkennung eigener Domains)</span><input class="input mono" name="mx" value="${esc((x.mx || []).join(', '))}" placeholder="mailserver-des-hosters.de"></label>
        <label class="field"><span>Benutzername</span><input class="input" name="user" value="${esc(x.user || '')}" placeholder="Vollständige E-Mail-Adresse"></label>
        <label class="field"><span>Anmeldung</span><select class="input" name="auth">${Object.entries(AUTH).map(([v, l]) => `<option value="${v}"${x.auth === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Tags, mit Komma getrennt</span><input class="input" name="tags" value="${esc((x.tags || []).join(', '))}"></label></div>
        ${srvFields('i', 'Posteingang IMAP (leer = nicht angeboten)', x.imap, ['imap.example.de', 993, 'ssl'])}${srvFields('o', 'Posteingang POP3 (leer = nicht angeboten)', x.pop, ['pop.example.de', 995, 'ssl'])}
        ${srvFields('s', 'Postausgang SMTP', x.smtp?.[0], ['smtp.example.de', 587, 'starttls'])}${srvFields('t', 'Postausgang SMTP, Alternative (optional)', x.smtp?.[1], ['', 465, 'ssl'])}
        <label class="field"><span>Hinweise, eine Zeile pro Hinweis</span><textarea class="input" name="hints" rows="3">${esc((x.hints || []).join('\n'))}</textarea></label>
        <div class="row"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-mcx="cancel">Abbrechen</button>${o ? `<button class="btn lk-del" type="button" data-mcx="del" data-id="${esc(o.id)}">${ic('trash')}Löschen</button>` : ''}</div></form>`;
      const f = $('#mcF', form);
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const fd = new FormData(f), g = pf => { const h = String(fd.get(pf + 'h')).trim(); const port = parseInt(fd.get(pf + 'p'), 10); return h ? [h, port > 0 && port < 65536 ? port : '', String(fd.get(pf + 's'))] : null; };
        const list = s => String(s || '').split(',').map(v => cleanDomain(v)).filter(Boolean);
        const e = { name: String(fd.get('name')).trim(), domains: list(fd.get('domains')), mx: list(fd.get('mx')), user: String(fd.get('user')).trim(), auth: String(fd.get('auth')),
          imap: g('i'), pop: g('o'), smtp: [g('s'), g('t')].filter(Boolean), hints: String(fd.get('hints')).split('\n').map(s => s.trim()).filter(Boolean), tags: splitTags(fd.get('tags')) };
        if (!e.name) return;
        if (o) Object.assign(coll.entries.find(y => y.id === o.id), e);
        else coll.entries.push(Object.assign({ id: uniqueId(e.name, new Set(coll.entries.map(y => y.id))) }, e));
        try { await ctx.entries.save(KIND, coll); ctx.addAction('Mailkonto-Eintrag gespeichert: ' + e.name, 'success'); } catch (err) { ctx.toast('Speichern fehlgeschlagen: ' + err); return; }
        form.innerHTML = ''; if (!inp.value.trim() && e.domains[0]) inp.value = e.domains[0]; run();
      });
      f.querySelector('[name=name]').focus();
    };

    p.addEventListener('click', async ev => {
      const t = ev.target;
      const ed = t.closest('[data-mced]'); if (ed) { showForm(coll.entries.find(y => y.id === ed.dataset.mced)); p.closest('.wz-pane')?.scrollTo?.(0, 0); return; }
      const cp = t.closest('[data-mccopy]');
      if (cp) { const b = PROVIDERS.find(y => y.id === cp.dataset.mccopy); showForm(null, JSON.parse(JSON.stringify(Object.assign({}, b, { id: undefined, name: b.name + ' (angepasst)' })))); p.closest('.wz-pane')?.scrollTo?.(0, 0); return; }
      const nd = t.closest('[data-mcnewd]'); if (nd) { showForm(null, { domains: [nd.dataset.mcnewd], mx: nd.dataset.mx ? [nd.dataset.mx.split(',')[0]] : [] }); return; }
      const dn = t.closest('[data-mcdns]'); if (dn) { ctx.openTool('dns', { mode: 'mail', domain: dn.dataset.mcdns, auto: true }); return; }
      const x = t.closest('[data-mcx]'); if (!x) return;
      if (x.dataset.mcx === 'cancel') { form.innerHTML = ''; return; }
      const o = coll.entries.find(y => y.id === x.dataset.id);
      if (!await ctx.confirm({ title: `„${o.name}“ löschen?`, what: 'Der eigene Mailkonto-Eintrag wird aus dem Vault gelöscht.', impact: 'Die Angaben sind danach für alle, die diesen Vault nutzen, weg. Mitgelieferte Anbieter bleiben erhalten.' })) return;
      coll.entries = coll.entries.filter(y => y.id !== o.id);
      try { await ctx.entries.save(KIND, coll); ctx.addAction('Mailkonto-Eintrag gelöscht: ' + o.name, 'success'); } catch (err) { ctx.toast('Löschen fehlgeschlagen: ' + err); }
      form.innerHTML = ''; run();
    });
    let tm; inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 400); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(tm); run(); } });
    $('#mcGo', p).onclick = run;
    $('#mcNew', p).onclick = () => showForm(null, { domains: /@|\./.test(inp.value) ? [cleanDomain(inp.value)] : [] });
    run();
  },
};
