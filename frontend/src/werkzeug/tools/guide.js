// Kunden-Ratgeber – aus dem Ideler-Portal übernommen. Neu in AdminKit:
// Branding (Logo, Firma, Techniker) und Kundenname aus der Session, Dokument
// landet in <Session>/exports und wird im Bericht vermerkt.
import { $, esc, ic, segHTML, onSeg } from '../ui.js';
import { GUIDE } from '../data/guide.js';

export const gStrip = s => s.replace(/\*\*(.+?)\*\*/g, '$1');
export function gInline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])|([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})/gi,
    (m, u, mail) => u ? `<a href="${u}" style="color:#0B6E8C">${u}</a>` : `<a href="mailto:${mail}" style="color:#0B6E8C">${mail}</a>`);
}

// forDoc: im AdminKit-Dokument steht die Firma bereits im Branding-Kopf
export function guideHTML(G, forDoc = false) {
  const F = 'font-family:Arial,Helvetica,sans-serif;color:#13202E;', H2 = 'font-size:19px;margin:26px 0 8px;color:#0A1626;border-bottom:2px solid #FFB547;padding-bottom:4px;', P = 'font-size:14.5px;line-height:1.55;margin:0 0 10px;', LI = 'font-size:14.5px;line-height:1.55;margin:0 0 6px;';
  const mon = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const secs = GUIDE.filter(g => G.sel.includes(g.id)).map(g => {
    let h = `<div class="g-sec"><h2 style="${H2}">${esc(g.t)}</h2>`;
    if (g.intro) h += `<p style="${P}">${gInline(g.intro)}</p>`;
    if (g.tips) h += `<ul style="margin:0 0 10px;padding-left:20px">${g.tips.map(t => `<li style="${LI}">${gInline(t)}</li>`).join('')}</ul>`;
    if (g.steps) h += `<ol style="margin:0 0 10px;padding-left:22px">${g.steps.map(t => `<li style="${LI}">${gInline(t)}</li>`).join('')}</ol>`;
    if (g.extra && G.long) h += `<div style="background:#FFF6E6;border-left:4px solid #FFB547;padding:10px 14px;margin:8px 0 12px"><p style="${P}font-weight:bold">${esc(g.extra.t)}</p><ul style="margin:0;padding-left:20px">${g.extra.items.map(t => `<li style="${LI}">${gInline(t)}</li>`).join('')}</ul></div>`;
    if (g.faq && G.long) h += g.faq.map(([q, a]) => `<p style="${P}"><b>${esc(q)}</b><br>${gInline(a)}</p>`).join('');
    return h + '</div>';
  }).join('');
  const contact = [G.person, G.phone && ('Telefon ' + G.phone), G.mail, G.web].filter(Boolean).map(esc).join('<br>');
  return `<div style="${F}">
    <div style="${forDoc ? '' : 'border-bottom:1px solid #D5DEE8;'}padding-bottom:12px;margin-bottom:8px">${forDoc ? '' : `<div style="font-size:12.5px;color:#5A6B7D">${esc(G.firm)}${G.place ? ', ' + esc(G.place) : ''}</div>`}
      <h1 style="font-size:26px;margin:4px 0 2px;color:#0A1626">${esc(G.title)}</h1><div style="font-size:15px;color:#3C4E62">${esc(G.sub)}, Stand ${mon}</div></div>
    ${G.note ? `<p style="${P}white-space:pre-line;margin-top:14px">${esc(G.note)}</p>` : ''}
    ${secs}
    <div class="g-sec" style="margin-top:26px;padding:14px 16px;background:#EEF6F8;border-radius:8px"><p style="${P}margin:0"><b>Fragen oder ein Notfall? Wir helfen gern.</b><br>${esc(G.firm)}${contact ? '<br>' + contact : ''}</p></div></div>`;
}

export function guideText(G) {
  const out = [G.title.toUpperCase(), G.sub, '']; if (G.note) out.push(G.note, '');
  GUIDE.filter(g => G.sel.includes(g.id)).forEach(g => {
    out.push(g.t, '-'.repeat(Math.min(60, g.t.length))); if (g.intro) out.push(gStrip(g.intro));
    if (g.tips) g.tips.forEach(t => out.push('• ' + gStrip(t)));
    if (g.steps) g.steps.forEach((t, i) => out.push(`${i + 1}. ${gStrip(t)}`));
    if (g.extra && G.long) { out.push('', g.extra.t + ':'); g.extra.items.forEach(t => out.push('• ' + gStrip(t))); }
    if (g.faq && G.long) g.faq.forEach(([q, a]) => out.push('', q, gStrip(a)));
    out.push('');
  });
  out.push('Fragen oder ein Notfall? Wir helfen gern.', G.firm, ...[G.person, G.phone && ('Telefon ' + G.phone), G.mail, G.web].filter(Boolean));
  return out.join('\n');
}

// Formatiert in die Zwischenablage (für Outlook/Thunderbird), sonst Text
async function copyRich(ctx, html, text) {
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      ctx.toast('Kopiert. Jetzt in die Mail einfügen (Strg + V).'); return;
    }
  } catch (_) { /* Fallback unten */ }
  const d = document.createElement('div'); d.innerHTML = html; d.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff'; document.body.append(d);
  const rg = document.createRange(); rg.selectNodeContents(d); const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
  let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  s.removeAllRanges(); d.remove();
  if (ok) ctx.toast('Kopiert. Jetzt in die Mail einfügen (Strg + V).');
  else { await ctx.copy(text, 'Formatierung nicht möglich – Text kopiert. Für die Mail besser „Dokument erzeugen“ und als PDF anhängen.'); }
}

