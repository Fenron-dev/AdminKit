// DNS & Mail-Check – Auswertung 1:1 aus dem Ideler-Portal. In AdminKit laufen
// die Abfragen über Go mit wählbarem Resolver; neu: Resolver-Vergleich,
// SMTP-Verbindungstest, Autodiscover und Ablage in der Session.
import { $, esc, ic, chk, segHTML, onSeg } from '../ui.js';

export const DNS_T={A:1,NS:2,CNAME:5,SOA:6,PTR:12,MX:15,TXT:16,AAAA:28,SRV:33,CAA:257};
const DNSST={mode:'mail',domain:'',sel:'',qn:'',qt:'MX'};
let CTX=null,RESOLVER='system';
// Für Tests: Kontext mit simuliertem ctx.net.dns setzen
export function setContext(c){CTX=c}
// DNS über Go statt DoH im Browser – gleiches Antwortformat, Resolver wählbar
export async function doh(name,type,server){return CTX.net.dns(name,type,server||RESOLVER)}
export const txtVal=d=>{const m=String(d).match(/"((?:[^"\\]|\\.)*)"/g);return m?m.map(s=>s.slice(1,-1).replace(/\\(.)/g,'$1')).join(''):String(d)};
export async function rr(name,type,server){const j=await doh(name,type,server);return {status:j.Status,ans:(j.Answer||[]).filter(a=>a.type===DNS_T[type])}}
export const cleanDomain=s=>String(s||'').trim().toLowerCase().replace(/^.*@/,'').replace(/^[a-z]+:\/\//,'').replace(/[\/?#:].*$/,'').replace(/\.$/,'');
export const revName=ip=>ip.includes(':')?null:ip.split('.').reverse().join('.')+'.in-addr.arpa';
export async function spfCount(rec,depth,seen){let n=0;for(const t of rec.split(/\s+/).slice(1)){const m=t.replace(/^[+\-~?]/,'');
  if(/^(a|mx|ptr|exists)(:|\/|$)/i.test(m))n++;const inc=m.match(/^include:(.+)$/i)||m.match(/^redirect=(.+)$/i);
  if(inc){n++;const d=inc[1];if(depth<5&&!seen.has(d)){seen.add(d);try{const r=await rr(d,'TXT');const s=r.ans.map(a=>txtVal(a.data)).find(v=>/^v=spf1\b/i.test(v));if(s)n+=await spfCount(s,depth+1,seen)}catch(e){}}}}return n}
export async function mailCheck(domain,selector){
  const [mx,txt,dm,a]=await Promise.all([rr(domain,'MX'),rr(domain,'TXT'),rr('_dmarc.'+domain,'TXT'),rr(domain,'A').catch(()=>({ans:[]}))]);
  if(mx.status===3&&!a.ans.length)return {nx:true};
  const R=[];let score={ok:0,warn:0,err:0};const add=(st,t,b)=>{R.push(chk(st,t,b));if(score[st]!=null)score[st]++};
  // MX
  const mxs=mx.ans.map(x=>{const [pr,...h]=String(x.data).split(/\s+/);return {pr:+pr,h:h.join(' ').replace(/\.$/,'')}}).sort((x,y)=>x.pr-y.pr);
  if(mxs.length===1&&(!mxs[0].h||mxs[0].h==='.'))add('warn','Domain nimmt keine Mails an','Es ist ein „Null-MX“ eingetragen. Das ist Absicht, wenn über diese Domain keine Mails empfangen werden sollen.');
  else if(mxs.length)add('ok',`Mailserver (MX): ${mxs.length===1?'1 Eintrag':mxs.length+' Einträge'}`,`<ul class="plain">${mxs.map(x=>`<li><span class="mono">${esc(x.h)}</span> <span class="muted">Priorität ${x.pr}</span></li>`).join('')}</ul>`);
  else add('err','Kein Mailserver (MX) eingetragen','An diese Domain kann niemand Mails schicken. Im DNS muss ein MX-Eintrag auf den Mailserver zeigen.');
  // SPF
  const spfs=txt.ans.map(x=>txtVal(x.data)).filter(v=>/^v=spf1\b/i.test(v));
  if(!spfs.length)add('warn','Kein SPF-Eintrag','Ohne SPF kann der Empfänger nicht prüfen, welche Server für diese Domain senden dürfen. Mails landen dadurch eher im Spam oder werden abgelehnt.');
  else if(spfs.length>1)add('err','Mehrere SPF-Einträge',`Es darf nur einen geben, sonst ist SPF ungültig. Die Einträge müssen zu einem zusammengefasst werden.${spfs.map(s=>`<code class="rec">${esc(s)}</code>`).join('')}`);
  else{const s=spfs[0],all=(s.match(/(?:^|\s)([+\-~?]?)all\b/i)||[])[1];const n=await spfCount(s,0,new Set());
    const q={'-':['ok','Strikt (-all): Fremde Server werden abgelehnt.'],'~':['ok','Weich (~all): Fremde Server werden als verdächtig markiert. Gängige Einstellung.'],'?':['warn','Neutral (?all): Fremde Server werden weder abgelehnt noch markiert. Schützt kaum.'],'+':['err','+all: Jeder Server der Welt darf senden. Das hebelt SPF komplett aus.'],'':['err','+all: Jeder Server der Welt darf senden. Das hebelt SPF komplett aus.']};
    const [st,txtAll]=all===undefined?['warn','Ohne „all“ am Ende ist unklar, was mit fremden Servern passiert.']:q[all];
    const lk=n>10?`<b style="color:var(--red)">${n} DNS-Abfragen, erlaubt sind 10.</b> Der Eintrag ist dadurch ungültig (PermError).`:`${n} von maximal 10 DNS-Abfragen.`;
    add(n>10?'err':st,'SPF vorhanden',`<code class="rec">${esc(s)}</code>${txtAll} ${lk}${/\bptr\b/i.test(s)?' Der Mechanismus „ptr“ ist veraltet und sollte entfernt werden.':''}`)}
  // DMARC
  const dms=dm.ans.map(x=>txtVal(x.data)).filter(v=>/^v=DMARC1/i.test(v));
  if(!dms.length)add('warn','Kein DMARC-Eintrag','Große Anbieter wie Gmail und Yahoo verlangen seit 2024 von Massenversendern einen DMARC-Eintrag, und auch sonst landen Mails ohne ihn eher im Spam. Einstieg: <code class="rec">_dmarc  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@'+esc(domain)+'"</code>');
  else{const t=Object.fromEntries(dms[0].split(';').map(x=>x.trim().split('=')).filter(x=>x[0]).map(([k,...v])=>[k.toLowerCase(),v.join('=')]));
    const pol={none:['info','Richtlinie „none“: nur beobachten. Gefälschte Mails werden noch nicht aussortiert. Gut zum Einstieg, später auf „quarantine“ erhöhen.'],quarantine:['ok','Richtlinie „quarantine“: Mails, die die Prüfung nicht bestehen, landen im Spam.'],reject:['ok','Richtlinie „reject“: Mails, die die Prüfung nicht bestehen, werden abgelehnt. Bester Schutz vor Fälschungen.']}[(t.p||'').toLowerCase()]||['warn','Unbekannte Richtlinie.'];
    add(pol[0],'DMARC vorhanden',`<code class="rec">${esc(dms[0])}</code>${pol[1]}${t.rua?'':' Es ist keine Berichtsadresse (rua) eingetragen, du erfährst also nicht, wer in eurem Namen sendet.'}${t.pct&&t.pct!=='100'?` Gilt nur für ${esc(t.pct)} % der Mails.`:''}`)}
  // DKIM
  const sels=[...new Set([selector,'default','selector1','selector2','google','k1','s1','s2','dkim','mail'].filter(Boolean))];
  const dk=(await Promise.all(sels.map(s=>rr(`${s}._domainkey.${domain}`,'TXT').then(r=>[s,r.ans.map(x=>txtVal(x.data)).find(v=>/p=/.test(v))]).catch(()=>[s,null])))).filter(x=>x[1]);
  if(dk.length){add('ok',`DKIM gefunden: ${dk.map(x=>esc(x[0])).join(', ')}`,dk.map(([s,v])=>{const pk=(v.match(/p=([A-Za-z0-9+/=]*)/)||[])[1]||'';const ed=/k=ed25519/i.test(v);
      const bits=ed?'Ed25519':!pk?'Schlüssel zurückgezogen (leer)':pk.length<240?'ca. 1024 Bit (veraltet, besser 2048)':pk.length<500?'ca. 2048 Bit':'ca. 4096 Bit';return `<div><span class="mono">${esc(s)}._domainkey</span>: ${bits}</div>`}).join(''))}
  else add('info','DKIM unter gängigen Selektoren nicht gefunden',`Das muss nichts heißen: Der Selektor kann beliebig heißen. Er steht im Header einer versendeten Mail unter <span class="mono">DKIM-Signature: … s=<b>selektor</b></span>. Diesen oben eintragen und erneut prüfen. Geprüft: ${sels.map(esc).join(', ')}.`);
  // PTR
  if(mxs.length&&mxs[0].h&&mxs[0].h!=='.'){try{const ip=(await rr(mxs[0].h,'A')).ans[0]?.data;if(ip){const pt=(await rr(revName(ip),'PTR')).ans[0]?.data?.replace(/\.$/,'');
    add(pt?'ok':'warn',`Mailserver-IP ${esc(ip)}`,(pt?`Rückwärtsauflösung (PTR): <span class="mono">${esc(pt)}</span>.`:'Keine Rückwärtsauflösung (PTR) gefunden. Für einen Server, der auch Mails versendet, ist das ein häufiger Grund für Ablehnungen.')+
      ` <a href="#" data-open="https://mxtoolbox.com/SuperTool.aspx?action=blacklist%3a${encodeURIComponent(ip)}">Sperrlisten bei MXToolbox prüfen</a> (öffnet eine externe Seite).`)}}catch(e){}}
  return {R,score,mxs};
}

// ── Ergänzungen in AdminKit ────────────────────────────────────────────────

const fmtD=d=>{const x=new Date(d);return isNaN(x)||x.getFullYear()<2000?'–':x.toLocaleDateString('de-DE')};

export function smtpHTML(s){
  const head=`${esc(s.host)}:${s.port}`;
  if(!s.connected){
    if(s.blocked&&s.port===25)return chk('warn',`Port 25 nicht erreichbar (${head})`,'Zeitüberschreitung beim Verbindungsaufbau. Viele Internetanbieter sperren ausgehenden Port 25 für Privat- und Geschäftsanschlüsse. Für den Versand aus Mailprogrammen werden ohnehin 587 (STARTTLS) oder 465 (SSL/TLS) genutzt.');
    return chk('err',`Keine Verbindung zu ${head}`,esc(s.error||'unbekannter Fehler')+(s.blocked?' – Zeitüberschreitung, Port evtl. gesperrt (Firewall/Provider).':''));
  }
  const rows=[['Banner',s.banner],['Verschlüsselung',s.tls?`${s.tls_version}${s.port===465?' (direktes TLS)':' (STARTTLS)'}`:(s.starttls?'STARTTLS angeboten, Aufbau fehlgeschlagen':'keine – STARTTLS wird nicht angeboten')]];
  if(s.tls){rows.push(['Zertifikat',`${esc(s.cert_cn||'–')}${s.cert_san&&s.cert_san.length?' · '+esc(s.cert_san.slice(0,4).join(', ')):''}`],['Aussteller',s.cert_issuer||'–'],['Gültig bis',fmtD(s.cert_until)]);}
  const st=!s.tls?'warn':s.cert_ok?'ok':'warn';
  const t=!s.tls?`Verbunden mit ${head}, aber ohne Verschlüsselung`:s.cert_ok?`Verbunden mit ${head}, verschlüsselt, Zertifikat gültig`:`Verbunden mit ${head}, Zertifikat-Problem: ${esc(s.cert_error||'')}`;
  return chk(st,t,`<dl class="kv">${rows.map(([k,v])=>`<dt>${k}</dt><dd style="text-align:left;justify-content:flex-start">${k==='Zertifikat'?v:esc(v)}</dd>`).join('')}</dl><span class="muted">${s.millis} ms</span>`);
}

export async function autodiscoverHTML(d){
  const q=async(n,t)=>{try{const r=await rr(n,t);return r.ans.map(a=>a.data)}catch(e){return []}};
  const [srv,cn,a,ac,acA]=await Promise.all([q('_autodiscover._tcp.'+d,'SRV'),q('autodiscover.'+d,'CNAME'),q('autodiscover.'+d,'A'),q('autoconfig.'+d,'CNAME'),q('autoconfig.'+d,'A')]);
  const items=[];
  if(srv.length)items.push(['ok','Autodiscover-SRV vorhanden',`<span class="mono">_autodiscover._tcp.${esc(d)}</span> → ${srv.map(esc).join(', ')}`]);
  if(cn.length)items.push([/outlook\.com\.?$/i.test(cn[0])?'ok':'info','autodiscover (CNAME)',`<span class="mono">autodiscover.${esc(d)}</span> → ${cn.map(esc).join(', ')}${/outlook\.com\.?$/i.test(cn[0])?' (Microsoft 365)':''}`]);
  else if(a.length)items.push(['info','autodiscover (A)',`<span class="mono">autodiscover.${esc(d)}</span> → ${a.map(esc).join(', ')}`]);
  if(!srv.length&&!cn.length&&!a.length)items.push(['warn','Kein Autodiscover-Eintrag','Outlook findet die Servereinstellungen dann nicht automatisch. Bei Microsoft 365: CNAME <span class="mono">autodiscover</span> → <span class="mono">autodiscover.outlook.com</span>. Bei anderen Hostern deren Vorgabe nutzen.']);
  if(ac.length||acA.length)items.push(['ok','Autoconfig (Thunderbird) vorhanden',`<span class="mono">autoconfig.${esc(d)}</span> → ${[...ac,...acA].map(esc).join(', ')}`]);
  else items.push(['info','Kein Autoconfig-Eintrag','Nur für Thunderbird relevant. Thunderbird fragt sonst die Mozilla-Datenbank oder probiert Standardnamen.']);
  return `<div class="chks">${items.map(x=>chk(...x)).join('')}</div>`;
}

const CMP_RECS=[['A',d=>d],['MX',d=>d],['NS',d=>d],['TXT',d=>d],['TXT',d=>'_dmarc.'+d]];
const normAns=r=>(r.Answer||[]).filter(a=>a.type===DNS_T[r._t]).map(a=>a.type===16?txtVal(a.data):a.data.replace(/\.$/,'').toLowerCase()).sort();

export async function compareHTML(d,s1,s2){
  const rows=[];
  for(const [t,f] of CMP_RECS){const n=f(d);
    const [a,b]=await Promise.all([doh(n,t,s1).then(r=>(r._t=t,r)).catch(e=>({err:String(e)})),doh(n,t,s2).then(r=>(r._t=t,r)).catch(e=>({err:String(e)}))]);
    const va=a.err?['Fehler']:normAns(a),vb=b.err?['Fehler']:normAns(b);const same=JSON.stringify(va)===JSON.stringify(vb);
    rows.push(`<tr class="${same?'':'diff'}"><td class="mono">${esc(n)}</td><td>${t}</td><td class="mono">${va.map(esc).join('<br>')||'–'}</td><td class="mono">${vb.map(esc).join('<br>')||'–'}</td><td>${same?'✓':'≠'}</td></tr>`)}
  const diff=rows.filter(r=>r.includes('class="diff"')).length;
  return chk(diff?'warn':'ok',diff?`${diff} Unterschied${diff>1?'e':''} zwischen ${esc(s1)} und ${esc(s2)}`:`Beide DNS-Server liefern dieselben Einträge`,
    (diff?'Unterschiede deuten auf einen veralteten Cache, Split-DNS (interne Zone) oder einen fehlerhaften Router-DNS hin. ':'')+
    `<div class="panel" style="overflow:auto;margin-top:8px"><table class="dns-t"><thead><tr><th>Name</th><th>Typ</th><th>${esc(s1)}</th><th>${esc(s2)}</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`);
}

const stripTags=h=>{const d=document.createElement('div');d.innerHTML=h;d.querySelectorAll('li,div,br,dd').forEach(x=>x.append(' '));return d.textContent.replace(/\s+/g,' ').trim()};
function mailMarkdown(d,r,extraEl){
  const lines=[`# Mail-Check ${d}`,'',`Geprüft am ${new Date().toLocaleString('de-DE')} über DNS-Server „${RESOLVER}“.`,'',`Ergebnis: ${r.score.ok} in Ordnung, ${r.score.warn} Hinweise, ${r.score.err} Probleme.`,''];
  const box=document.createElement('div');box.innerHTML=r.R.join('');
  box.querySelectorAll('.chk').forEach(c=>{const st=c.classList.contains('err')?'✗':c.classList.contains('warn')?'⚠':c.classList.contains('ok')?'✓':'ℹ';
    lines.push(`- ${st} **${c.querySelector('strong')?.textContent||''}**${c.querySelector('.chk-b')?': '+stripTags(c.querySelector('.chk-b').innerHTML):''}`)});
  if(extraEl&&extraEl.children.length){lines.push('','## Weitere Prüfungen','');extraEl.querySelectorAll('.chk').forEach(c=>lines.push(`- **${c.querySelector('strong')?.textContent||''}**${c.querySelector('.chk-b')?': '+stripTags(c.querySelector('.chk-b').innerHTML):''}`))}
  return lines.join('\n')+'\n';
}

export default {
  id: 'dns', name: 'DNS & Mail-Check', group: 'Netzwerk & Mail', icon: 'globe',
  keys: 'dns mx spf dkim dmarc ptr nslookup domain smtp autodiscover resolver', online: true,
  render(p, ctx) {
  CTX=ctx;
  const pre=ctx.takePrefill('dns');if(pre)Object.assign(DNSST,pre);
  p.innerHTML=`<div class="util wide"><h3>DNS &amp; Mail-Check</h3><p>Prüft, ob eine Domain richtig für E-Mail eingerichtet ist, oder fragt einzelne DNS-Einträge ab. Die Abfragen laufen über den gewählten DNS-Server: System, Kunden-DNS/Router oder öffentliche Resolver. Ein Vergleich zeigt kaputte Router-DNS, Split-DNS oder veraltete Einträge.</p>
    ${segHTML('dm',[['mail','Mail-Check'],['q','DNS-Abfrage']],DNSST.mode)}<div class="row dns-res"><label class="field"><span>DNS-Server</span><select class="input" id="dnsRes"></select></label><label class="field"><span>Vergleichen mit (optional)</span><select class="input" id="dnsCmp"></select></label>
      <div class="row" id="dnsCustom" hidden><input class="input" id="dnsCustomIP" placeholder="IP-Adresse des DNS-Servers" spellcheck="false"><button class="btn" type="button" id="dnsCustomOk">Übernehmen</button></div></div>
    <form id="dnsForm" class="dns-form" onsubmit="return false"></form><div id="dnsOut" aria-live="polite"></div><div id="dnsExtra"></div></div>`;
  const f=$('#dnsForm',p),out=$('#dnsOut',p);
  const drawForm=()=>{f.innerHTML=DNSST.mode==='mail'
    ?`<label class="field"><span>Domain oder E-Mail-Adresse</span><input class="input" name="d" value="${esc(DNSST.domain)}" placeholder="z. B. kunde-beispiel.de" spellcheck="false" required></label>
      <label class="field"><span>DKIM-Selektor (optional)</span><input class="input" name="s" value="${esc(DNSST.sel)}" placeholder="z. B. default" spellcheck="false"></label><button class="btn primary">${ic('search')}Prüfen</button>`
    :`<label class="field"><span>Name oder IP-Adresse</span><input class="input" name="d" value="${esc(DNSST.qn)}" placeholder="z. B. kunde-beispiel.de" spellcheck="false" required></label>
      <label class="field"><span>Typ</span><select class="input" name="t">${Object.keys(DNS_T).map(t=>`<option${t===DNSST.qt?' selected':''}>${t}</option>`).join('')}</select></label><button class="btn primary">${ic('search')}Abfragen</button>`;out.innerHTML=''};
  f.addEventListener('submit',async()=>{const fd=new FormData(f);out.innerHTML=`<div class="loading">Wird abgefragt …</div>`;
    try{if(DNSST.mode==='mail'){const d=cleanDomain(fd.get('d'));DNSST.domain=d;DNSST.sel=String(fd.get('s')||'').trim();if(!d)return out.innerHTML='';
        const r=await mailCheck(d,DNSST.sel);if(r.nx){out.innerHTML=chk('err',`Die Domain „${esc(d)}“ existiert nicht`,'Im DNS gibt es keine Einträge dafür. Schreibweise prüfen.');return}
        out.innerHTML=`<div class="sum-line"><b>${esc(d)}</b><span class="pill ok">${r.score.ok} in Ordnung</span>${r.score.warn?`<span class="pill warn">${r.score.warn} Hinweis${r.score.warn>1?'e':''}</span>`:''}${r.score.err?`<span class="pill err">${r.score.err} Problem${r.score.err>1?'e':''}</span>`:''}</div><div class="chks">${r.R.join('')}</div>`;lastMail={d,r};drawExtra(d,r)}
      else{let n=String(fd.get('d')).trim().replace(/^[a-z]+:\/\//i,'').replace(/[\/?#].*$/,''),t=String(fd.get('t'));DNSST.qn=n;DNSST.qt=t;
        if(/^\d{1,3}(\.\d{1,3}){3}$/.test(n)){if(t!=='PTR'){t='PTR';f.t.value='PTR';DNSST.qt='PTR'}n=revName(n)}
        const j=await doh(n,t),ans=(j.Answer||[]);
        out.innerHTML=j.Status===3?chk('err','Name existiert nicht (NXDOMAIN)',esc(n)):!ans.length?chk('info',`Keine ${t}-Einträge für ${esc(n)}`,'Der Name existiert, hat aber keinen Eintrag dieses Typs.')
          :`<div class="panel" style="overflow:auto"><table class="dns-t"><thead><tr><th>Name</th><th>Typ</th><th>TTL</th><th>Wert</th></tr></thead><tbody>${ans.map(a=>`<tr><td class="mono">${esc(a.name)}</td><td>${Object.keys(DNS_T).find(k=>DNS_T[k]===a.type)||a.type}</td><td>${a.TTL}s</td><td class="mono">${esc(a.type===16?txtVal(a.data):a.data)}</td></tr>`).join('')}</tbody></table></div>`}}
    catch(e){out.innerHTML=chk('err','DNS-Abfrage nicht möglich',esc(String(e).replace(/^Error: /,''))+'. Besteht eine Internetverbindung? Antwortet der gewählte DNS-Server?')}});
  const extra=$('#dnsExtra',p);let lastMail=null;
  f.addEventListener('submit',()=>{extra.innerHTML='';lastMail=null},true);
  // Resolver-Auswahl (System, Kunden-DNS/Router aus dem Netzwerk-Scan, öffentlich)
  ctx.net.resolvers().then(list=>{const opts=list.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('');
    $('#dnsRes',p).innerHTML=opts;$('#dnsCmp',p).innerHTML='<option value="">– kein Vergleich –</option>'+opts+'<option value="custom">Eigener Server …</option>';
    $('#dnsRes',p).value=RESOLVER;$('#dnsCmp',p).value=DNSST.cmp||''}).catch(()=>{});
  $('#dnsRes',p).onchange=e=>{RESOLVER=e.target.value};
  // „Eigener Server …“: Eingabefeld statt prompt() (in der WebView nicht verfügbar)
  $('#dnsCmp',p).onchange=e=>{const cu=$('#dnsCustom',p);cu.hidden=e.target.value!=='custom';if(e.target.value==='custom'){$('#dnsCustomIP',p).focus();return}DNSST.cmp=e.target.value};
  $('#dnsCustomOk',p).onclick=()=>{const v=$('#dnsCustomIP',p).value.trim();
    if(!/^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]+)$/i.test(v)){ctx.toast('Bitte eine IP-Adresse eingeben, z. B. 192.168.178.1');return}
    const sel=$('#dnsCmp',p),o=document.createElement('option');o.value=v;o.textContent='Eigener Server '+v;sel.insertBefore(o,sel.lastElementChild);sel.value=v;DNSST.cmp=v;$('#dnsCustom',p).hidden=true};
  // Zusätzliche Prüfungen nach dem Mail-Check
  async function drawExtra(d,r){
    const mx=(r.mxs||[]).filter(x=>x.h&&x.h!=='.');
    extra.innerHTML=`<div class="sub"><h5>Weitere Prüfungen</h5><div class="row">
        ${mx.length?[25,587,465].map(pt=>`<button class="btn" type="button" data-smtp="${pt}">${ic('mail')}SMTP-Test Port ${pt}</button>`).join(''):''}
        <button class="btn" type="button" id="dnsAuto">${ic('search')}Autodiscover / Autoconfig</button>
        ${DNSST.cmp?`<button class="btn" type="button" id="dnsDiff">${ic('refresh')}Mit zweitem DNS-Server vergleichen</button>`:''}
        <button class="btn" type="button" id="dnsSave">${ic('download')}In der Session speichern</button></div>
      ${mx.length?`<p class="note">SMTP-Test: nur Verbindungsaufbau zu <span class="mono">${esc(mx[0].h)}</span> (Banner, STARTTLS, Zertifikat). Es wird keine Mail gesendet.</p>`:''}
      <div id="dnsExtraOut" class="stack"></div></div>`;
    const eo=$('#dnsExtraOut',extra);
    extra.querySelectorAll('[data-smtp]').forEach(b=>b.onclick=async()=>{const pt=+b.dataset.smtp;b.disabled=true;eo.insertAdjacentHTML('afterbegin',`<div class="loading" id="smtpL">Verbinde mit ${esc(mx[0].h)}:${pt} …</div>`);
      try{eo.insertAdjacentHTML('afterbegin',smtpHTML(await ctx.net.smtp(mx[0].h,pt)))}catch(e){eo.insertAdjacentHTML('afterbegin',chk('err','SMTP-Test nicht möglich',esc(String(e))))}finally{$('#smtpL',extra)?.remove();b.disabled=false}});
    $('#dnsAuto',extra).onclick=async()=>{eo.insertAdjacentHTML('afterbegin',await autodiscoverHTML(d))};
    const df=$('#dnsDiff',extra);if(df)df.onclick=async()=>{eo.insertAdjacentHTML('afterbegin','<div class="loading" id="cmpL">Vergleiche …</div>');try{eo.insertAdjacentHTML('afterbegin',await compareHTML(d,RESOLVER,DNSST.cmp))}catch(e){eo.insertAdjacentHTML('afterbegin',chk('err','Vergleich nicht möglich',esc(String(e))))}finally{$('#cmpL',extra)?.remove()}};
    $('#dnsSave',extra).onclick=async()=>{const md=mailMarkdown(d,r,eo);const path=await ctx.net.saveNote('network','maildomain_'+d,md,'Mail-Check '+d);if(path){ctx.addAction('Mail-Check gespeichert: '+d,'success');ctx.toast('In der Session gespeichert')}};
  }
  p.addEventListener('click',e=>{const a=e.target.closest('a[data-open]');if(a){e.preventDefault();ctx.open(a.dataset.open)}});
  onSeg(p,'dm',v=>{DNSST.mode=v;drawForm();extra.innerHTML=''});drawForm();
  if(DNSST.auto){DNSST.auto=false;f.requestSubmit()}
  },
};

