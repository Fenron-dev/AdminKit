// Leichter Bild-Editor für Screenshots (#121): Zuschneiden, Rahmen, Pfeil,
// nummerierte Schritte, Text, Schwärzen, Verpixeln. Alles wird beim Speichern
// ins Bild eingebrannt – geschwärzte Stellen sind danach nicht wiederherstellbar.
import { esc, ic } from './ui.js';

const TOOLS = [['crop', 'Zuschneiden', 'grid'], ['rect', 'Rahmen', 'layout'], ['arrow', 'Pfeil', 'arrowleft'], ['num', 'Schritt-Nummer', 'list'], ['text', 'Text', 'pencil'], ['black', 'Schwärzen', 'lock'], ['pixel', 'Verpixeln', 'eye']];
const COLORS = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#111827'];

// Zeichnet die Formen auf einen Kontext (sc = Skalierung für die Anzeige)
export function drawShapes(c, img, shapes) {
  for (const s of shapes) {
    const { x, y, w, h } = norm(s);
    c.save(); c.strokeStyle = c.fillStyle = s.color; c.lineWidth = s.lw; c.lineJoin = 'round'; c.lineCap = 'round';
    if (s.t === 'rect') c.strokeRect(x, y, w, h);
    else if (s.t === 'black') { c.fillStyle = '#000'; c.fillRect(x, y, w, h); }
    else if (s.t === 'pixel') pixelate(c, img, x, y, w, h, Math.max(8, Math.round(s.lw * 3)));
    else if (s.t === 'arrow') arrow(c, s.x1, s.y1, s.x2, s.y2, s.lw);
    else if (s.t === 'num') { const r = s.lw * 4.5; c.beginPath(); c.arc(s.x1, s.y1, r, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.font = `700 ${Math.round(r * 1.2)}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(s.n), s.x1, s.y1 + 1); }
    else if (s.t === 'text') { const fs = s.lw * 6; c.font = `700 ${fs}px system-ui,sans-serif`; c.textBaseline = 'top'; c.lineWidth = fs / 5; c.strokeStyle = '#fff'; c.strokeText(s.text, s.x1, s.y1); c.fillText(s.text, s.x1, s.y1); }
    c.restore();
  }
}
export const norm = s => ({ x: Math.min(s.x1, s.x2 ?? s.x1), y: Math.min(s.y1, s.y2 ?? s.y1), w: Math.abs((s.x2 ?? s.x1) - s.x1), h: Math.abs((s.y2 ?? s.y1) - s.y1) });
function arrow(c, x1, y1, x2, y2, lw) {
  const a = Math.atan2(y2 - y1, x2 - x1), hl = lw * 5;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(a) * hl * 0.6, y2 - Math.sin(a) * hl * 0.6); c.stroke();
  c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(a - 0.45), y2 - hl * Math.sin(a - 0.45)); c.lineTo(x2 - hl * Math.cos(a + 0.45), y2 - hl * Math.sin(a + 0.45)); c.closePath(); c.fill();
}
function pixelate(c, img, x, y, w, h, b) {
  if (w < 1 || h < 1) return;
  const t = document.createElement('canvas'); t.width = Math.max(1, Math.ceil(w / b)); t.height = Math.max(1, Math.ceil(h / b));
  t.getContext('2d').drawImage(img, x, y, w, h, 0, 0, t.width, t.height);
  c.imageSmoothingEnabled = false; c.drawImage(t, 0, 0, t.width, t.height, x, y, w, h); c.imageSmoothingEnabled = true;
}

// Öffnet den Editor in `host`. Liefert ein Objekt mit export(type) → data:-URI.
export async function openAnnotator(host, dataURL) {
  const img = new Image(); img.src = dataURL; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight, lw = Math.max(3, Math.round(Math.max(W, H) / 400));
  let tool = 'rect', color = COLORS[0], shapes = [], crop = null, cur = null, num = 1;
  host.innerHTML = `<div class="an-bar">${TOOLS.map(([k, l, i]) => `<button type="button" class="an-t${k === tool ? ' on' : ''}" data-ant="${k}" title="${l}">${ic(i)}<span>${l}</span></button>`).join('')}
    <span class="sep"></span>${COLORS.map(cl => `<button type="button" class="an-c${cl === color ? ' on' : ''}" data-anc="${cl}" style="background:${cl}" title="Farbe"></button>`).join('')}
    <span class="sep"></span><button type="button" class="an-t" data-ana="undo" title="Rückgängig (Strg+Z)">↶</button><button type="button" class="an-t" data-ana="reset" title="Alles zurücksetzen">${ic('refresh')}</button></div>
    <div class="an-wrap"><canvas class="an-cv"></canvas><input class="input an-txt" hidden placeholder="Text, Enter übernimmt"></div>
    <p class="note">Schwärzen und Verpixeln werden beim Speichern fest ins Bild übernommen. Für Kennwörter und Kundendaten lieber schwärzen als verpixeln.</p>`;
  const cv = host.querySelector('.an-cv'), c = cv.getContext('2d'), txt = host.querySelector('.an-txt');
  cv.width = W; cv.height = H;
  const render = () => {
    c.clearRect(0, 0, W, H); c.drawImage(img, 0, 0); drawShapes(c, img, cur ? shapes.concat(cur.t === 'crop' ? [] : [cur]) : shapes);
    const cr = cur?.t === 'crop' ? norm(cur) : crop;
    if (cr) { c.save(); c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.rect(0, 0, W, H); c.rect(cr.x, cr.y, cr.w, cr.h); c.fill('evenodd'); c.strokeStyle = '#fff'; c.setLineDash([lw * 3, lw * 2]); c.lineWidth = lw / 1.5; c.strokeRect(cr.x, cr.y, cr.w, cr.h); c.restore(); }
  };
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  cv.addEventListener('pointerdown', e => {
    const p = pos(e);
    if (tool === 'num') { shapes.push({ t: 'num', x1: p.x, y1: p.y, n: num++, color, lw }); render(); return; }
    if (tool === 'text') { const r = cv.getBoundingClientRect(); Object.assign(txt.style, { left: (e.clientX - r.left) + 'px', top: (e.clientY - r.top) + 'px' }); txt.hidden = false; txt.value = ''; txt.dataset.x = p.x; txt.dataset.y = p.y; setTimeout(() => txt.focus(), 0); return; }
    cur = { t: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, lw }; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => { if (!cur) return; const p = pos(e); cur.x2 = p.x; cur.y2 = p.y; render(); });
  cv.addEventListener('pointerup', () => {
    if (!cur) return; const n = norm(cur);
    if (n.w > 4 || n.h > 4 || cur.t === 'arrow') { if (cur.t === 'crop') crop = n; else shapes.push(cur); }
    cur = null; render();
  });
  txt.addEventListener('keydown', e => {
    if (e.key === 'Enter' && txt.value.trim()) { shapes.push({ t: 'text', x1: +txt.dataset.x, y1: +txt.dataset.y, text: txt.value.trim(), color, lw }); txt.hidden = true; render(); }
    if (e.key === 'Escape') txt.hidden = true;
  });
  host.addEventListener('click', e => {
    const t = e.target.closest('[data-ant]'); if (t) { tool = t.dataset.ant; host.querySelectorAll('[data-ant]').forEach(b => b.classList.toggle('on', b === t)); return; }
    const cl = e.target.closest('[data-anc]'); if (cl) { color = cl.dataset.anc; host.querySelectorAll('[data-anc]').forEach(b => b.classList.toggle('on', b === cl)); return; }
    const a = e.target.closest('[data-ana]'); if (!a) return;
    if (a.dataset.ana === 'undo') { if (shapes.length) { const s = shapes.pop(); if (s.t === 'num') num--; } else crop = null; }
    else { shapes = []; crop = null; num = 1; }
    render();
  });
  host.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); host.querySelector('[data-ana=undo]').click(); } });
  render();
  return {
    // Bild mit eingebrannten Markierungen (ohne Zuschnitt-Rahmen), max. 2400 px breit
    export(type = 'image/webp', q = 0.88) {
      const full = document.createElement('canvas'); full.width = W; full.height = H; const fc = full.getContext('2d');
      fc.drawImage(img, 0, 0); drawShapes(fc, img, shapes);
      const r = crop || { x: 0, y: 0, w: W, h: H }, sc = Math.min(1, 2400 / r.w);
      const out = document.createElement('canvas'); out.width = Math.round(r.w * sc); out.height = Math.round(r.h * sc);
      const oc = out.getContext('2d'); oc.fillStyle = '#fff'; oc.fillRect(0, 0, out.width, out.height); oc.drawImage(full, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
      let d = out.toDataURL(type, q); if (!d.startsWith('data:' + type)) d = out.toDataURL('image/png');
      return d;
    },
    get changed() { return shapes.length > 0 || !!crop; },
  };
}
export { esc };