export default {
  id: 'guide', name: 'Kunden-Ratgeber', group: 'Für Kunden', tags: ['Kunde', 'Drucken', 'Phishing'], icon: 'bookopen',
  keys: 'ratgeber merkblatt kunde faq tipps phishing passwort pdf drucken mail checkliste', online: false,
  render(p, ctx) {
    const br = ctx.branding;
    const saved = ctx.state.get('guide', {});
    const G = Object.assign({ sel: GUIDE.filter(g => g.def).map(g => g.id), long: true, title: 'Sicher im Internet', sub: 'Ihre Checkliste mit den wichtigsten Tipps', note: '',
      firm: br.company_name || '', person: br.technician_name || '', phone: '', mail: '', web: '', place: '' }, saved);
    p.innerHTML = `<div class="util guide"><h3>Kunden-Ratgeber</h3><p>Themen auswählen, Kontaktdaten prüfen, dann als Dokument mit eurem Logo erzeugen (drucken oder als PDF speichern) oder direkt in eine Mail kopieren.</p>
      <form class="stack" id="gdForm" onsubmit="return false">
        <div class="field"><span>Umfang</span>${segHTML('glong', [['1', 'Ausführlich mit Fragen und Antworten'], ['0', 'Kurz (Checkliste)']], G.long ? '1' : '0')}</div>
        <fieldset class="g-topics"><legend>Themen</legend>${GUIDE.map(g => `<label class="check"><input type="checkbox" name="sel" value="${g.id}"${G.sel.includes(g.id) ? ' checked' : ''}>${esc(g.t)}</label>`).join('')}</fieldset>
        <label class="field"><span>Überschrift</span><input class="input" name="title" value="${esc(G.title)}"></label>
        <label class="field"><span>Persönliche Zeilen am Anfang (optional)</span><textarea class="input" name="note" rows="3" placeholder="z. B. Hallo Frau Meyer, wie heute besprochen finden Sie hier die wichtigsten Tipps.">${esc(G.note)}</textarea></label>
        <details class="howto"${G.phone ? '' : ' open'}><summary>${ic('user')}Kontaktdaten im Ratgeber<span class="pill warn" id="gdPh"${G.phone ? ' hidden' : ''}>Telefon fehlt</span></summary><div class="howto-b stack" style="gap:10px">
          <label class="field"><span>Firma</span><input class="input" name="firm" value="${esc(G.firm)}"></label>
          <label class="field"><span>Ort</span><input class="input" name="place" value="${esc(G.place)}"></label>
          <label class="field"><span>Ansprechpartner (optional)</span><input class="input" name="person" value="${esc(G.person)}"></label>
          <label class="field"><span>Telefon</span><input class="input" name="phone" value="${esc(G.phone)}"></label>
          <label class="field"><span>E-Mail</span><input class="input" name="mail" value="${esc(G.mail)}"></label>
          <label class="field"><span>Website</span><input class="input" name="web" value="${esc(G.web)}"></label>
          <p class="note">Wird im Vault gespeichert und für jeden Ratgeber übernommen. Firma und Logo kommen aus den Einstellungen (Branding).</p></div></details>
      </form>
      <div class="stack"><div class="row"><button class="btn primary" type="button" id="gdPrint">${ic('download')}Dokument erzeugen (Drucken / PDF)</button><button class="btn" type="button" id="gdMail">${ic('mail')}Für E-Mail kopieren</button><button class="btn ghost" type="button" id="gdTxt">${ic('copy')}Als reinen Text kopieren</button></div>
        <p class="note">Das Dokument wird mit eurem Logo in der Session abgelegt, im Standardbrowser geöffnet und im Bericht vermerkt. Dort „Drucken“ bzw. „Als PDF speichern“ wählen.</p>
        <div class="g-paper" id="gdPaper"></div></div></div>`;
    const f = $('#gdForm', p);
    const draw = () => {
      const fd = new FormData(f);
      Object.assign(G, { sel: fd.getAll('sel'), title: fd.get('title') || 'Sicher im Internet', note: fd.get('note'), firm: fd.get('firm'), place: fd.get('place'), person: fd.get('person'), phone: fd.get('phone'), mail: fd.get('mail'), web: fd.get('web') });
      ctx.state.set('guide', Object.assign({}, G, { note: '' })); // persönliche Zeilen nicht dauerhaft speichern
      $('#gdPh', p).hidden = !!G.phone;
      $('#gdPaper', p).innerHTML = G.sel.length ? guideHTML(G) : `<div class="empty"><p>Mindestens ein Thema auswählen.</p></div>`;
    };
    f.addEventListener('input', draw);
    onSeg(p, 'glong', v => { G.long = v === '1'; draw(); });
    const topics = () => GUIDE.filter(g => G.sel.includes(g.id)).map(g => g.t).join(', ');
    $('#gdPrint', p).onclick = () => { if (G.sel.length) ctx.print('ratgeber', G.title, guideHTML(G, true), { workTitle: 'Ratgeber übergeben', workDetail: topics() }); };
    $('#gdMail', p).onclick = () => copyRich(ctx, guideHTML(G), guideText(G));
    $('#gdTxt', p).onclick = () => ctx.copy(guideText(G), 'Text kopiert');
    draw();
  },
};
