// Bildschirmaufnahme (#121): Dialog für Screenshot (mit Editor) und Video.
// Video über getDisplayMedia + MediaRecorder (Mikrofon/Systemton optional),
// sonst unter macOS über screencapture (Go). Ziel: Wiki-Artikel (slug) oder Datei.
//   openCapture(ctx, { slug, mode: 'shot'|'video', onInsert({ md, rel, data }) })
import { esc, ic } from './ui.js';
import { openAnnotator } from './annotate.js';
import { uploadBlob } from './media.js';
import { SaveWikiImage, CaptureScreenshot, CaptureCapabilities, RecordStart, RecordStop, MediaToGIF } from '../../wailsjs/go/main/App';

const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
import { pickMime, trimFragment } from './capture-util.js';

export async function openCapture(ctx, opts = {}) {
  const caps = await CaptureCapabilities().catch(() => ({}));
  const jsVideo = !!navigator.mediaDevices?.getDisplayMedia && !!window.MediaRecorder;
  const ov = document.createElement('div');
  ov.className = 'wz cap-ov';
  ov.innerHTML = `<div class="cap-box" role="dialog" aria-label="Bildschirmaufnahme"><div class="cap-head"><b>Bildschirmaufnahme</b>
      <div class="lst-modes"><button type="button" class="lk-chip" data-capm="shot">${ic('image')}Bildschirmfoto</button><button type="button" class="lk-chip" data-capm="video">${ic('video')}Video</button></div>
      <button class="icon-btn" type="button" data-capx="close" title="Schließen">${ic('x')}</button></div><div class="cap-body"></div></div>`;
  document.body.appendChild(ov);
  const body = ov.querySelector('.cap-body');
  let ann = null, rec = null, stopAll = () => {};
  const close = () => { stopAll(); ov.remove(); };
  const done = r => { opts.onInsert?.(r); };

  // ── Screenshot ──
  const shotUI = () => {
    ann = null;
    body.innerHTML = `<div class="row"><label class="field"><span>Was</span><select class="input" id="capMode"><option value="screen">Ganzer Bildschirm (danach zuschneiden)</option>${caps.interactive ? '<option value="interactive" selected>Bereich oder Fenster wählen</option>' : ''}</select></label>
      <label class="field"><span>Verzögerung</span><select class="input" id="capDelay"><option value="0">sofort</option><option value="3">3 Sekunden</option><option value="5">5 Sekunden</option><option value="10">10 Sekunden</option></select></label>
      <button class="btn primary" type="button" id="capShot">${ic('image')}Aufnehmen</button></div>
      <p class="note">AdminKit blendet sich für die Aufnahme kurz aus. ${caps.interactive ? 'Im Auswahlmodus: Bereich ziehen oder Leertaste für ein Fenster, Esc bricht ab.' : 'Tipp: Unter Windows geht ein Ausschnitt auch mit Win + Umschalt + S und Strg + V im Wiki-Editor.'} Verzögerung hilft bei geöffneten Menüs.</p>
      <div id="capEd"></div>`;
    body.querySelector('#capShot').onclick = async () => {
      let d;
      try { d = await CaptureScreenshot(body.querySelector('#capMode').value, +body.querySelector('#capDelay').value); }
      catch (e) { if (!/abgebrochen/i.test(String(e))) ctx.toast('Aufnahme nicht möglich: ' + e + (/darwin|mac/i.test(ctx.os) ? ' – Bildschirmaufnahme für AdminKit erlauben?' : '')); return; }
      const ed = body.querySelector('#capEd');
      ed.innerHTML = '<div class="cap-ann"></div><div class="row cap-acts"></div>';
      ann = await openAnnotator(ed.querySelector('.cap-ann'), d);
      ed.querySelector('.cap-acts').innerHTML = `${opts.slug ? `<button class="btn primary" type="button" data-capx="ins">${ic('check')}In Artikel einfügen</button><button class="btn" type="button" data-capx="ins-next">Einfügen & nächstes</button>` : `<button class="btn primary" type="button" data-capx="save">${ic('download')}Speichern unter…</button>`}
        <button class="btn" type="button" data-capx="copy">${ic('copy')}Kopieren</button><button class="btn ghost" type="button" data-capx="again">Neu aufnehmen</button>`;
    };
  };
  const insertShot = async next => {
    const data = ann.export();
    try {
      const rel = await SaveWikiImage(opts.slug, 'screenshot-' + stamp(), data);
      done({ md: `![Bildschirmfoto](${rel})`, rel, data });
      ctx.toast('Bildschirmfoto eingefügt');
      if (next) shotUI(); else close();
    } catch (e) { ctx.toast('Speichern fehlgeschlagen: ' + e); }
  };

  // ── Video ──
  const videoUI = () => {
    body.innerHTML = `<div class="row"><label class="check"><input type="checkbox" id="capMic">Mikrofon (Kommentar)</label>
      ${jsVideo ? '<label class="check"><input type="checkbox" id="capSys">Systemton (falls angeboten)</label>' : ''}${!jsVideo && caps.native_video ? '<label class="check"><input type="checkbox" id="capClk" checked>Klicks anzeigen</label>' : ''}</div>
      ${jsVideo || caps.native_video ? `<div class="row"><button class="btn primary" type="button" id="capRec">${ic('video')}Aufnahme starten</button><span id="capState" class="muted"></span></div>` : '<div class="chk warn"><div><strong>Videoaufnahme hier nicht verfügbar</strong><div class="chk-b">Die Anzeige von AdminKit unterstützt keine Bildschirmfreigabe. Alternativ mit der Xbox Game Bar (Win + Alt + R) bzw. Snipping Tool aufnehmen und die Datei im Wiki einfügen.</div></div></div>'}
      <p class="note">${jsVideo ? 'Nach dem Start fragt das System, welcher Bildschirm oder welches Fenster aufgenommen wird. Am besten nur das betroffene Fenster wählen.' : 'Aufgenommen wird der Hauptbildschirm. Beim ersten Mal fragt macOS nach der Erlaubnis für die Bildschirmaufnahme.'} Kennwörter und Kundendaten vorher schließen.</p>
      <div id="capPrev"></div>`;
    const btn = body.querySelector('#capRec'), st = body.querySelector('#capState');
    if (!btn) return;
    btn.onclick = () => rec ? stopRec() : (jsVideo ? startJs() : startNative());
    let t0 = 0, timer = 0, paused = 0;
    const tick = () => { st.textContent = `● Aufnahme ${fmtT((Date.now() - t0 - paused) / 1000)}`; };
    const startJs = async () => {
      let display, mic = null;
      try { display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: !!body.querySelector('#capSys')?.checked }); }
      catch (e) { ctx.toast('Bildschirmfreigabe abgelehnt oder nicht möglich'); return; }
      try { if (body.querySelector('#capMic').checked) mic = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_) { ctx.toast('Mikrofon nicht verfügbar – Aufnahme ohne Kommentar'); }
      const ac = new AudioContext(), dest = ac.createMediaStreamDestination();
      if (display.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
      if (mic) ac.createMediaStreamSource(mic).connect(dest);
      const stream = new MediaStream([...display.getVideoTracks(), ...(display.getAudioTracks().length || mic ? dest.stream.getAudioTracks() : [])]);
      const mime = pickMime(), chunks = [];
      const mr = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: 2500000 }, mime ? { mimeType: mime } : {}));
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        [display, mic].forEach(s => s?.getTracks().forEach(tr => tr.stop())); ac.close();
        clearInterval(timer); rec = null; btn.innerHTML = `${ic('video')}Neue Aufnahme`; st.textContent = '';
        showPreview(new Blob(chunks, { type: mr.mimeType || 'video/webm' }));
      };
      display.getVideoTracks()[0].addEventListener('ended', () => { if (mr.state !== 'inactive') mr.stop(); });
      mr.start(1000);
      rec = { stop: () => mr.state !== 'inactive' && mr.stop(), mr };
      t0 = Date.now(); paused = 0; timer = setInterval(tick, 500); tick();
      btn.innerHTML = `${ic('stop')}Stopp`;
      addPause(mr);
    };
    const addPause = mr => {
      const pb = document.createElement('button'); pb.className = 'btn ghost'; pb.type = 'button'; pb.id = 'capPause'; pb.textContent = 'Pause';
      let ps = 0;
      pb.onclick = () => { if (mr.state === 'recording') { mr.pause(); ps = Date.now(); clearInterval(timer); pb.textContent = 'Fortsetzen'; st.textContent = '⏸ pausiert'; } else if (mr.state === 'paused') { mr.resume(); paused += Date.now() - ps; timer = setInterval(tick, 500); pb.textContent = 'Pause'; } };
      btn.after(pb);
      const orig = rec.stop; rec.stop = () => { pb.remove(); orig(); };
    };
    const startNative = async () => {
      try { await RecordStart(body.querySelector('#capMic').checked, !!body.querySelector('#capClk')?.checked); }
      catch (e) { ctx.toast('Aufnahme nicht möglich: ' + e); return; }
      rec = { native: true }; t0 = Date.now(); paused = 0; timer = setInterval(tick, 500); tick();
      btn.innerHTML = `${ic('stop')}Stopp`;
    };
    const stopRec = async () => {
      if (!rec.native) { rec.stop(); return; }
      clearInterval(timer); st.textContent = 'Speichere …'; btn.disabled = true;
      try {
        const rel = await RecordStop(opts.slug || 'aufnahmen');
        rec = null; btn.disabled = false; btn.innerHTML = `${ic('video')}Neue Aufnahme`; st.textContent = '';
        if (opts.slug) { done({ md: `![[${rel.split('/').pop()}]]`, rel }); ctx.toast('Video eingefügt'); close(); }
        else ctx.toast('Video gespeichert im Vault: wiki/' + rel);
      } catch (e) { rec = null; btn.disabled = false; btn.innerHTML = `${ic('video')}Aufnahme starten`; st.textContent = ''; ctx.toast(String(e)); }
    };
    stopAll = () => { clearInterval(timer); if (rec?.native) RecordStop(opts.slug || 'aufnahmen').catch(() => {}); else rec?.stop(); rec = null; };
  };
  const showPreview = blob => {
    const url = URL.createObjectURL(blob), box = body.querySelector('#capPrev'), ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
    box.innerHTML = `<video class="cap-vid" controls src="${url}"></video>
      <div class="row cap-trim"><label class="field"><span>Anfang (s)</span><input class="input" type="number" id="capS" min="0" step="0.5" value="0"></label><label class="field"><span>Ende (s)</span><input class="input" type="number" id="capE" min="0" step="0.5"></label>
        <button class="btn sm ghost" type="button" id="capSetS">Anfang = aktuelle Stelle</button><button class="btn sm ghost" type="button" id="capSetE">Ende = aktuelle Stelle</button></div>
      <p class="note">${(blob.size / 1048576).toFixed(1)} MB. Kürzen ändert die Datei nicht, der Artikel spielt nur den Ausschnitt ab.</p>
      <div class="row">${opts.slug ? `<button class="btn primary" type="button" id="capIns">${ic('check')}In Artikel einfügen</button>${caps.ffmpeg ? '<button class="btn" type="button" id="capGif">Als GIF einfügen</button>' : ''}` : `<button class="btn primary" type="button" id="capSave">${ic('download')}Speichern unter…</button>`}</div>`;
    const v = box.querySelector('video'), S = box.querySelector('#capS'), E = box.querySelector('#capE');
    v.addEventListener('loadedmetadata', () => { if (isFinite(v.duration)) E.value = v.duration.toFixed(1); });
    box.querySelector('#capSetS').onclick = () => { S.value = v.currentTime.toFixed(1); };
    box.querySelector('#capSetE').onclick = () => { E.value = v.currentTime.toFixed(1); };
    const up = async () => { ctx.toast('Lade Video hoch …'); return uploadBlob(opts.slug, `aufnahme-${stamp()}.${ext}`, blob); };
    if (opts.slug) {
      box.querySelector('#capIns').onclick = async () => {
        try { const rel = await up(); done({ md: `![[${rel.split('/').pop()}${trimFragment(+S.value, +E.value, v.duration)}]]`, rel }); ctx.toast('Video eingefügt'); URL.revokeObjectURL(url); close(); }
        catch (e) { ctx.toast('Hochladen fehlgeschlagen: ' + e); }
      };
      box.querySelector('#capGif')?.addEventListener('click', async () => {
        try { const rel = await up(); ctx.toast('Erzeuge GIF …'); const gif = await MediaToGIF(rel, +S.value || 0, +E.value || 0); done({ md: `![[${gif.split('/').pop()}]]`, rel: gif }); URL.revokeObjectURL(url); close(); }
        catch (e) { ctx.toast('GIF nicht möglich: ' + e); }
      });
    } else box.querySelector('#capSave').onclick = async () => {
      if (blob.size > 150 * 1048576) ctx.toast('Große Datei – das Speichern dauert einen Moment.');
      const r = new FileReader(); r.onload = () => ctx.saveDataURL(`aufnahme-${stamp()}.${ext}`, r.result); r.readAsDataURL(blob);
    };
  };

  ov.addEventListener('click', async e => {
    const m = e.target.closest('[data-capm]');
    if (m) { if (rec) { ctx.toast('Erst die Aufnahme beenden'); return; } ov.querySelectorAll('[data-capm]').forEach(b => b.classList.toggle('on', b === m)); m.dataset.capm === 'shot' ? shotUI() : videoUI(); return; }
    const x = e.target.closest('[data-capx]'); if (!x) return;
    const a = x.dataset.capx;
    if (a === 'close') { if (rec && !await ctx.confirm({ title: 'Aufnahme verwerfen?', what: 'Die laufende Videoaufnahme wird beendet und nicht gespeichert.', impact: '' })) return; close(); }
    else if (a === 'ins') insertShot(false);
    else if (a === 'ins-next') insertShot(true);
    else if (a === 'again') shotUI();
    else if (a === 'save') ctx.saveDataURL(`bildschirmfoto-${stamp()}.png`, ann.export('image/png'));
    else if (a === 'copy') {
      try { const b = await (await fetch(ann.export('image/png'))).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); ctx.toast('Bild kopiert'); }
      catch (_) { ctx.toast('Kopieren von Bildern wird hier nicht unterstützt – bitte speichern.'); }
    }
  });
  ov.addEventListener('keydown', e => { if (e.key === 'Escape' && !rec && !ann) close(); });
  const start = opts.mode === 'video' ? 'video' : 'shot';
  ov.querySelector(`[data-capm="${start}"]`).click();
}
export { esc };
