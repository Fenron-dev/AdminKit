// Link-Prüfer – Offline-Analyse 1:1 aus dem Ideler-Portal (Marken, Homoglyphen,
// Punycode, Schutzlink-Entpacken …). Online-Prüfung über Go: DNS, RDAP und
// microlink. AdminKit ruft den verdächtigen Link selbst nie auf.
import { $, esc, ic, chk } from '../ui.js';
import { regDom } from './mail.js';

const fmtDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
let lastLink = 'https://paypal.com.konto-sicherheit.xyz/login?id=8812';
// Parameter (Teil nach ? und #) entfernen, bevor ein Link an Drittdienste geht
export const stripUrl = u => { try { const x = new URL(u); x.search = ''; x.hash = ''; return x.toString(); } catch (_) { return u; } };

export const BRANDS={paypal:['paypal.com','paypal.de','paypal.me'],amazon:['amazon.de','amazon.com','amazon.co.uk','amazon.fr','amazon.it','amazon.es','amazon.nl','amazon.at','amazonaws.com'],sparkasse:['sparkasse.de'],volksbank:['vr.de'],postbank:['postbank.de'],commerzbank:['commerzbank.de','commerzbank.com'],
  deutschebank:['deutsche-bank.de','db.com'],comdirect:['comdirect.de'],dkb:['dkb.de'],ing:['ing.de','ing.com'],telekom:['telekom.de','t-online.de','telekom.com'],vodafone:['vodafone.de','vodafone.com'],congstar:['congstar.de'],ewe:['ewe.de','ewetel.de'],
  dhl:['dhl.de','dhl.com'],hermes:['myhermes.de','hermesworld.com'],dpd:['dpd.de','dpd.com'],ups:['ups.com'],deutschepost:['deutschepost.de'],microsoft:['microsoft.com','live.com','office.com','microsoftonline.com','outlook.com','sharepoint.com','office365.com','onedrive.com','windows.net'],
  apple:['apple.com','icloud.com'],google:['google.com','google.de','gmail.com','youtube.com','googleusercontent.com'],netflix:['netflix.com'],ebay:['ebay.de','ebay.com'],kleinanzeigen:['kleinanzeigen.de'],facebook:['facebook.com','fb.com'],instagram:['instagram.com'],whatsapp:['whatsapp.com','whatsapp.net'],
  gmx:['gmx.de','gmx.net'],webde:['web.de'],tonline:['t-online.de'],elster:['elster.de'],otto:['otto.de'],zalando:['zalando.de'],bitwarden:['bitwarden.com'],ideler:['ideler.de','ideler-it.de','ideler.cloud','isrv.eu','ideler.host','ideler.app']};
export const BRAND_NAMES={deutschebank:'Deutsche Bank',deutschepost:'Deutsche Post',webde:'WEB.DE',tonline:'T-Online',paypal:'PayPal',dhl:'DHL',ups:'UPS',dpd:'DPD',dkb:'DKB',ing:'ING',gmx:'GMX',ewe:'EWE',ideler:'Ideler'};
export const brandName=b=>BRAND_NAMES[b]||b[0].toUpperCase()+b.slice(1);
export const USER_HOSTED=[['sites.google.com','Google Sites'],['docs.google.com','Google Docs / Google Formulare'],['drive.google.com','Google Drive'],['storage.googleapis.com','Google Cloud Storage'],['googleusercontent.com','Google (Nutzerinhalte)'],['firebaseapp.com','Firebase'],['web.app','Firebase'],['appspot.com','Google App Engine'],['forms.gle','Google Formulare'],['translate.goog','dem Google-Übersetzer-Proxy'],['blogspot.com','Blogger'],
  ['github.io','GitHub Pages'],['raw.githubusercontent.com','GitHub'],['gitlab.io','GitLab Pages'],['pages.dev','Cloudflare Pages'],['workers.dev','Cloudflare Workers'],['r2.dev','Cloudflare R2'],['netlify.app','Netlify'],['vercel.app','Vercel'],['herokuapp.com','Heroku'],['onrender.com','Render'],['glitch.me','Glitch'],['replit.app','Replit'],['repl.co','Replit'],['ngrok.io','ngrok'],['ngrok-free.app','ngrok'],['trycloudflare.com','Cloudflare-Tunnel'],
  ['azurewebsites.net','Microsoft Azure'],['blob.core.windows.net','Microsoft Azure Storage'],['web.core.windows.net','Microsoft Azure Storage'],['sharepoint.com','SharePoint (Freigabe irgendeines Microsoft-Kunden)'],['1drv.ms','einer OneDrive-Freigabe'],['forms.office.com','Microsoft Forms'],['amazonaws.com','Amazon AWS'],['cloudfront.net','Amazon CloudFront'],
  ['wixsite.com','Wix'],['weebly.com','Weebly'],['webflow.io','Webflow'],['framer.website','Framer'],['framer.app','Framer'],['jimdosite.com','Jimdo'],['jimdofree.com','Jimdo'],['godaddysites.com','GoDaddy'],['square.site','Square'],['000webhostapp.com','000webhost'],['carrd.co','Carrd'],['notion.site','Notion'],['canva.site','Canva'],['wordpress.com','WordPress.com'],['dropboxusercontent.com','Dropbox'],['ipfs.io','IPFS'],['dweb.link','IPFS'],['mailchimpsites.com','Mailchimp'],['typeform.com','Typeform'],['jotform.com','Jotform']];
