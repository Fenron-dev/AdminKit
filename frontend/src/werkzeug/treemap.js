// Squarified-Treemap (#98) für den Disk-Analyzer – ohne Abhängigkeiten.
// squarify() ist reine Geometrie (mit node --test geprüft), drawTreemap()
// zeichnet auf ein <canvas> und liefert die Rechtecke für Maus-Treffer.

// Verhältnis des ungünstigsten Rechtecks einer Reihe (Bruls et al.)
function worst(row, side) {
  let s = 0, max = 0, min = Infinity;
  for (const a of row) { s += a; if (a > max) max = a; if (a < min) min = a; }
  if (!s || !min) return Infinity;
  const s2 = s * s, w2 = side * side;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}

/**
 * Verteilt items (absteigend nach size sortiert, size > 0) auf das Rechteck.
 * Liefert [{ item, x, y, w, h }] in Reihenfolge der items.
 */
export function squarify(items, x, y, w, h) {
  const list = items.filter(it => it.size > 0);
  const total = list.reduce((s, it) => s + it.size, 0);
  if (!total || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const areas = list.map(it => it.size * scale);
  const out = [];
  let rect = { x, y, w, h }, row = [], rowItems = [];

  const layoutRow = () => {
    const s = row.reduce((a, b) => a + b, 0);
    if (rect.w >= rect.h) { // Spalte links
      const cw = s / rect.h; let cy = rect.y;
      row.forEach((a, i) => { const ch = a / cw; out.push({ item: rowItems[i], x: rect.x, y: cy, w: cw, h: ch }); cy += ch; });
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else { // Zeile oben
      const rh = s / rect.w; let cx = rect.x;
      row.forEach((a, i) => { const rw = a / rh; out.push({ item: rowItems[i], x: cx, y: rect.y, w: rw, h: rh }); cx += rw; });
      rect = { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh };
    }
    row = []; rowItems = [];
  };

  areas.forEach((a, i) => {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst(row.concat(a), side) <= worst(row, side)) { row.push(a); rowItems.push(list[i]); }
    else { layoutRow(); row.push(a); rowItems.push(list[i]); }
  });
  if (row.length) layoutRow();
  return out;
}

/**
 * Zeichnet die Kacheln. colorOf(item) → CSS-Farbe, labelOf(item) → [Zeile1, Zeile2].
 * Liefert die Rechtecke (CSS-Pixel) für hitTest().
 */
export function drawTreemap(canvas, items, { colorOf, labelOf, highlight, textColor = '#fff', bg = 'transparent' } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  if (bg !== 'transparent') { g.fillStyle = bg; g.fillRect(0, 0, cw, ch); }
  const rects = squarify(items, 0, 0, cw, ch);
  g.textBaseline = 'top';
  for (const r of rects) {
    const gap = 1.5, x = r.x + gap / 2, y = r.y + gap / 2, w = Math.max(0, r.w - gap), h = Math.max(0, r.h - gap);
    g.fillStyle = colorOf ? colorOf(r.item) : '#888';
    g.globalAlpha = highlight && highlight !== r.item ? 0.55 : 1;
    roundRect(g, x, y, w, h, Math.min(6, w / 4, h / 4));
    g.fill();
    g.globalAlpha = 1;
    if (highlight === r.item) { g.lineWidth = 2; g.strokeStyle = textColor; roundRect(g, x + 1, y + 1, w - 2, h - 2, 5); g.stroke(); }
    if (w > 54 && h > 22 && labelOf) {
      const [l1, l2] = labelOf(r.item);
      g.fillStyle = textColor;
      g.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
      g.fillText(fit(g, l1, w - 12), x + 6, y + 6);
      if (l2 && h > 40) { g.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif'; g.globalAlpha = 0.85; g.fillText(fit(g, l2, w - 12), x + 6, y + 22); g.globalAlpha = 1; }
    }
  }
  return rects;
}

export function hitTest(rects, px, py) {
  return rects.find(r => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h)?.item || null;
}

function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t.length > 1 ? t + '…' : '';
}

function roundRect(g, x, y, w, h, r) {
  r = Math.max(0, r);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
