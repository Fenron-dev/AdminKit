// Wiki als Handbuch exportieren (#133): ausgewählte Artikel als eigenständige
// HTML-Datei (Bilder eingebettet, Videos als Hinweis) oder zum Drucken/PDF.
import { esc } from './ui.js';
import { md, setImages, setMediaBase, slugify } from './markdown.js';

// Medien-Verweise der App in eigenständiges HTML umwandeln
export function standaloneHTML(html) {
  return html
    .replace(/<video[^>]*src="([^"]+)"[^>]*><\/video>/g, (m, u) => `<p class="hb-media">🎬 Video: ${esc(decodeURIComponent(u.split('/').pop().split('#')[0]))} (im Wiki ansehen)</p>`)
    .replace(/<audio[^>]*src="([^"]+)"[^>]*><\/audio>/g, (m, u) => `<p class="hb-media">🔊 Audio: ${esc(decodeURIComponent(u.split('/').pop()))}</p>`)
    .replace(/<div class="md-embed" data-embed="([^"]+)">[\s\S]*?<\/div>/g, (m, u) => `<p class="hb-media">▶ Online-Video: <a href="${u}">${u}</a></p>`)
    .replace(/<button type="button" class="wk-act[^"]*"[^>]*data-arg="([^"]*)"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]*)<\/button>/g, (m, a, l) => `<code title="${a}">${l}</code>`)
    .replace(/<button class="code-copy"[^>]*>[^<]*<\/button>/g, '');
}

async function inlineImages(html) {
  const urls = [...new Set([...html.matchAll(/src="(\/vaultmedia\/[^"]+)"/g)].map(m => m[1]))];
  for (const u of urls) {
    try {
      const b = await (await fetch(u)).blob();
      const d = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
      html = html.split(`src="${u}"`).join(`src="${d}"`);
    } catch (_) { /* Bild fehlt */ }
  }
  return html;
}

export async function buildHandbook(title, articles) {
  const parts = [];
  for (const a of articles) {
    setImages(a.images || {}); setMediaBase(a.slug);
    parts.push(`<section id="a-${slugify(a.titel)}"><h1>${esc(a.titel)}</h1><p class="hb-meta">${esc(a.kategorie)}${a.geaendert ? ' · Stand ' + new Date(a.geaendert).toLocaleDateString('de-DE') : ''}</p>${standaloneHTML(md(a.body))}</section>`);
  }
  const toc = `<nav class="hb-toc"><h2>Inhalt</h2><ol>${articles.map(a => `<li><a href="#a-${slugify(a.titel)}">${esc(a.titel)}</a></li>`).join('')}</ol></nav>`;
  return inlineImages(`<header class="hb-title"><h1>${esc(title)}</h1><p>${articles.length} Artikel · erstellt ${new Date().toLocaleDateString('de-DE')}</p></header>${toc}${parts.join('')}`);
}

export const HB_CSS = `body{font:15px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a2230;max-width:860px;margin:30px auto;padding:0 20px}h1{font-size:26px;margin:40px 0 4px}section{page-break-before:always}img{max-width:100%;height:auto;border:1px solid #ddd;border-radius:6px}pre{background:#0d1117;color:#e6edf3;padding:12px;border-radius:8px;overflow:auto;font-size:12.5px}code{font-family:Consolas,Menlo,monospace}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}.callout{border-left:4px solid #3b82f6;background:#f3f6fb;padding:8px 14px;margin:12px 0;border-radius:4px}.os-group{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hb-meta,.hb-media{color:#667}.hb-toc{page-break-after:always}svg{max-width:100%;height:auto}`;