export const SHORT=['bit.ly','t.co','tinyurl.com','goo.gl','ow.ly','is.gd','buff.ly','rebrand.ly','cutt.ly','shorturl.at','t.ly','rb.gy','tiny.cc','s.id','lnkd.in','qrco.de','bl.ink','short.io','v.gd','x.co'];
export const RISKY_TLD=['zip','mov','xyz','top','click','gq','tk','ml','cf','ga','work','support','cam','icu','buzz','sbs','cfd','lol','cyou','rest','country','kim','men','loan','date','win','bid','review','mom','quest','beauty','hair'];
export const BAIT=/login|log-in|signin|verif|konto|account|sicherheit|security|secure|update|bestaetig|bestätig|entsperr|unlock|password|passwort|kennwort|billing|rechnung|zahlung|payment|support|wallet|bank/i;
export const CONF={'а':'a','е':'e','о':'o','р':'p','с':'c','у':'y','х':'x','і':'i','ј':'j','ѕ':'s','ԁ':'d','ɡ':'g','ո':'n','ԝ':'w','ο':'o','α':'a','ν':'v','ρ':'p','τ':'t','κ':'k','ι':'i','ε':'e','ı':'i','ӏ':'l'};
export function punyDecode(inp){const B=36;let out=[],n=128,i=0,bias=72,b=inp.lastIndexOf('-');if(b<0)b=0;for(let j=0;j<b;j++)out.push(inp.charCodeAt(j));
  const adapt=(d,np,first)=>{d=first?Math.floor(d/700):d>>1;d+=Math.floor(d/np);let k=0;while(d>455){d=Math.floor(d/35);k+=B}return k+Math.floor(36*d/(d+38))};
  for(let idx=b>0?b+1:0;idx<inp.length;){const oi=i;let w=1;for(let k=B;;k+=B){if(idx>=inp.length)throw 0;const c=inp.charCodeAt(idx++);const dg=c>=48&&c<=57?c-22:c>=65&&c<=90?c-65:c>=97&&c<=122?c-97:B;if(dg>=B)throw 0;
    i+=dg*w;const t=k<=bias?1:k>=bias+26?26:k-bias;if(dg<t)break;w*=B-t}const len=out.length+1;bias=adapt(i-oi,len,oi===0);n+=Math.floor(i/len);i%=len;out.splice(i++,0,n)}return String.fromCodePoint(...out)}
