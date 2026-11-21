// Markdown-Renderer des Ideler-Portals (inkl. Sonderblöcke ablauf, vergleich,
// illustration und Hinweis-Kästen). In AdminKit: Bilder als relative Pfade im
// Vault, externe Links öffnen im Standardbrowser.
import { esc, ic } from './ui.js';
import { ILLU } from './data/illu.js';

export function slugify(s) { return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artikel'; }

let MD_IMG={};
export function setImages(m){MD_IMG=m||{}}
function imgSrc(u){u=String(u).replace(/&amp;/g,'&');if(MD_IMG[u])return MD_IMG[u];if(/^https?:\/\//i.test(u))return esc(u);if(/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+$/.test(u))return u;return null}
export function mdBlock(lang,buf){const L=buf.map(x=>x.trim()).filter(Boolean);
  if(lang==='ablauf')return `<ol class="flow">${L.map((l,i)=>{const [t,...r]=l.split('|');return `<li><span class="flow-n">${i+1}</span><div><strong>${mdInline(t.trim())}</strong>${r.length?`<span>${mdInline(r.join('|').trim())}</span>`:''}</div></li>`}).join('')}</ol>`;
  if(lang==='vergleich'){const rows=L.map(l=>l.split('|').map(c=>c.trim()));const head=rows.shift()||[];
    const cell=c=>{const cls=/^\+/.test(c)?'yes':/^-\s/.test(c)||c==='-'?'no':'';return `<td class="${cls}">${cls?`<i>${ic(cls==='yes'?'check':'x')}</i>`:''}<span>${mdInline(c.replace(/^[+-]\s*/,''))}</span></td>`};
    return `<div class="table cmp-t"><table><thead><tr>${head.map(h=>`<th>${mdInline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><th>${mdInline(r[0]||'')}</th>${r.slice(1).map(cell).join('')}</tr>`).join('')}</tbody></table></div>`}
  if(lang==='illustration'){const n=(L[0]||'').toLowerCase(),svg=ILLU[n];if(!svg)return `<p class="muted">Illustration „${esc(n)}“ gibt es nicht. Verfügbar: ${Object.keys(ILLU).join(', ')}</p>`;
    return `<figure class="illu">${svg}${L.length>1?`<figcaption>${mdInline(L.slice(1).join(' '))}</figcaption>`:''}</figure>`}
  return null}
export function mdInline(s){
  s=esc(s);const codes=[];
  s=s.replace(/``\s?(.+?)\s?``|`([^`]+)`/g,(m,a,b)=>{codes.push(a??b);return `\u0000${codes.length-1}\u0000`});
  s=s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,(m,alt,u)=>{const src=imgSrc(u);return src?`<img class="md-img" src="${src}" alt="${alt}" loading="lazy">`:''});
  s=s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(m,t,u)=>{const raw=u.replace(/&amp;/g,'&');
    if(/^#\/wiki\/a\//.test(raw))return `<a href="#" data-wiki="${esc(raw.slice(9))}">${t}</a>`;
    if(/^https?:\/\//i.test(raw))return `<a href="#" data-open="${u}">${t}</a>`;if(/^mailto:/i.test(raw))return `<a href="${u}">${t}</a>`;return t});
  s=s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,'$1<a href="#" data-open="$2">$2</a>');
  s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\*)/g,'$1<em>$2</em>');
  s=s.replace(/~~(.+?)~~/g,'<del>$1</del>');
  s=s.replace(/\u0000(\d+)\u0000/g,(m,i)=>`<code>${codes[i]}</code>`);
  return s;
}
export function md(src){
  const L=String(src||'').replace(/\r\n?/g,'\n').split('\n'),out=[];let i=0,m,mm;
  const listRe=/^\s*([-*+]|\d+\.)\s+(.*)$/;
  const isStart=l=>/^(```|#{1,6}\s|>|\||!\[)/.test(l)||listRe.test(l)||/^(-{3,}|\*{3,})\s*$/.test(l);
  while(i<L.length){
    const l=L[i];
    if(!l.trim()){i++;continue}
    if((m=l.match(/^(`{3,})\s*([\w-]*)/))){const fence=m[1],lang=m[2],buf=[];i++;while(i<L.length&&!(L[i].trim().startsWith(fence)&&/^`+$/.test(L[i].trim())))buf.push(L[i++]);i++;
      const blk=mdBlock(lang,buf);if(blk){out.push(blk);continue}
      out.push(`<div class="code"><pre><code${lang?` data-lang="${esc(lang)}"`:''}>${esc(buf.join('\n'))}</code></pre><button class="code-copy" type="button">Kopieren</button></div>`);continue}
    if((m=l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/))){const src=imgSrc(m[2]);i++;if(src)out.push(`<figure class="md-fig"><img src="${src}" alt="${esc(m[1])}" loading="lazy">${m[1]?`<figcaption>${mdInline(m[1])}</figcaption>`:''}</figure>`);continue}
    if((m=l.match(/^(#{1,6})\s+(.*)$/))){const n=Math.min(Math.max(m[1].length,2),4),t=m[2].replace(/\s+#+\s*$/,'');out.push(`<h${n} id="h-${slugify(t)}">${mdInline(t)}</h${n}>`);i++;continue}
    if(/^(-{3,}|\*{3,})\s*$/.test(l)){out.push('<hr>');i++;continue}
    if(/^>/.test(l)){const buf=[];while(i<L.length&&/^>/.test(L[i]))buf.push(L[i++].replace(/^>\s?/,''));
      const cm=buf[0]&&buf[0].match(/^\[!(TIPP|HINWEIS|INFO|WARNUNG|ACHTUNG)\]\s*(.*)$/i);
      if(cm){const t=cm[1].toUpperCase(),cls=t==='TIPP'?'tip':(t==='WARNUNG'||t==='ACHTUNG')?'warn':'info';const title=cm[2]||({tip:'Tipp',warn:'Achtung',info:'Hinweis'})[cls];buf.shift();
        out.push(`<aside class="callout ${cls}"><strong class="callout-t">${ic(cls==='warn'?'alert':cls==='tip'?'zap':'info')}${mdInline(title)}</strong>${md(buf.join('\n'))}</aside>`)}
      else out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`);continue}
    if(/^\|/.test(l)&&i+1<L.length&&/^\|?\s*:?-{2,}/.test(L[i+1])){
      const row=r=>r.trim().replace(/^\||(?<!\\)\|$/g,'').split(/(?<!\\)\|/).map(c=>c.trim().replace(/\\\|/g,'|'));const head=row(l);
      const al=row(L[i+1]).map(c=>c.startsWith(':')&&c.endsWith(':')?'center':c.endsWith(':')?'right':'');i+=2;const rows=[];
      while(i<L.length&&/^\|/.test(L[i]))rows.push(row(L[i++]));const st=j=>al[j]?` style="text-align:${al[j]}"`:'';
      out.push(`<div class="table"><table>${head.some(h=>h)?`<thead><tr>${head.map((h,j)=>`<th${st(j)}>${mdInline(h)}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(r=>`<tr>${head.map((_,j)=>`<td${st(j)}>${mdInline(r[j]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue}
    if((m=l.match(listRe))){const ordered=/\d/.test(m[1]);const items=[];
      while(i<L.length&&(mm=L[i].match(listRe))){items.push(mm[2]);i++;while(i<L.length&&/^\s{2,}\S/.test(L[i])&&!listRe.test(L[i])){items[items.length-1]+=' '+L[i].trim();i++}}
      const lis=items.map(t=>{const tm=t.match(/^\[( |x|X)\]\s+(.*)$/);return tm?`<li class="task${tm[1]!==' '?' done':''}"><span class="cb" aria-hidden="true">${tm[1]!==' '?ic('check'):''}</span><span>${mdInline(tm[2])}</span></li>`:`<li>${mdInline(t)}</li>`}).join('');
      out.push(ordered?`<ol>${lis}</ol>`:`<ul>${lis}</ul>`);continue}
    const buf=[l];i++;while(i<L.length&&L[i].trim()&&!isStart(L[i]))buf.push(L[i++]);
    out.push(`<p>${buf.map((x,k)=>mdInline(x.replace(/(\s{2,}|\\)$/,''))+(k<buf.length-1?(/(\s{2,}|\\)$/.test(x)?'<br>':' '):'')).join('')}</p>`);
  }
  return out.join('\n');
}
export const plain=s=>String(s).replace(/`{3,}[\s\S]*?`{3,}/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/^>\s?\[![A-Z]+\].*$/gim,' ').replace(/[#>*`|\-\[\]_~]/g,' ').replace(/\(https?:[^)]+\)/g,'').replace(/\s+/g,' ').trim();
