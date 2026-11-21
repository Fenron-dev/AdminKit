// Hardwaretest – aus dem Ideler-Portal übernommen. In AdminKit: Vollbild über
// Wails, Geräteinfo aus dem Systemscan, Ausweg über System-Apps, falls die
// WebView keinen Kamera-/Mikrofonzugriff erhält.
import { WindowFullscreen, WindowUnfullscreen } from '../../../wailsjs/runtime/runtime';
import { $, esc, ic, segHTML, onSeg } from '../ui.js';

const HW={sub:'screen',vol:30};
let CTX=null;
let media={streams:[],raf:0,ctx:null,rec:null};
function stopMedia(){media.streams.forEach(s=>s.getTracks().forEach(t=>t.stop()));media.streams=[];cancelAnimationFrame(media.raf);media.raf=0;
  if(media.rec&&media.rec.state==='recording'){try{media.rec.stop()}catch(e){}}media.rec=null;
  if(media.ctx){try{media.ctx.close()}catch(e){}media.ctx=null}stopTone()}
function mediaErr(e){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return 'Diese App-Ansicht erlaubt keinen direkten Zugriff auf Mikrofon oder Kamera. Bitte über den Knopf unten die Kamera-App bzw. die Ton-Einstellungen des Systems öffnen.';
  const n=e&&e.name;
  if(n==='NotAllowedError'||n==='SecurityError')return 'Zugriff verweigert. Unter Windows: Einstellungen > Datenschutz > Kamera bzw. Mikrofon. Unter macOS: Systemeinstellungen > Datenschutz & Sicherheit. Alternativ über den Knopf unten die System-App öffnen.';
  if(n==='NotFoundError'||n==='OverconstrainedError')return 'Kein passendes Gerät gefunden. Ist es angeschlossen und im System aktiviert?';
  if(n==='NotReadableError'||n==='AbortError')return 'Das Gerät ist belegt, wahrscheinlich durch ein anderes Programm wie Teams, Zoom oder die Kamera-App. Programm schließen und erneut versuchen.';
  return 'Gerät konnte nicht gestartet werden: '+(e&&e.message||n||'unbekannter Fehler');
}
// Ausweg, wenn die WebView keinen Zugriff bekommt: System-App öffnen
const sysBtn=(kind,label)=>`<button class="btn" type="button" data-sysapp="${kind}">${ic('ext')}${label}</button>`;
async function fillDevices(sel,kind){try{const list=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind===kind);const cur=sel.value;
  sel.innerHTML=`<option value="">Standardgerät</option>`+list.map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||('Gerät '+(i+1)))}</option>`).join('');sel.value=cur}catch(e){}}

function mkOverlay(onClose){
  const o=document.createElement('div');o.className='hw-ov';o.tabIndex=-1;
  o.innerHTML=`<button class="hw-x" type="button" aria-label="Test beenden">${ic('x')}</button><div class="hw-hint"></div>`;
  const wrap=document.createElement('div');wrap.className='wz';wrap.append(o);
  document.body.append(wrap);o.focus();let closed=false;
  try{WindowFullscreen()}catch(e){}
  const close=()=>{if(closed)return;closed=true;document.removeEventListener('keydown',kd,true);document.removeEventListener('fullscreenchange',fc);
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});try{WindowUnfullscreen()}catch(e){}wrap.remove();onClose&&onClose()};
  const kd=e=>{if(e.key==='Escape'){e.preventDefault();close()}else o.onkey&&o.onkey(e)};
  const fc=()=>{if(!document.fullscreenElement)close()};
  document.addEventListener('keydown',kd,true);
  o.querySelector('.hw-x').addEventListener('click',e=>{e.stopPropagation();close()});
  let mt;o.addEventListener('pointermove',()=>{o.classList.add('show-x');clearTimeout(mt);mt=setTimeout(()=>o.classList.remove('show-x'),1800)});
  if(o.requestFullscreen)o.requestFullscreen().then(()=>document.addEventListener('fullscreenchange',fc)).catch(()=>{});
  const hint=o.querySelector('.hw-hint');let ht;
  o.hint=(t,keep)=>{hint.innerHTML=t;hint.classList.add('on');clearTimeout(ht);if(!keep)ht=setTimeout(()=>hint.classList.remove('on'),2800)};
  o.close=close;return o;
}
function screenTest(){
  const F=[['#000','Schwarz','Helle Punkte sind defekte Pixel. Auch auf helle Ränder (Lichthöfe) achten.'],['#fff','Weiß','Dunkle Punkte, Flecken oder Verfärbungen suchen.'],['#f00','Rot','Fehlende Farbe oder dunkle Stellen?'],['#0f0','Grün','Fehlende Farbe oder dunkle Stellen?'],['#00f','Blau','Fehlende Farbe oder dunkle Stellen?'],
    ['#808080','Grau','Gleichmäßige Ausleuchtung? Schatten oder Wolken deuten auf Hintergrundbeleuchtung oder Druckstellen.'],['linear-gradient(90deg,#000,#fff)','Verlauf','Sichtbare Stufen statt weichem Übergang deuten auf Farbprobleme.'],['repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0/4px 4px','Feines Raster','Flimmern oder Moiré-Muster prüfen.']];
  let i=0;const o=mkOverlay();
  const show=()=>{o.style.background=F[i][0];o.hint(`<b>${i+1} von ${F.length}: ${F[i][1]}</b>${F[i][2]}<small>Klick, Leertaste oder → weiter, ← zurück, Esc beendet</small>`)};
  const next=()=>{if(++i>=F.length){o.close();CTX.toast('Bildschirmtest beendet');return}show()};const prev=()=>{i=Math.max(0,i-1);show()};
  o.addEventListener('click',next);o.addEventListener('contextmenu',e=>{e.preventDefault();prev()});
  o.onkey=e=>{if(['ArrowRight',' ','Enter','PageDown'].includes(e.key)){e.preventDefault();next()}else if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();prev()}};
  show();
}
function touchTest(){
  const o=mkOverlay(()=>removeEventListener('resize',size));o.classList.add('touch');const cv=document.createElement('canvas');o.prepend(cv);const c=cv.getContext('2d');
  let cs,cols,rows,hit,W,H,dpr;const act=new Map();let done=false;
  function size(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
    cs=Math.max(44,Math.min(W,H)/9);cols=Math.ceil(W/cs);rows=Math.ceil(H/cs);hit=new Set();done=false;grid()}
  function grid(){c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#0A1626';c.fillRect(0,0,W,H);c.strokeStyle='rgba(159,179,200,.25)';c.lineWidth=1;
    for(let x=0;x<=cols;x++){c.beginPath();c.moveTo(x*cs+.5,0);c.lineTo(x*cs+.5,H);c.stroke()}for(let y=0;y<=rows;y++){c.beginPath();c.moveTo(0,y*cs+.5);c.lineTo(W,y*cs+.5);c.stroke()}status()}
  function status(){const tot=cols*rows;o.hint(hit.size>=tot?`<b>Alle ${tot} Felder erreicht</b>Der Touchscreen reagiert auf der ganzen Fläche.<small>Esc oder X beendet</small>`
    :`<b>${hit.size} von ${tot} Feldern</b>Mit dem Finger über alle Felder wischen. Felder, die grau bleiben, reagieren nicht.<small>Finger gleichzeitig: ${act.size}</small>`,true)}
  function mark(x,y){const k=Math.floor(x/cs)+','+Math.floor(y/cs);if(!hit.has(k)){hit.add(k);const [cx,cy]=k.split(',').map(Number);c.fillStyle='rgba(92,225,230,.28)';c.fillRect(cx*cs+1,cy*cs+1,cs-1,cs-1);
    if(hit.size>=cols*rows&&!done){done=true;CTX.toast('Touchscreen: alle Felder erreicht')}}}
  cv.addEventListener('pointerdown',e=>{e.preventDefault();act.set(e.pointerId,{x:e.clientX,y:e.clientY});mark(e.clientX,e.clientY);status()});
  cv.addEventListener('pointermove',e=>{const p=act.get(e.pointerId);if(!p)return;c.strokeStyle='rgba(255,181,71,.85)';c.lineWidth=3;c.lineCap='round';c.beginPath();c.moveTo(p.x,p.y);c.lineTo(e.clientX,e.clientY);c.stroke();
    act.set(e.pointerId,{x:e.clientX,y:e.clientY});mark(e.clientX,e.clientY);status()});
  const up=e=>{act.delete(e.pointerId);status()};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  addEventListener('resize',size);size();
}
const KBL=[
  [['Escape','Esc'],[0,'',.5],['F1','F1'],['F2','F2'],['F3','F3'],['F4','F4'],['F5','F5'],['F6','F6'],['F7','F7'],['F8','F8'],['F9','F9'],['F10','F10'],['F11','F11'],['F12','F12'],[0,'',.5],['Delete','Entf']],
  [['Backquote','^'],['Digit1','1'],['Digit2','2'],['Digit3','3'],['Digit4','4'],['Digit5','5'],['Digit6','6'],['Digit7','7'],['Digit8','8'],['Digit9','9'],['Digit0','0'],['Minus','ß'],['Equal','´'],['Backspace','⌫',2]],
  [['Tab','Tab',1.5],['KeyQ','Q'],['KeyW','W'],['KeyE','E'],['KeyR','R'],['KeyT','T'],['KeyY','Z'],['KeyU','U'],['KeyI','I'],['KeyO','O'],['KeyP','P'],['BracketLeft','Ü'],['BracketRight','+'],['Enter','Enter',1.5]],
  [['CapsLock','Feststell',1.75],['KeyA','A'],['KeyS','S'],['KeyD','D'],['KeyF','F'],['KeyG','G'],['KeyH','H'],['KeyJ','J'],['KeyK','K'],['KeyL','L'],['Semicolon','Ö'],['Quote','Ä'],['Backslash','#'],[0,'',1.25]],
  [['ShiftLeft','Shift',1.25],['IntlBackslash','<'],['KeyZ','Y'],['KeyX','X'],['KeyC','C'],['KeyV','V'],['KeyB','B'],['KeyN','N'],['KeyM','M'],['Comma',','],['Period','.'],['Slash','-'],['ShiftRight','Shift',2.75]],
  [['ControlLeft','Strg',1.5],['MetaLeft','Win',1.25],['AltLeft','Alt',1.25],['Space','Leertaste',7],['AltRight','Alt Gr',1.25],['ContextMenu','Menü',1.25],['ControlRight','Strg',1.5]],
  [[0,'',11],['ArrowLeft','←'],['ArrowUp','↑'],['ArrowDown','↓'],['ArrowRight','→']],
];
function keyboardTest(box){
  const total=KBL.flat().filter(k=>k[0]).length;
  box.innerHTML=`<div class="kb-area" tabindex="0" id="kbArea" aria-label="Tastaturtest: hier klicken und Tasten drücken">
      <div class="kb">${KBL.map(r=>`<div class="kb-r">${r.map(([code,l,w=1])=>code?`<span class="k" data-code="${code}" style="flex:${w} 1 0">${l}</span>`:`<span class="k gap" style="flex:${w} 1 0"></span>`).join('')}</div>`).join('')}</div>
      <div class="kb-focus">Hier klicken, dann nacheinander alle Tasten drücken</div></div>
    <div class="row" style="justify-content:space-between"><span class="muted" id="kbStat">0 von ${total} Tasten getestet</span><span class="muted" id="kbLast">Letzte Taste: –</span><button class="btn sm" type="button" id="kbReset">${ic('refresh')}Zurücksetzen</button></div>
    <p class="note">Die Windows-Taste, Fn und Druck lösen im Browser teils kein Signal aus. F-Tasten brauchen auf Notebooks oft zusätzlich Fn. Tasten außerhalb der Abbildung (z. B. Ziffernblock) erscheinen unter „Letzte Taste“.</p>`;
  const area=$('#kbArea',box),hit=new Set();
  const stat=()=>{$('#kbStat',box).textContent=`${hit.size} von ${total} Tasten getestet`;if(hit.size===total)CTX.toast('Alle Tasten getestet')};
  area.addEventListener('keydown',e=>{e.preventDefault();const k=area.querySelector(`[data-code="${e.code}"]`);if(k){k.classList.add('down','hit');if(!hit.has(e.code)){hit.add(e.code);stat()}}
    $('#kbLast',box).innerHTML=`Letzte Taste: <b>${esc(e.key===' '?'Leertaste':e.key)}</b> <span class="mono">(${esc(e.code||'ohne Code')})</span>`});
  area.addEventListener('keyup',e=>{e.preventDefault();area.querySelector(`[data-code="${e.code}"]`)?.classList.remove('down');if(e.code==='PrintScreen'){const k=area.querySelector('[data-code=PrintScreen]');k&&k.classList.add('hit')}});
  area.addEventListener('focus',()=>area.classList.add('on'));
  area.addEventListener('blur',()=>{area.classList.remove('on');area.querySelectorAll('.down').forEach(k=>k.classList.remove('down'))});
  $('#kbReset',box).onclick=()=>{hit.clear();area.querySelectorAll('.k').forEach(k=>k.classList.remove('hit','down'));stat();area.focus()};
}
let tone=null;
function audioCtx(){if(!media.ctx||media.ctx.state==='closed')media.ctx=new (window.AudioContext||window.webkitAudioContext)();if(media.ctx.state==='suspended')media.ctx.resume();return media.ctx}
function stopTone(){if(tone){try{tone.o.stop()}catch(e){}clearInterval(tone.iv);tone=null}const f=$('#sndFreq');if(f)f.textContent=''}
function playTone(pan,sweep){stopTone();const c=audioCtx(),o=c.createOscillator(),g=c.createGain(),t=c.currentTime,dur=sweep?9:1.6,v=HW.vol/100*.5;
  o.type='sine';if(sweep){o.frequency.setValueAtTime(40,t);o.frequency.exponentialRampToValueAtTime(16000,t+dur)}else o.frequency.value=440;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.04);g.gain.setValueAtTime(v,t+dur-.08);g.gain.linearRampToValueAtTime(0,t+dur);
  o.connect(g);if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=pan;g.connect(p).connect(c.destination)}else g.connect(c.destination);
  o.start(t);o.stop(t+dur);tone={o,iv:0};
  if(sweep){const f=$('#sndFreq');tone.iv=setInterval(()=>{const el=c.currentTime-t;if(el>dur){stopTone();return}if(f)f.textContent=Math.round(40*Math.pow(16000/40,el/dur)).toLocaleString('de-DE')+' Hz'},90)}
  o.onended=()=>{if(tone&&tone.o===o)stopTone()}}
function soundTest(box){
  box.innerHTML=`<div class="stack"><div class="row"><button class="btn" type="button" data-snd="-1">${ic('volume')}Links</button><button class="btn" type="button" data-snd="1">${ic('volume')}Rechts</button><button class="btn" type="button" data-snd="0">${ic('volume')}Beide</button>
      <button class="btn" type="button" data-snd="sweep">${ic('gauge')}Frequenzlauf</button><button class="btn ghost" type="button" data-snd="stop">${ic('stop')}Stopp</button><span class="mono muted" id="sndFreq"></span></div>
    <label class="field" style="max-width:360px"><span>Lautstärke: <output id="sndVolO">${HW.vol}</output> %</span><input type="range" id="sndVol" min="5" max="100" value="${HW.vol}"></label>
    <p class="note">„Links“ und „Rechts“ prüfen, ob beide Lautsprecher bzw. Kopfhörerseiten funktionieren und richtig herum angeschlossen sind. Der Frequenzlauf geht von tiefen zu hohen Tönen: Scheppern oder Rasseln bei bestimmten Tonhöhen deutet auf einen beschädigten Lautsprecher hin. Vorsichtig mit der Lautstärke bei Kopfhörern.</p></div>`;
  box.addEventListener('click',e=>{const b=e.target.closest('[data-snd]');if(!b)return;const v=b.dataset.snd;if(v==='stop')stopTone();else if(v==='sweep')playTone(0,true);else playTone(+v,false)});
  $('#sndVol',box).addEventListener('input',e=>{HW.vol=+e.target.value;$('#sndVolO',box).textContent=HW.vol});
}
function micTest(box){
  box.innerHTML=`<div class="stack"><div class="row"><select class="input" id="micDev" style="max-width:340px"><option value="">Standardgerät</option></select>
      <button class="btn primary" type="button" id="micGo">${ic('mic')}Mikrofon starten</button><button class="btn" type="button" id="micRec" disabled>${ic('play')}5 Sekunden aufnehmen</button></div>
    <div class="lvl"><span id="micBar"></span><i id="micPeak"></i></div><div class="row" style="justify-content:space-between"><span class="muted" id="micDb">Noch nicht gestartet</span><span class="muted" id="micInfo"></span></div>
    <audio id="micAudio" controls hidden></audio><p class="form-err" id="micErr"></p><div class="row" id="micSys" hidden>${sysBtn('sound','Ton-Einstellungen öffnen')}</div>
    <p class="note">Sprich normal ins Mikrofon. Der Balken sollte deutlich ausschlagen. Mit „Aufnehmen“ hörst du, ob die Stimme klar oder verrauscht ankommt.</p></div>`;
  const go=$('#micGo',box),rec=$('#micRec',box);let peak=0;
  go.onclick=async()=>{if(media.streams.length){stopMedia();go.innerHTML=ic('mic')+'Mikrofon starten';rec.disabled=true;$('#micDb',box).textContent='Gestoppt';return}
    $('#micErr',box).textContent='';try{const id=$('#micDev',box).value;const s=await navigator.mediaDevices.getUserMedia({audio:id?{deviceId:{exact:id}}:true});media.streams.push(s);
      fillDevices($('#micDev',box),'audioinput');const tr=s.getAudioTracks()[0];$('#micInfo',box).textContent=tr.label||'';
      const c=audioCtx(),src=c.createMediaStreamSource(s),an=c.createAnalyser();an.fftSize=2048;src.connect(an);const buf=new Float32Array(an.fftSize);
      const loop=()=>{an.getFloatTimeDomainData(buf);let sum=0;for(const v of buf)sum+=v*v;const rms=Math.sqrt(sum/buf.length),db=Math.max(-90,20*Math.log10(rms||1e-9));
        const pct=Math.max(0,Math.min(100,(db+60)/60*100));peak=Math.max(pct,peak-.6);$('#micBar',box).style.width=pct+'%';$('#micPeak',box).style.left=peak+'%';
        $('#micDb',box).textContent=`Pegel ${Math.round(db)} dB`+(db>-3?' (übersteuert)':db<-50?' (sehr leise)':'');media.raf=requestAnimationFrame(loop)};loop();
      go.innerHTML=ic('stop')+'Stoppen';rec.disabled=!window.MediaRecorder}catch(e){$('#micErr',box).textContent=mediaErr(e);$('#micSys',box).hidden=false}};
  rec.onclick=()=>{const s=media.streams[0];if(!s)return;const chunks=[];const r=new MediaRecorder(s);media.rec=r;r.ondataavailable=e=>chunks.push(e.data);
    r.onstop=()=>{const a=$('#micAudio',box);if(!a)return;a.src=URL.createObjectURL(new Blob(chunks,{type:r.mimeType}));a.hidden=false;a.play().catch(()=>{});rec.disabled=false;rec.innerHTML=ic('play')+'5 Sekunden aufnehmen'};
    r.start();rec.disabled=true;let n=5;rec.innerHTML=`Aufnahme läuft … ${n}`;const iv=setInterval(()=>{n--;if(n<=0){clearInterval(iv);if(r.state==='recording')r.stop()}else rec.innerHTML=`Aufnahme läuft … ${n}`},1000)};
}
function camTest(box){
  box.innerHTML=`<div class="stack"><div class="row"><select class="input" id="camDev" style="max-width:340px"><option value="">Standardgerät</option></select>
      <button class="btn primary" type="button" id="camGo">${ic('camera')}Kamera starten</button><label class="check"><input type="checkbox" id="camMirror" checked>Spiegeln</label></div>
    <div class="cam"><video id="camV" playsinline muted></video><span id="camPh">${ic('camera')}Vorschau erscheint hier</span></div>
    <div class="row" style="justify-content:space-between"><span class="muted" id="camInfo"></span></div><p class="form-err" id="camErr"></p><div class="row" id="camSys" hidden>${sysBtn('camera','Kamera-App öffnen')}</div></div>`;
  const go=$('#camGo',box),v=$('#camV',box);
  $('#camMirror',box).onchange=e=>v.classList.toggle('mirror',e.target.checked);v.classList.add('mirror');
  go.onclick=async()=>{if(media.streams.length){stopMedia();v.srcObject=null;$('#camPh',box).hidden=false;go.innerHTML=ic('camera')+'Kamera starten';return}
    $('#camErr',box).textContent='';try{const id=$('#camDev',box).value;const s=await navigator.mediaDevices.getUserMedia({video:id?{deviceId:{exact:id},width:{ideal:1920}}:{width:{ideal:1920}}});media.streams.push(s);
      v.srcObject=s;await v.play();$('#camPh',box).hidden=true;fillDevices($('#camDev',box),'videoinput');const st=s.getVideoTracks()[0].getSettings();
      $('#camInfo',box).textContent=`${s.getVideoTracks()[0].label||'Kamera'}: ${st.width||v.videoWidth} × ${st.height||v.videoHeight} Pixel${st.frameRate?', '+Math.round(st.frameRate)+' Bilder/s':''}`;
      go.innerHTML=ic('stop')+'Stoppen'}catch(e){$('#camErr',box).textContent=mediaErr(e);$('#camSys',box).hidden=false}};
}
async function devInfo(box){
  const dpr=devicePixelRatio||1,scan=CTX.systemScan&&CTX.systemScan();const rows=[];
  if(scan){const hw=scan.hardware||{},os=scan.os||{},mb=hw.motherboard||{},b=hw.battery;
    const model=[mb.manufacturer,mb.product].filter(Boolean).join(' ');
    rows.push(['Gerät',model||'–'],['Seriennummer',mb.serial_number||os.serial_number||'–'],['Betriebssystem',[os.name,os.version,os.build&&('Build '+os.build)].filter(Boolean).join(' ')||'–'],
      ['Prozessor',(hw.cpu&&hw.cpu.name)||'–'],['Arbeitsspeicher',hw.total_ram_gb?Math.round(hw.total_ram_gb)+' GB':'–'],
      ['Grafik',(hw.gpus||[]).map(g=>g.name).filter(Boolean).join(', ')||'–'],['Datenträger',(hw.disks||[]).map(d=>`${d.model||'?'} (${Math.round(d.size_gb||0)} GB, ${d.media_type||'?'})`).join(', ')||'–'],
      ['Akku',b&&b.present?`${b.charge_pct} %${b.max_capacity_pct>0?`, Kapazität ${b.max_capacity_pct} %`:''}${b.cycle_count>0?`, ${b.cycle_count} Zyklen`:''}${b.condition?', '+b.condition:''}`:'kein Akku'])}
  rows.push(['Bildschirm (logisch)',`${screen.width} × ${screen.height}`],['Bildschirm (physisch, ca.)',`${Math.round(screen.width*dpr)} × ${Math.round(screen.height*dpr)}`],['Skalierung',Math.round(dpr*100)+' %'],
    ['Farbtiefe',screen.colorDepth+' Bit'],['Bildwiederholrate','wird gemessen …'],['Touch-Punkte',navigator.maxTouchPoints?navigator.maxTouchPoints+' gleichzeitig':'kein Touchscreen erkannt']);
  const hzRow=rows.findIndex(r=>r[0]==='Bildwiederholrate');
  const draw=()=>{box.innerHTML=`${scan?'':`<aside class="callout info"><strong class="callout-t">${ic('info')}Noch kein Systemscan</strong><p style="margin:0">Modell, Seriennummer, Prozessor und Akku erscheinen hier nach einem Scan (Dashboard → Vollständiger Scan).</p></aside>`}
    <dl class="kv">${rows.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><div class="row" style="margin-top:14px"><button class="btn" type="button" id="diCopy">${ic('copy')}Als Text kopieren</button></div>`;
    $('#diCopy',box).onclick=()=>CTX.copy(rows.map(([k,v])=>k+': '+v).join('\n'),'Geräteinfo kopiert')};
  draw();
  let n=0;const t0=performance.now();await new Promise(r=>{const f=t=>{n++;if(t-t0<1000)requestAnimationFrame(f);else r()};requestAnimationFrame(f)});
  const hz=n*1000/(performance.now()-t0),std=[50,60,75,90,100,120,144,165,180,240].reduce((a,b)=>Math.abs(b-hz)<Math.abs(a-hz)?b:a);
  rows[hzRow][1]=`ca. ${std} Hz (gemessen ${Math.round(hz)})`;
  if(box.isConnected)draw();
}
export default {
  id: 'hw', name: 'Hardwaretest', group: 'Reparatur & Laden', icon: 'monitor',
  keys: 'pixel display bildschirm touch tastatur mikrofon kamera lautsprecher test geräteinfo', online: false,
  render(p, ctx) {
  CTX=ctx;
  p.innerHTML=`<div class="util wide"><h3>Hardwaretest</h3><p>Prüfen, ob Display, Touch, Tastatur, Ton, Mikrofon und Kamera dieses Geräts funktionieren. Die Geräteinfo kommt aus dem AdminKit-Systemscan.</p>
    ${segHTML('hw',[['screen','Bildschirm'],['touch','Touch'],['keys','Tastatur'],['sound','Lautsprecher'],['mic','Mikrofon'],['cam','Kamera'],['info','Geräteinfo']],HW.sub)}<div id="hwBox"></div></div>`;
  const box=$('#hwBox',p);
  const draw=()=>{stopMedia();
    if(HW.sub==='screen'){box.innerHTML=`<div class="hw-start">${ic('monitor')}<div><strong>Pixel- und Farbtest</strong><p>Zeigt nacheinander acht Vollbildflächen. Klick oder Pfeiltaste schaltet weiter, Esc beendet. Vorher Display gründlich reinigen, Staub sieht sonst wie ein Pixelfehler aus.</p></div><button class="btn primary" type="button" id="hwGo">${ic('play')}Test starten</button></div>`;$('#hwGo',box).onclick=screenTest}
    else if(HW.sub==='touch'){box.innerHTML=`<div class="hw-start">${ic('hand')}<div><strong>Touchscreen-Test</strong><p>Füllt den Bildschirm mit einem Raster. Mit dem Finger über alle Felder wischen. Bleibt ein Bereich grau, reagiert der Touchscreen dort nicht. Zeigt auch, wie viele Finger gleichzeitig erkannt werden.</p></div><button class="btn primary" type="button" id="hwGo">${ic('play')}Test starten</button></div>`;$('#hwGo',box).onclick=touchTest}
    else if(HW.sub==='keys')keyboardTest(box);else if(HW.sub==='sound')soundTest(box);else if(HW.sub==='mic')micTest(box);else if(HW.sub==='cam')camTest(box);else devInfo(box)};
  onSeg(p,'hw',v=>{HW.sub=v;draw()});
  p.addEventListener('click',e=>{const b=e.target.closest('[data-sysapp]');if(b)ctx.openSystemApp(b.dataset.sysapp)});
  draw();
  return stopMedia;
  },
};

