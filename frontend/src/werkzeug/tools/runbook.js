// Abläufe (#119): Wiki-Artikel als Aufgabe durchgehen – Schritte abhaken, Befehle
// ausführen (Ausgabe wird angehängt), Notizen, Bildschirmfotos, Videos, Dateien.
// Jeder Durchlauf ist sofort ein Protokoll-Artikel (Kategorie „Protokolle“), der
// laufend gespeichert wird; der Zwischenstand liegt in der Sammlung „ablaeufe“.
import { $, esc, ic } from '../ui.js';
import { md, setImages, setMediaBase } from '../markdown.js';
import { parseSteps, buildProtocol, clipOutput } from '../runbook-util.js';
import { parseCollection, emptyCollection, PLATFORMS, platName } from '../entries.js';
import { ListWikiArticles, GetWikiArticle, SaveWikiArticle } from '../../../wailsjs/go/main/App';

const KIND = 'ablaeufe', PROTO_CAT = 'Protokolle';
let coll = emptyCollection(), run = null, tpl = null, protoImgs = {}, saveTm = 0, listener = null;

const progress = r => `${r.steps.filter(s => s.done).length}/${r.steps.length}`;
const openWiki = slug => document.dispatchEvent(new CustomEvent('adminkit:open-wiki', { detail: { slug } }));
const openProto = slug => document.dispatchEvent(new CustomEvent('adminkit:open-protokoll', { detail: { slug } }));