export const uniHost=h=>h.split('.').map(l=>{if(!/^xn--/i.test(l))return l;try{return punyDecode(l.slice(4))}catch(e){return l}}).join('.');
export const skel=s=>[...s].map(c=>CONF[c]||c).join('').replace(/0/g,'o').replace(/1/g,'l').replace(/3/g,'e').replace(/5/g,'s').replace(/rn/g,'m').replace(/vv/g,'w').replace(/[-_.]/g,'');
export function lev(a,b){if(Math.abs(a.length-b.length)>2)return 9;const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]}
export function unwrap(u,chain=[]){if(chain.length>5)return {u,chain};let url;try{url=new URL(u)}catch(e){return {u,chain}}const h=url.hostname.toLowerCase();let inner=null,via='';
  if(/safelinks\.protection\.outlook\.com$/.test(h)){inner=url.searchParams.get('url');via='Outlook-Schutzlink (Safe Links)'}
  else if(/(^|\.)google\.[a-z.]+$/.test(h)&&url.pathname==='/url'){inner=url.searchParams.get('q')||url.searchParams.get('url');via='Google-Weiterleitung'}
  else if(/urldefense\.proofpoint\.com$/.test(h)&&url.searchParams.get('u')){inner=url.searchParams.get('u').replace(/-([0-9A-F]{2})/g,(m,x)=>String.fromCharCode(parseInt(x,16))).replace(/_/g,'/');via='Proofpoint-Schutzlink'}
  else if(/urldefense\.com$/.test(h)){const m=u.match(/__(.+?)__/);if(m){inner=m[1];via='Proofpoint-Schutzlink'}}
  else if(/(^|\.)l\.facebook\.com$|(^|\.)lm\.facebook\.com$/.test(h)){inner=url.searchParams.get('u');via='Facebook-Weiterleitung'}
  else{for(const k of ['url','u','q','target','redirect','redirect_uri','redirect_url','dest','destination','link','goto','to','next','return','returnurl','continue','r']){const v=[...url.searchParams].find(([kk])=>kk.toLowerCase()===k)?.[1];
    if(v&&/^https?:\/\//i.test(v)){inner=v;via=`Weiterleitung im Parameter „${k}“`;break}
    if(v&&/^aHR0c/.test(v)){try{const dec=atob(v.replace(/-/g,'+').replace(/_/g,'/'));if(/^https?:\/\//.test(dec)){inner=dec;via=`Base64-versteckte Adresse im Parameter „${k}“`;break}}catch(e){}}}}
  if(inner){chain.push({from:u,via});return unwrap(inner,chain)}return {u,chain}}
export function linkCheck(input){
  let raw=input.trim().replace(/^<|>$/g,'').replace(/^hxxp/i,'http').replace(/\[\.\]/g,'.');if(!raw)return null;
  if(!/^[a-z][a-z0-9+.-]*:/i.test(raw))raw='http://'+raw;
  if(/^(javascript|data|vbscript|file):/i.test(raw))return {bad:true,f:[['err','Gefährlicher Linktyp',`Links mit <span class="mono">${esc(raw.split(':')[0])}:</span> führen Code aus oder öffnen lokale Dateien. Nicht anklicken.`]]};
  const uw=unwrap(raw);let url;try{url=new URL(uw.u)}catch(e){return {err:'Das ist keine gültige Webadresse.'}}
  const host=url.hostname.toLowerCase().replace(/\.$/,''),uh=uniHost(host),isIP=/^[\d.]+$/.test(host)||host.startsWith('['),rd=regDom(host),rdU=uniHost(rd),sub=host.slice(0,Math.max(0,host.length-rd.length-1));
  const F=[],add=(s,t,b='')=>F.push([s,t,b]);
  uw.chain.forEach(c=>add('info',`Entpackt: ${esc(c.via)}`,`Das eigentliche Ziel war in einem anderen Link versteckt. Geprüft wird das Ziel.`));
  if(url.username||url.password)add('err','Täuschung mit @-Zeichen',`Alles vor dem @ wird ignoriert (<span class="mono">${esc(decodeURIComponent(url.username))}</span>). Der Link führt tatsächlich zu <b>${esc(host)}</b>.`);
  if(url.protocol==='http:'&&/^http:/i.test(input.trim()))add('warn','Unverschlüsselte Verbindung (http)','Eingaben auf dieser Seite werden unverschlüsselt übertragen. Für Anmeldungen oder Zahlungen nie verwenden.');
  if(isIP)add('warn','IP-Adresse statt Domainname','Seriöse Unternehmen verlinken fast nie direkt auf eine IP-Adresse.');
  if(uh!==host){const lat=/[a-z]/i.test(uh.replace(/[^\p{L}]/gu,'')),cyr=/[Ѐ-ӿ]/.test(uh),grk=/[Ͱ-Ͽ]/.test(uh);
    add(cyr||grk?'err':'warn','Internationale Domain mit Sonderzeichen',`Angezeigt als <b>${esc(uh)}</b>, technisch <span class="mono">${esc(host)}</span>.${(lat&&(cyr||grk))?' Lateinische und kyrillische bzw. griechische Buchstaben sind gemischt. So entstehen Domains, die exakt wie bekannte Namen aussehen.':''}`)}
  const label=rdU.split('.')[0],sk=skel(label);
  const hosted=!isIP&&USER_HOSTED.find(([d])=>host.endsWith('.'+d)||(host===d&&(d.split('.').length>=3||/^(1drv\.ms|forms\.gle)$/.test(d))));
  const official=!hosted&&Object.entries(BRANDS).find(([b,ds])=>ds.includes(rd));
  const subToks=sub.split(/[.\-_]/).filter(Boolean).map(skel);
  const subBrand=!isIP&&Object.keys(BRANDS).find(b=>(!official||b!==official[0])&&(subToks.includes(b)||(b.length>=6&&subToks.some(t=>t.includes(b)))));
  const fakeDom=sub.match(/(?:^|\.)((?!www\.)[a-z0-9-]{3,}\.(?:com|de|net|org|info|biz))(?:\.|$)/i);
  if(hosted)add('warn',`Seite auf ${esc(hosted[1])}`,`Auf dieser Plattform kann jeder eigene Seiten, Formulare oder Dateien veröffentlichen. Die Adresse wirkt seriös, der Inhalt stammt aber von irgendeinem Nutzer und nicht vom Betreiber. Genau deshalb wird sie gern für Phishing genutzt.`);
  if(official){
    if(subBrand)add('err',`Fremder Markenname „${brandName(subBrand)}“ vor einer ${brandName(official[0])}-Domain`,`Die Adresse gehört technisch zu <b>${esc(rdU)}</b>. Echte Seiten von ${brandName(subBrand)} liegen nie unter der Domain eines anderen Unternehmens. Entweder existiert diese Adresse gar nicht, oder jemand will täuschen.`);
    else add('ok',`Domain gehört zu ${brandName(official[0])}`,'Laut der eingebauten Liste ist das eine offizielle Domain. Trotzdem auf den Zusammenhang achten.');
  }
  else if(!isIP&&!hosted){const toks=label.split(/[-_]/).map(skel);
    const hit=Object.keys(BRANDS).find(b=>sk===b||toks.includes(b)||(b.length>=6&&sk.includes(b))||(b.length>=6&&lev(sk,b)<=2)||(b.length>=5&&lev(sk,b)<=1));
    const regional=hit&&/sparkasse|volksbank/.test(hit)&&rd.endsWith('.de')&&toks.includes(hit)&&!uw.chain.length&&uh===host;
    if(regional)add('warn',`Enthält „${brandName(hit)}“`,`Regionale ${brandName(hit)}n nutzen eigene Domains wie <span class="mono">${hit}-ort.de</span>, das kann also echt sein. Betrüger nutzen das gleiche Muster. Nur vertrauen, wenn die Adresse von der Bankkarte, einem Brief oder der bekannten Startseite stammt.`);
    else if(hit)add('err',`Ähnelt ${brandName(hit)}, ist es aber nicht`,`Die eigentliche Domain ist <b>${esc(rdU)}</b>. ${brandName(hit)} nutzt ${BRANDS[hit].slice(0,3).map(d=>`<span class="mono">${d}</span>`).join(', ')}.${/sparkasse|volksbank/.test(hit)?' Regionale Sparkassen und Volksbanken haben eigene Domains. Im Zweifel über die bekannte Startseite gehen.':''}`);
    if(subBrand&&subBrand!==hit&&!hit)add('err',`Markenname „${brandName(subBrand)}“ nur als Tarnung vorne`,`Der Teil <span class="mono">${esc(sub)}</span> ist frei wählbar. Entscheidend ist, was direkt vor der Endung steht: <b>${esc(rdU)}</b>.`)}
  else if(hosted&&subBrand&&hosted[0]==='sharepoint.com')add('warn',`Freigabe im Namen „${brandName(subBrand)}“`,`Bei SharePoint steht vor .sharepoint.com der Name des Microsoft-Kunden, der die Datei teilt. Das kann echt sein. Prüfen, ob der Name genau zum erwarteten Absender passt, und im Zweifel nachfragen.`);
  else if(hosted&&subBrand)add('err',`Markenname „${brandName(subBrand)}“ auf einer Fremdplattform`,`Echte Seiten von ${brandName(subBrand)} liegen nicht auf ${esc(hosted[1])}. Das ist ein Täuschungsversuch.`);
  if(fakeDom)add(subBrand?'info':'warn','Zweite Domain im vorderen Teil versteckt',`<span class="mono">${esc(fakeDom[1])}</span> steht nur im frei wählbaren Vorderteil. Man liest von links und sieht eine bekannte Adresse, entscheidend ist aber das Ende: <b>${esc(rdU)}</b>.`);
  if(SHORT.includes(rd)||SHORT.includes(host))add('warn','Kurzlink','Das tatsächliche Ziel ist nicht sichtbar. Kurzlinks werden gern genutzt, um Phishing-Seiten zu verstecken.');
  const tld=rd.split('.').pop();if(RISKY_TLD.includes(tld))add('warn',`Auffällige Endung „.${esc(tld)}“`,'Unter dieser Endung werden überdurchschnittlich viele Betrugsseiten registriert. Für sich allein kein Beweis.');
  if(sub.split('.').filter(Boolean).length>=3)add('warn','Viele Subdomains','Lange Ketten vor der eigentlichen Domain sollen oft vertraute Namen vortäuschen.');
  if(url.port&&!['80','443'].includes(url.port))add('info',`Ungewöhnlicher Port ${esc(url.port)}`,'Bei internen Systemen normal (z. B. Plesk auf 8443), in Mails an Kundschaft eher ungewöhnlich.');
  const ext=(url.pathname.match(/\.([a-z0-9]{2,5})$/i)||[])[1]?.toLowerCase();
  if(ext&&['exe','scr','msi','bat','cmd','js','vbs','jar','apk','iso','img','zip','rar','7z','lnk','hta','one','ps1','wsf','dmg'].includes(ext))add('warn',`Lädt direkt eine Datei herunter (.${esc(ext)})`,'Dateien dieses Typs können Schadsoftware enthalten. Nur öffnen, wenn der Download erwartet wird.');
  if((!official||subBrand||fakeDom)&&BAIT.test(url.hostname+url.pathname))add('info','Typische Köderwörter','Begriffe wie „login“, „konto“ oder „verify“ in der Adresse sind bei Phishing häufig.');
  const lvl=F.some(x=>x[0]==='err')?'err':F.some(x=>x[0]==='warn')?'warn':'ok';
  return {url,host,uh,rd,rdU,sub,F,lvl,hosted,chain:uw.chain,final:uw.u};
}
export const LK_SVC=[
  {name:'VirusTotal',desc:'Über 70 Virenscanner und Sperrlisten auf einmal.',how:'Link wird direkt übergeben.',url:r=>'https://www.virustotal.com/gui/search/'+encodeURIComponent(encodeURIComponent(r.final))},
  {name:'ESET Link Checker',desc:'Datenbank des Virenschutz-Herstellers ESET.',how:'Link wird kopiert, dort mit Strg + V einfügen.',copy:true,url:()=>'https://www.eset.com/de/home/link-checker/'},
  {name:'Google Safe Browsing',desc:'Die Warnliste hinter Chrome und Firefox.',how:'Link wird direkt übergeben.',url:r=>'https://transparencyreport.google.com/safe-browsing/search?url='+encodeURIComponent(r.host+(r.url.pathname||''))+'&hl=de'},
  {name:'urlscan.io',desc:'Frühere Scans dieser Domain mit Screenshots.',how:'Zeigt den Verlauf der Domain.',url:r=>'https://urlscan.io/domain/'+encodeURIComponent(r.host)},
  {name:'Fakeshop-Finder',desc:'Verbraucherzentrale, für Online-Shops.',how:'Link wird kopiert, dort einfügen.',copy:true,url:()=>'https://www.verbraucherzentrale-niedersachsen.de/fakeshop-finder'},
];
const ML_CACHE={};
// microlink über Go (AdminKit ruft den Link selbst nie auf); Antwort im Format des Portals
async function microlink(ctx,u){if(ML_CACHE[u])return ML_CACHE[u];
  try{const p=await ctx.net.preview(u);const j={status:'success',data:{title:p.title,description:p.description,url:p.final_url||u,screenshot:p.screenshot?{url:p.screenshot}:null},redirects:(p.redirects||[]).map(x=>({url:x})),statusCode:p.status};ML_CACHE[u]=j;return j}
  catch(e){return {status:'error',message:String(e)}}}
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function brandInText(txt){if(!txt)return null;for(const b of Object.keys(BRANDS)){const n=brandName(b);const re=n.length<=3?new RegExp('(^|[^A-Za-z])'+reEsc(n)+'([^A-Za-z]|$)'):new RegExp('(^|[^a-zäöü])'+reEsc(n),'i');if(re.test(txt))return b}return null}
function mshot(u,img,cap){let n=0;const go=()=>{img.onload=()=>{if(img.naturalWidth===400&&img.naturalHeight===300&&n<8){n++;cap.textContent=`Screenshot wird erstellt … (${n})`;setTimeout(go,4000)}else{img.parentElement.classList.remove('loading-shot');cap.textContent='Screenshot von WordPress mShots. Die Seite wurde dort geöffnet, nicht auf diesem Rechner.'}};
  img.onerror=()=>{img.parentElement.classList.add('no-shot');cap.textContent='Es konnte kein Screenshot erstellt werden.'};img.src='https://s.wordpress.com/mshots/v1/'+encodeURIComponent(u)+'?w=1280&h=800&n='+n};go()}
async function dnsItem(ctx,host){if(!ctx.net.allowed('dns'))return ['info','DNS-Prüfung abgeschaltet','In den Einstellungen sind DNS-Abfragen ausgeschaltet.'];try{const q=(n,t)=>ctx.net.dns(n,t,'system');const [a,aaaa,cn]=await Promise.all([q(host,'A'),q(host,'AAAA'),q(host,'CNAME')]);
    const ip=(a.Answer||[]).find(x=>x.type===1);const ex=ip||(aaaa.Answer||[]).length||(cn.Answer||[]).length;
    if(a.Status===3)return ['err','Diese Adresse existiert nicht',`Für <span class="mono">${esc(host)}</span> gibt es keinen DNS-Eintrag, der Link führt ins Leere. Bei verdächtigen Mails heißt das oft: Die Betrugsseite ist schon abgeschaltet oder die Adresse ist nur Tarnung.`];
    if(!ex)return ['warn','Kein Server hinterlegt','Der Name existiert, zeigt aber auf keinen Server.'];
    return ['info','Adresse ist im DNS eingetragen',`Sie zeigt auf ${ip?`<span class="mono">${esc(ip.data)}</span>`:'einen Server'}. Das sagt nichts darüber aus, ob die Seite seriös ist.`]}
  catch(e){return ['warn','DNS-Abfrage nicht möglich','Keine Internetverbindung oder der DNS-Server antwortet nicht.']}}
async function ageItem(ctx,r){if(r.hosted)return ['info','Domainalter hier nicht aussagekräftig',`Die Domain gehört der Plattform ${esc(r.hosted[1])}, nicht dem Ersteller der Seite.`];
  if(/^[\d.:\[\]]+$/.test(r.rd))return null;
  try{const j=await ctx.net.rdap(r.rd);
    if(j.not_found)return ['warn','Domain ist nicht registriert','Der Registrierungsdienst kennt diese Domain nicht. Der Link führt ins Leere oder die Domain wurde schon gelöscht.'];
    if(!j.registered||j.registered.startsWith('0001'))return ['info','Registrierungsdatum nicht veröffentlicht',`Die Vergabestelle für .${esc(r.rd.split('.').pop())} gibt das Datum nicht heraus.`];
    const d=new Date(j.registered),days=Math.max(0,Math.floor((Date.now()-d)/86400000));
    return days<30?['err',`Domain erst vor ${days} Tag${days===1?'':'en'} registriert`,`Registriert am ${fmtDate.format(d)}. Ganz neue Domains sind typisch für Phishing-Wellen.`]
      :days<180?['warn',`Domain ist erst ${Math.max(1,Math.round(days/30))} Monate alt`,`Registriert am ${fmtDate.format(d)}. Junge Domains sind häufiger an Betrug beteiligt.`]
      :['ok',`Domain besteht seit ${d.getFullYear()}`,`Registriert am ${fmtDate.format(d)}. Ein hohes Alter spricht eher für Seriosität, ist aber keine Garantie.`]}
  catch(e){return ['info','Domainalter nicht abrufbar',r.rd.endsWith('.de')?'Für .de-Domains veröffentlicht die DENIC kein Registrierungsdatum.':esc(String(e).replace(/^Error: /,''))]}}
function mshotOff(img,cap){img.parentElement.classList.remove('loading-shot');img.parentElement.classList.add('no-shot');cap.textContent='Kein Screenshot: Unter dieser Adresse gibt es keine Seite.'}
async function linkOnline(ctx,r,box,target){
  box.innerHTML=`<div class="ol"><figure class="shot loading-shot"><img alt="Screenshot der Zielseite"><figcaption>Screenshot wird erstellt …</figcaption></figure><div class="chks" id="olChk"><div class="loading">Wird online geprüft …</div></div></div>`;
  const img=box.querySelector('img'),cap=box.querySelector('figcaption'),items=[];
  const [ml,dn,ag]=await Promise.all([microlink(ctx,target),dnsItem(ctx,r.host),ageItem(ctx,r)]);
  const dead=dn&&dn[0]==='err';
  if(dead){mshotOff(img,cap);}
  else if(ml&&ml.status==='success'){const d=ml.data||{};
    if(d.screenshot&&d.screenshot.url){img.onload=()=>{img.parentElement.classList.remove('loading-shot');cap.innerHTML=`Screenshot von microlink.io. Die Seite wurde dort geöffnet, nicht auf diesem Rechner. <a href="#" data-open="${esc(d.screenshot.url)}">Groß anzeigen</a>`};img.onerror=()=>mshot(target,img,cap);img.src=d.screenshot.url}else mshot(target,img,cap);
    const fin=d.url||target;let fu;try{fu=new URL(fin)}catch(e){}
    const chain=(ml.redirects||[]).map(x=>x.url).filter(Boolean);
    if(fu&&regDom(fu.hostname)!==r.rd){const fr=linkCheck(fin);const bad=fr&&fr.F?fr.F.filter(x=>x[0]==='err'||x[0]==='warn'):[];
      items.push([fr&&fr.lvl==='err'?'err':'warn','Leitet auf eine andere Domain weiter',`Endziel: <b>${esc(fu.hostname)}</b>${chain.length?`<div class="chain">${[target,...chain.slice(1),fin].filter((v,i,a)=>a.indexOf(v)===i).map(u=>`<span class="mono">${esc(u.length>70?u.slice(0,70)+'…':u)}</span>`).join(' → ')}</div>`:''}${bad.length?'<br>Auffällig am Endziel: '+bad.map(x=>x[1]).join(', ')+'.':''}`])}
    else if(chain.length>1)items.push(['info',`${chain.length-1} Weiterleitung${chain.length>2?'en':''} innerhalb derselben Domain`,`Endziel: <span class="mono">${esc(fin.length>90?fin.slice(0,90)+'…':fin)}</span>`]);
    let title=(d.title||'').trim();try{const uu=new URL(target);if(title===uu.host||title===uu.hostname||uu.href.endsWith(title))title=''}catch(e){}const desc=(d.description||'').trim(),frd=fu?regDom(fu.hostname):r.rd;
    const tb=brandInText(title)||brandInText(desc);const offi=tb&&BRANDS[tb].includes(frd);
    const bait=/anmeld|login|log in|sign in|konto|account|verif|bestätig|sicherheit|security|passwort|password|zahlung|payment/i.test(title+' '+desc);
    if(/sign in to your account|bei ihrem konto anmelden|microsoft 365.*(anmelden|sign)/i.test(title)&&!['microsoft.com','microsoftonline.com','live.com','office.com','outlook.com'].includes(frd))
      items.push(['err','Kopie der Microsoft-Anmeldeseite',`Der Seitentitel lautet „${esc(title)}“, wie bei der echten Microsoft-Anmeldung. Die Seite liegt aber auf <b>${esc(frd)}</b>. Typisch für das Abgreifen von Microsoft-365-Zugängen.`]);
    else if(tb&&!offi)items.push([bait||r.hosted?'err':'warn',`Seite gibt sich als ${brandName(tb)} aus`,`Seitentitel: „${esc(title||desc)}“. Die Seite liegt aber nicht auf einer Domain von ${brandName(tb)}, sondern auf <b>${esc(frd)}</b>.${bait?' Zusammen mit Begriffen wie „Anmelden“ oder „Konto“ ist das ein starkes Phishing-Zeichen.':''}`]);
    else if(title)items.push(['info','Seitentitel',`„${esc(title.length>120?title.slice(0,120)+'…':title)}“`]);
    if(ml.statusCode>=400)items.push(['info',`Server antwortet mit Fehler ${ml.statusCode}`,'Die Seite ist nicht (mehr) abrufbar, zum Beispiel abgeschaltet oder gesperrt.']);
  }else{mshot(target,img,cap);
    items.push(['info','Ziel und Seitentitel nicht abrufbar',ml&&/rate|limit|429|ERATE/i.test((ml.code||'')+(ml.message||''))?'Das kostenlose Tageskontingent von microlink.io ist aufgebraucht. Screenshot kommt ersatzweise von WordPress mShots.':`microlink.io konnte die Seite nicht laden${ml&&ml.message?' ('+esc(String(ml.message).slice(0,80))+')':''}. Screenshot kommt ersatzweise von WordPress mShots.`])}
  items.push(dn);if(ag)items.push(ag);
  const lvl=items.some(x=>x[0]==='err')?'err':items.some(x=>x[0]==='warn')?'warn':'ok';
  const V={err:['err','x','Online-Prüfung bestätigt Warnzeichen'],warn:['warn','alert','Online-Prüfung: einige Auffälligkeiten'],ok:['ok','check','Online-Prüfung unauffällig']}[lvl];
  $('#olChk',box).innerHTML=`<div class="ol-v ${V[0]}">${ic(V[1])}<b>${V[2]}</b></div>`+items.map(x=>chk(...x)).join('');
}
export default {
  id: 'link', name: 'Link-Prüfer', group: 'Sicherheit & Passwörter', tags: ['Phishing', 'Sicherheit', 'Prüfen'], icon: 'shield',
  keys: 'link url phishing prüfen sicher domain', online: true,
  render(p, ctx) {
  p.innerHTML=`<div class="util wide"><h3>Link-Prüfer</h3><p>Zeigt, wohin ein Link wirklich führt, und sucht nach typischen Tricks von Phishing-Mails. Der Link wird dabei nicht geöffnet.</p>
    <label class="field"><span class="sr">Link</span><input class="input mono-in" id="lkIn" value="${esc(lastLink)}" placeholder="Link einfügen, z. B. aus einer verdächtigen Mail (Rechtsklick > Link kopieren)" spellcheck="false" autocomplete="off"></label>
    <div id="lkOut" aria-live="polite"></div></div>`;
  const draw=()=>{lastLink=$('#lkIn',p).value;const r=linkCheck(lastLink),o=$('#lkOut',p);if(!r)return o.innerHTML='';if(r.err)return o.innerHTML=chk('err',r.err,'');
    if(r.bad)return o.innerHTML=r.f.map(x=>chk(...x)).join('');
    const V={err:['err','x','Deutliche Warnzeichen','Nicht anklicken und keine Daten eingeben.'],warn:['warn','alert','Vorsicht','Einige Merkmale sind auffällig. Nur öffnen, wenn Absender und Anlass sicher bekannt sind.'],ok:['ok','check','Keine typischen Warnzeichen in der Adresse','Das heißt nicht, dass der Link sicher ist. Die Online-Prüfung unten sieht sich auch die Seite selbst an.']}[r.lvl];
    const shown=r.uh!==r.host?r.uh:r.host;const subPart=shown.slice(0,Math.max(0,shown.length-r.rdU.length));
    o.innerHTML=`<div class="lk-host"><span>Dieser Link führt zu</span><div class="lk-dom"><i>${esc(r.url.protocol)}//</i>${subPart?`<i>${esc(subPart)}</i>`:''}<b>${esc(r.rdU)}</b><i>${esc((r.url.port?':'+r.url.port:'')+r.url.pathname.slice(0,60))}${r.url.pathname.length>60?'…':''}</i></div>
        <small>Entscheidend ist immer der hervorgehobene Teil direkt vor dem ersten Schrägstrich.</small></div>
      <div class="verdict ${V[0]}"><div class="v-i">${ic(V[1])}</div><div><span>Einschätzung der Adresse</span><h4>${V[2]}</h4><p>${V[3]}</p></div></div>
      <div class="chks">${r.F.map(x=>chk(...x)).join('')||chk('ok','Keine Auffälligkeiten in der Adresse','')}</div>
      <div class="sub"><h5>Online-Prüfung</h5>
        ${ctx.net.allowed('link_services')?`<div class="row"><button class="btn primary" type="button" id="lkOn">${ic('globe')}Online prüfen: Screenshot, Ziel und Domainalter</button>${ctx.config.api_keys?.urlscan?`<button class="btn" type="button" id="lkScan">${ic('search')}Frühere Scans (urlscan.io)</button>`:''}</div>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="lkStrip"${stripParams?' checked':''}>Parameter vor dem Senden entfernen (Teil nach „?“ und „#“)</label>
        <p class="note" style="margin-top:8px">AdminKit öffnet den Link nie selbst – sonst sähe der Betreiber die IP-Adresse dieses Anschlusses. Die Seite wird auf den Servern von microlink.io geöffnet. Dafür wird der Link übertragen. Parameter können persönliche Daten enthalten (Tracking-IDs, Namen, Tokens) und werden deshalb standardmäßig entfernt. Bei Links zum Zurücksetzen eines Passworts oder zum Abbestellen ganz verzichten: Schon das Aufrufen kann die Aktion auslösen.</p>`
        :`<p class="note">Die Online-Prüfung ist in den Einstellungen (Online-Funktionen → Link-Dienste) abgeschaltet. Die Offline-Analyse oben ist vollständig.</p>`}
        <div id="lkOnline"></div></div>
      <div class="sub"><h5>Bei Sicherheitsdiensten nachprüfen</h5>
        <div class="svc">${LK_SVC.map((s,i)=>`<a class="svc-c" href="#" data-svc="${i}"><strong>${s.name}${ic('ext')}</strong><span>${s.desc}</span><em>${s.how}</em></a>`).join('')}</div>
        <p class="note" style="margin-top:8px">Diese Dienste kennen vor allem Seiten, die schon gemeldet wurden. Ganz neue Phishing-Seiten erscheinen dort oft noch als unbedenklich.</p></div>
      <div class="row" style="margin-top:18px"><button class="btn" type="button" data-copy="${esc(r.final.replace(/^http/i,'hxxp').replace(/\./g,'[.]'))}">${ic('copy')}Entschärft kopieren (für Tickets)</button>
        <button class="btn ghost" type="button" id="lkGuide">${ic('bookopen')}Ratgeber für Kunden erstellen</button></div>
      <p class="note">„Entschärft“ ersetzt http durch hxxp und Punkte durch [.], damit niemand den Link versehentlich anklickt.</p>`;
    const target=()=>stripParams?stripUrl(r.final):r.final;
    const on=$('#lkOn',o);if(on)on.onclick=e=>{e.currentTarget.disabled=true;linkOnline(ctx,r,$('#lkOnline',o),target()).finally(()=>{const b=$('#lkOn',o);if(b){b.disabled=false;b.innerHTML=ic('refresh')+'Erneut online prüfen'}})};
    const st=$('#lkStrip',o);if(st)st.onchange=e=>{stripParams=e.target.checked;ctx.state.set('linkStrip',stripParams)};
    const sc=$('#lkScan',o);if(sc)sc.onclick=async()=>{const box=$('#lkOnline',o);box.innerHTML='<div class="loading">urlscan.io wird gefragt …</div>';
      try{const hits=await ctx.net.urlscan(r.host);box.innerHTML=hits&&hits.length?`<div class="chks">${hits.map(h=>chk(h.malicious?'err':'info',`${h.malicious?'Als gefährlich eingestuft':'Scan'} vom ${esc(new Date(h.time).toLocaleDateString('de-DE'))}`,`<span class="mono">${esc(h.url.slice(0,90))}</span><br><a href="#" data-open="${esc(h.result)}">Bericht ansehen</a>${h.screenshot?` · <a href="#" data-open="${esc(h.screenshot)}">Screenshot</a>`:''}`)).join('')}</div>`:chk('info','Keine früheren Scans','urlscan.io kennt diese Domain noch nicht.')}
      catch(e){box.innerHTML=chk('warn','urlscan.io nicht abrufbar',esc(String(e)))}};
    $('#lkGuide',o).onclick=()=>ctx.openTool('guide');
    o.querySelectorAll('[data-svc]').forEach(a=>a.addEventListener('click',ev=>{ev.preventDefault();const s=LK_SVC[+a.dataset.svc];if(s.copy)ctx.copy(r.final,'Link kopiert. Auf der geöffneten Seite mit Strg + V einfügen.');ctx.open(s.url(r))}))};
  // Links in Ergebnissen (Screenshot, Berichte) im Standardbrowser öffnen
  p.addEventListener('click',e=>{const a=e.target.closest('a[data-open]');if(a){e.preventDefault();ctx.open(a.dataset.open)}});
  let stripParams=ctx.state.get('linkStrip',true);
  $('#lkIn',p).addEventListener('input',draw);draw();
  },
};