export default {
  id: 'runbook', name: 'Abläufe', group: 'Windows & macOS', icon: 'clipboard', tags: ['Anleitung', 'Checkliste', 'Protokoll', 'Dokumentation'],
  keys: 'ablauf abläufe runbook checkliste anleitung durchgehen protokoll aufgabe schritte vorlage dokumentation einrichtung',
  online: false,
  async render(p, ctx) {
    try { coll = parseCollection(await ctx.entries.load(KIND)); } catch (_) { coll = emptyCollection(); }
    const pre = ctx.takePrefill('runbook') || {};
    let active = 0;
    const persist = (immediate) => {
      clearTimeout(saveTm);
      const go = async () => {
        if (!run) return;
        const i = coll.entries.findIndex(x => x.id === run.id);
        if (run.finished) { if (i >= 0) coll.entries.splice(i, 1); } else if (i >= 0) coll.entries[i] = run; else coll.entries.push(run);
        try {
          await ctx.entries.save(KIND, coll);
          await SaveWikiArticle({ slug: run.id, titel: run.title, kategorie: PROTO_CAT, tags: ['Protokoll'].concat(run.customer ? [run.customer] : []), body: buildProtocol(run) });
        } catch (e) { ctx.toast('Ablauf konnte nicht gespeichert werden: ' + e); }
      };
      if (immediate) return go();
      saveTm = setTimeout(go, 800);
    };

    // ── Übersicht ──
    const home = async () => {
      run = null; tpl = null;
      let arts = [];
      try { arts = (await ListWikiArticles()) || []; } catch (_) { /* ohne Vault */ }
      const open = coll.entries.filter(r => !r.finished);
      p.innerHTML = `<div class="util wide"><h3>Abläufe</h3><p>Einen Wiki-Artikel als Aufgabe durchgehen: Schritte abhaken, Befehle direkt ausführen, Notizen, Bildschirmfotos und Videos festhalten. Daraus entsteht automatisch ein Protokoll im Tab „📋 Protokolle“.</p>
        ${open.length ? `<div class="sub"><h5>Laufende Abläufe <small>${open.length}</small></h5>${open.map(r => `<div class="wz-hrow">${ic('clipboard')}<span><b>${esc(r.title)}</b> <span class="muted">${progress(r)} · ${esc(new Date(r.started).toLocaleDateString('de-DE'))}${r.customer ? ' · ' + esc(r.customer) : ''}</span></span>
          <button class="btn sm primary" type="button" data-rbres="${esc(r.id)}">Fortsetzen</button><button class="icon-btn" type="button" data-rbdis="${esc(r.id)}" title="Verwerfen">${ic('trash')}</button></div>`).join('')}</div>` : ''}
        <div class="sub"><h5>Neuen Ablauf starten</h5><input class="input" id="rbQ" type="search" placeholder="Vorlage suchen (alle Wiki-Artikel)"><div id="rbList" class="rb-tpls"></div>
          <p class="note">Schritte sind die <span class="mono">##</span>-Abschnitte eines Artikels, ohne Überschriften die Checklisten-Punkte (<span class="mono">- [ ]</span>). Tipp: Vorlagen-Artikel mit dem Schlagwort „Vorlage“ erscheinen oben.</p></div></div>`;
      const tpls = arts.filter(a => a.kategorie !== PROTO_CAT).sort((a, b) => ((b.tags || []).includes('Vorlage') - (a.tags || []).includes('Vorlage')) || a.titel.localeCompare(b.titel, 'de'));
      const draw = q => { const w = q.toLowerCase().split(/\s+/).filter(Boolean); const L = tpls.filter(a => w.every(x => [a.titel, a.kategorie, (a.tags || []).join(' ')].join(' ').toLowerCase().includes(x)));
        $('#rbList', p).innerHTML = L.map(a => `<button type="button" class="rb-tpl" data-rbstart="${esc(a.slug)}"><b>${esc(a.titel)}</b><span>${esc(a.kategorie)}${(a.tags || []).length ? ' · ' + esc(a.tags.join(', ')) : ''}</span></button>`).join('') || '<p class="muted">Keine Artikel gefunden.</p>'; };
      $('#rbQ', p).addEventListener('input', e => draw(e.target.value)); draw('');
    };

    // ── Start: Kunde/System abfragen ──
    const prepare = async slug => {
      try { tpl = await GetWikiArticle(slug); } catch (e) { ctx.toast('Vorlage nicht gefunden'); return home(); }
      const parsed = parseSteps(tpl.body);
      p.innerHTML = `<div class="util wide"><h3>Ablauf starten: ${esc(tpl.titel)}</h3><p>${parsed.steps.length} Schritte: ${parsed.steps.slice(0, 6).map(s => esc(s.title)).join(' · ')}${parsed.steps.length > 6 ? ' …' : ''}</p>
        <form class="panel lk-form" id="rbF"><div class="lk-grid"><label class="field"><span>Kunde / Gerät / Ticket (optional)</span><input class="input" name="customer" maxlength="80" value="${esc(ctx.session ? '' : '')}"></label>
          <label class="field"><span>System</span><select class="input" name="os">${PLATFORMS.map(([v, l]) => `<option value="${v}"${v === ctx.os ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <div class="row"><button class="btn primary" type="submit">${ic('play')}Starten</button><button class="btn" type="button" data-rbx="home">Abbrechen</button></div></form></div>`;
      $('#rbF', p).addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target), customer = String(fd.get('customer')).trim(), started = Date.now();
        const title = `Protokoll: ${tpl.titel}${customer ? ' – ' + customer : ''} (${new Date(started).toLocaleDateString('de-DE')})`;
        const r = { title, template: tpl.slug, templateTitle: tpl.titel, customer, os: String(fd.get('os')), started, finished: 0, notes: '', intro: parsed.intro,
          steps: parsed.steps.map(s => ({ title: s.title, body: s.body, done: false, notes: '', media: [], outputs: [] })) };
        try { r.id = await SaveWikiArticle({ slug: '', titel: title, kategorie: PROTO_CAT, tags: ['Protokoll'].concat(customer ? [customer] : []), body: buildProtocol(r) }); }
        catch (err) { ctx.toast('Protokoll konnte nicht angelegt werden: ' + err); return; }
        run = r; protoImgs = {}; active = 0; await persist(true);
        ctx.addAction('Ablauf gestartet: ' + tpl.titel, 'info');
        view();
      });
    };

    const resume = async id => {
      run = coll.entries.find(r => r.id === id);
      if (!run) return home();
      try { tpl = await GetWikiArticle(run.template); } catch (_) { tpl = { images: {} }; }
      try { protoImgs = (await GetWikiArticle(run.id)).images || {}; } catch (_) { protoImgs = {}; }
      active = Math.max(0, run.steps.findIndex(s => !s.done));
      view();
    };

    // ── Durchlauf ──
    const renderTpl = s => { setImages(tpl?.images || {}); setMediaBase(run.template); return md(s); };
    const renderProto = s => { setImages(protoImgs); setMediaBase(run.id); return md(s); };
    const stepHTML = (s, i, active) => `<div class="rb-step${s.done ? ' done' : ''}${active ? ' active' : ''}" data-step="${i}">
      <div class="rb-sh"><label class="rb-cb"><input type="checkbox" data-rbdone="${i}"${s.done ? ' checked' : ''}><span>${i + 1}. ${esc(s.title)}</span></label>
        ${s.outputs.length || s.media.length || s.notes ? `<span class="muted rb-cnt">${[s.notes && 'Notiz', s.media.length && s.media.length + ' Medien', s.outputs.length && s.outputs.length + ' Ausgaben'].filter(Boolean).join(' · ')}</span>` : ''}
        <button class="icon-btn" type="button" data-rbtog="${i}" title="Auf-/zuklappen">${ic(active ? 'arrowleft' : 'list')}</button></div>
      ${active ? `<div class="rb-sb"><div class="prose os-only-${esc(run.os)}">${s.body ? renderTpl(s.body) : '<p class="muted">Kein weiterer Text in der Vorlage.</p>'}</div>
        <label class="field"><span>Notiz zu diesem Schritt (Markdown)</span><textarea class="input" rows="3" data-rbnote="${i}" placeholder="Was wurde gemacht, Besonderheiten, Werte …">${esc(s.notes)}</textarea></label>
        ${s.media.length ? `<div class="rb-media">${s.media.map((m, k) => `<div class="rb-mi"><div class="prose">${renderProto(m)}</div><button class="icon-btn" type="button" data-rbmdel="${i}:${k}" title="Entfernen">${ic('x')}</button></div>`).join('')}</div>` : ''}
        ${s.outputs.length ? `<details class="rb-outs"><summary>${s.outputs.length} Befehlsausgabe${s.outputs.length > 1 ? 'n' : ''}</summary>${s.outputs.map(o => `<div class="rb-out"><b>${esc(o.name)}</b> <span class="mono muted">${esc(o.command)}</span>${(o.evals || []).map(e => `<div class="cm-ev ${e.level}"><div><b>${esc(e.title)}</b></div></div>`).join('')}${o.output ? `<pre class="srv">${esc(o.output)}</pre>` : ''}</div>`).join('')}</details>` : ''}
        <div class="row"><button class="btn sm" type="button" data-rbcap="shot">${ic('image')}Bildschirmfoto</button><button class="btn sm" type="button" data-rbcap="video">${ic('video')}Video</button><button class="btn sm" type="button" data-rbfile="${i}">${ic('upload')}Datei</button>
          ${!s.done ? `<button class="btn sm primary" type="button" data-rbnext="${i}" style="margin-left:auto">${ic('check')}Erledigt, weiter</button>` : ''}</div></div>` : ''}</div>`;
    const view = () => {
      if (!run) return home();
      if (active >= run.steps.length) active = Math.max(0, run.steps.findIndex(s => !s.done));
      const pct = Math.round(run.steps.filter(s => s.done).length / run.steps.length * 100);
      p.innerHTML = `<div class="util wide rb-run"><div class="rb-head"><div><h3>${esc(run.templateTitle)}</h3><p class="muted">${run.customer ? esc(run.customer) + ' · ' : ''}${esc(platName(run.os))} · begonnen ${esc(new Date(run.started).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</p></div>
          <div class="row"><button class="btn sm ghost" type="button" data-rbx="proto">${ic('book')}Protokoll</button><button class="btn sm ghost" type="button" data-rbx="home">Übersicht</button><button class="btn sm primary" type="button" data-rbx="finish">${ic('check')}Abschließen</button></div></div>
        <div class="rb-prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span><em>${progress(run)} erledigt</em></div>
        ${run.intro ? `<details class="rb-intro"><summary>Einleitung der Vorlage</summary><div class="prose">${renderTpl(run.intro)}</div></details>` : ''}
        <div class="rb-steps">${run.steps.map((s, i) => stepHTML(s, i, i === active)).join('')}</div>
        <label class="field"><span>Allgemeine Notizen zum Ablauf</span><textarea class="input" rows="2" data-rbgnote>${esc(run.notes)}</textarea></label></div>`;
    };

    const finish = async () => {
      const open = run.steps.filter(s => !s.done).length;
      p.querySelector('.rb-run').insertAdjacentHTML('beforeend', `<form class="panel lk-form" id="rbEnd"><strong>Ablauf abschließen</strong>
        ${open ? `<p class="muted">${open} Schritt${open > 1 ? 'e sind' : ' ist'} noch offen und wird im Protokoll als offen vermerkt.</p>` : ''}
        ${ctx.session ? '<label class="check"><input type="checkbox" name="work" checked>Im Sitzungsbericht vermerken</label>' : ''}
        <label class="check"><input type="checkbox" name="print">Protokoll für den Kunden erzeugen (drucken / PDF)</label>
        <button class="btn sm ghost" type="button" data-rbx="aisum">${ic('chat')}Kundenzusammenfassung mit KI erstellen</button>
        <div class="row"><button class="btn primary" type="submit">${ic('check')}Abschließen</button><button class="btn" type="button" data-rbx="endcancel">Zurück</button></div></form>`);
      $('#rbEnd', p).scrollIntoView({ behavior: 'smooth' });
      $('#rbEnd', p).addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        run.finished = Date.now();
        await persist(true);
        const done = run.steps.filter(s => s.done).length;
        if (fd.get('work')) await ctx.recordWork(`Ablauf: ${run.templateTitle}`, `${done} von ${run.steps.length} Schritten${run.customer ? ', ' + run.customer : ''}`);
        if (fd.get('print')) ctx.print('protokoll', run.title, renderProto(buildProtocol(run)), { workTitle: '', workDetail: '' });
        ctx.addAction('Ablauf abgeschlossen: ' + run.templateTitle, 'success');
        const id = run.id; run = null;
        p.innerHTML = `<div class="util wide"><h3>Ablauf abgeschlossen</h3><p>Das Protokoll liegt im Tab „📋 Protokolle“.</p><div class="row"><button class="btn primary" type="button" data-rbopen="${esc(id)}">${ic('book')}Protokoll öffnen</button><button class="btn" type="button" data-rbx="home">Zur Übersicht</button></div></div>`;
      });
    };

    // Ausgaben von Befehlsknöpfen dem Schritt zuordnen
    if (listener) document.removeEventListener('adminkit:cmdresult', listener);
    listener = e => {
      if (!run || !p.isConnected) return;
      const stepEl = e.detail.source?.closest?.('[data-step]');
      if (!stepEl || !p.contains(stepEl)) return;
      const s = run.steps[+stepEl.dataset.step];
      s.outputs.push({ name: e.detail.name, command: e.detail.command, output: clipOutput(e.detail.result.output), evals: (e.detail.evals || []).map(x => ({ level: x.level, title: x.title, text: x.text || '' })) });
      persist();
      const cnt = stepEl.querySelector('.rb-cnt'); if (cnt) cnt.textContent = `${s.outputs.length} Ausgaben`;
    };
    document.addEventListener('adminkit:cmdresult', listener);

    p.addEventListener('input', e => {
      if (!run) return;
      const n = e.target.closest('[data-rbnote]'); if (n) { run.steps[+n.dataset.rbnote].notes = n.value; persist(); return; }
      if (e.target.matches('[data-rbgnote]')) { run.notes = e.target.value; persist(); }
    });
    p.addEventListener('change', e => {
      const d = e.target.closest('[data-rbdone]'); if (!d || !run) return;
      const s = run.steps[+d.dataset.rbdone]; s.done = d.checked; s.doneAt = d.checked ? Date.now() : 0; persist(); view();
    });
    p.addEventListener('click', async e => {
      const t = e.target;
      const act = t.closest('.wk-act'); if (act) { const m = await import('./commands.js'); m.runActionButton(ctx, act, `Ablauf „${run?.templateTitle || ''}“`); return; }
      const cpm = t.closest('[data-copy-md]'); if (cpm) { ctx.copy(cpm.dataset.copyMd, 'Konsolenblock kopiert'); return; }
      const emb = t.closest('.md-embed button'); if (emb) { const box = emb.closest('.md-embed'); box.innerHTML = `<iframe src="${esc(box.dataset.embed)}" title="Video" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`; box.classList.add('on'); return; }
      const lo = t.closest('a[data-open]'); if (lo) { e.preventDefault(); ctx.open(lo.dataset.open); return; }
      const wl = t.closest('a[data-wiki]'); if (wl) { e.preventDefault(); openWiki(wl.dataset.wiki); return; }
      const st = t.closest('[data-rbstart]'); if (st) return prepare(st.dataset.rbstart);
      const rs = t.closest('[data-rbres]'); if (rs) return resume(rs.dataset.rbres);
      const op = t.closest('[data-rbopen]'); if (op) return openProto(op.dataset.rbopen);
      const ds = t.closest('[data-rbdis]');
      if (ds) {
        const r = coll.entries.find(x => x.id === ds.dataset.rbdis);
        if (!await ctx.confirm({ title: `Ablauf „${r.templateTitle}“ verwerfen?`, what: 'Der Zwischenstand wird gelöscht.', impact: 'Das bisherige Protokoll bleibt im Tab „Protokolle“ erhalten und kann dort gelöscht werden.' })) return;
        coll.entries = coll.entries.filter(x => x.id !== r.id);
        try { await ctx.entries.save(KIND, coll); } catch (err) { ctx.toast(String(err)); }
        return home();
      }
      if (!run) { const x = t.closest('[data-rbx]'); if (x?.dataset.rbx === 'home') home(); return; }
      const tg = t.closest('[data-rbtog]'); if (tg) { active = active === +tg.dataset.rbtog ? -1 : +tg.dataset.rbtog; view(); return; }
      const nx = t.closest('[data-rbnext]');
      if (nx) { const i = +nx.dataset.rbnext, s = run.steps[i]; s.done = true; s.doneAt = Date.now(); persist(); const n = run.steps.findIndex((x, k) => k > i && !x.done); active = n >= 0 ? n : -1; view(); p.querySelector('.rb-step.active')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const md_ = t.closest('[data-rbmdel]'); if (md_) { const [i, k] = md_.dataset.rbmdel.split(':').map(Number); run.steps[i].media.splice(k, 1); persist(); view(); return; }
      const cap = t.closest('[data-rbcap]');
      if (cap) {
        const i = active, { openCapture } = await import('../recorder.js');
        openCapture(ctx, { slug: run.id, mode: cap.dataset.rbcap, onInsert: r => { if (r.data) protoImgs[r.rel] = r.data; run.steps[i].media.push(r.md); persist(); view(); } });
        return;
      }
      const fl = t.closest('[data-rbfile]');
      if (fl) { const { pickMedia } = await import('../media.js'); try { const rel = await pickMedia(run.id); if (rel) { run.steps[+fl.dataset.rbfile].media.push(`![[${rel.split('/').pop()}]]`); persist(); view(); } } catch (err) { ctx.toast(String(err)); } return; }
      const x = t.closest('[data-rbx]'); if (!x) return;
      if (x.dataset.rbx === 'home') { await persist(true); home(); }
      else if (x.dataset.rbx === 'proto') { await persist(true); openProto(run.id); }
      else if (x.dataset.rbx === 'finish') finish();
      else if (x.dataset.rbx === 'endcancel') $('#rbEnd', p)?.remove();
      else if (x.dataset.rbx === 'aisum') { const { explainWithAI } = await import('../ai.js'); explainWithAI(ctx, { title: 'Kundenzusammenfassung', mode: 'summary', text: buildProtocol(run), onResult: t => { run.notes = (run.notes ? run.notes + '\n\n' : '') + '**Zusammenfassung für den Kunden**\n\n' + t; persist(); ctx.toast('Zusammenfassung in die allgemeinen Notizen übernommen'); } }); }
    });

    if (pre.start) prepare(pre.start);
    else if (pre.resume) resume(pre.resume);
    else home();
    return () => { if (listener) { document.removeEventListener('adminkit:cmdresult', listener); listener = null; } if (run) persist(true); };
  },
};
