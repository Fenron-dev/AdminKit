// Drucker-Assistent (#130): Drucker anzeigen, per IP hinzufügen, Testseite,
// Warteschlange anzeigen/leeren, Drucker und unbenutzte Treiber entfernen.
// Alles über cmdrun (#110); verändernde Schritte nur nach Bestätigung.
import { $, esc, ic, chk } from '../ui.js';
import { execute } from './commands.js';

export const psq = s => "'" + String(s).replace(/'/g, "''") + "'";
export const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
export const cleanName = s => String(s || '').replace(/[\u0000-\u001f{}"`$]/g, '').trim().slice(0, 100);
export const isIP = s => /^(\d{1,3})(\.\d{1,3}){3}$/.test(s) && s.split('.').every(n => +n <= 255);
export function parseLpstat(out) {
  const P = {};
  for (const l of String(out).split('\n')) {
    let m;
    if ((m = l.match(/^device for (\S+):\s*(.+)$/))) (P[m[1]] = P[m[1]] || { name: m[1] }).port = m[2].trim();
    else if ((m = l.match(/^printer (\S+) (?:is |now )?(.+?)\.?\s*(?:enabled.*)?$/))) (P[m[1]] = P[m[1]] || { name: m[1] }).status = m[2];
    else if ((m = l.match(/^system default destination:\s*(\S+)/))) (P[m[1]] = P[m[1]] || { name: m[1] }).isDefault = true;
  }
  return Object.values(P);
}
const ERRCODES = '0x00000709 0x0000011B 0x00000BC4';

export default {
  id: 'printers', name: 'Drucker-Assistent', group: 'Geräte & Hardware', icon: 'printer', tags: ['Drucker', 'Fehlersuche'],
  keys: 'drucker printer hinzufügen ip testseite warteschlange spooler treiber entfernen druckauftrag hängt lpadmin', online: false,
  async render(p, ctx) {
    const win = ctx.os === 'windows', mac = ctx.os === 'macos';
    if (!win && !mac) { p.innerHTML = '<div class="util"><h3>Drucker-Assistent</h3><p>Nur unter Windows und macOS.</p></div>'; return; }
    p.innerHTML = `<div class="util wide"><h3>Drucker-Assistent</h3><p>Drucker anzeigen und per IP hinzufügen, Testseite drucken, hängende Aufträge löschen, alte Drucker und Treiber entfernen. Verändernde Schritte fragen vorher nach.</p>
      <div class="row"><button class="btn" type="button" id="prList">${ic('refresh')}Drucker anzeigen</button>${win ? `<button class="btn" type="button" id="prDrv">${ic('trash')}Unbenutzte Treiber</button>` : ''}<button class="btn ghost" type="button" id="prErr">${ic('bug')}Druckerfehler 0x709/0x11b nachschlagen</button></div>
      <div id="prOut"></div>
      <form class="panel lk-form" id="prAdd"><strong>Drucker per IP hinzufügen</strong><div class="lk-grid">
        <label class="field"><span>IP-Adresse</span><input class="input mono" name="ip" required placeholder="192.168.178.50"></label>
        <label class="field"><span>Name</span><input class="input" name="name" required placeholder="z. B. Büro-Laser" maxlength="80"></label>
        ${win ? '<label class="field"><span>Treiber</span><select class="input" name="drv" id="prDrvSel"><option value="">Treiber laden …</option></select></label>' : ''}</div>
        <p class="note">${win ? 'Für moderne Netzwerkdrucker reicht oft „Microsoft IPP Class Driver“. Für alle Funktionen (Fächer, Duplex) den Herstellertreiber vorher installieren.' : 'macOS richtet den Drucker per IPP Everywhere/AirPrint ein (kein Herstellertreiber nötig, wenn der Drucker das unterstützt).'}</p>
        <div class="row"><button class="btn primary" type="submit">${ic('plus')}Hinzufügen</button><span id="prChk" class="muted"></span></div></form></div>`;
    const out = $('#prOut', p);
    const run = async (name, command, opts = {}) => {
      const c = { name, kind: 'run', change: !!opts.change, impact: opts.impact || '', v: { [ctx.os]: { cmd: command, shell: win && !opts.cmd ? 'powershell' : '', admin: !!opts.admin, timeout: opts.timeout || 60 } } };
      const r = await execute(ctx, c, {});
      if (r?.result?.error) ctx.toast(r.result.error);
      return r;
    };
    const list = async () => {
      out.innerHTML = '<p class="muted">Lese Drucker …</p>';
      const r = await run('Drucker anzeigen', win ? "Get-Printer | Select-Object Name,DriverName,PortName,@{n='Status';e={[string]$_.PrinterStatus}},Shared | ConvertTo-Json -Compress" : 'lpstat -v; lpstat -p; lpstat -d');
      if (!r) { out.innerHTML = ''; return; }
      let L = [];
      if (win) { try { const j = JSON.parse(r.result.output || '[]'); L = (Array.isArray(j) ? j : [j]).map(x => ({ name: x.Name, driver: x.DriverName, port: x.PortName, status: x.Status, shared: x.Shared })); } catch (_) { L = []; } }
      else L = parseLpstat(r.result.output);
      out.innerHTML = L.length ? `<div class="sub"><h5>Drucker <small>${L.length}</small></h5>${L.map((x, i) => `<div class="er-card"><div class="er-head"><b>${esc(x.name)}</b>${x.isDefault ? '<span class="tag">Standard</span>' : ''}${x.status ? `<span class="tag">${esc(x.status)}</span>` : ''}</div>
        <p class="muted mono">${esc([x.driver, x.port].filter(Boolean).join(' · '))}</p>
        <div class="row"><button class="btn sm" type="button" data-pra="test" data-n="${esc(x.name)}">Testseite</button><button class="btn sm" type="button" data-pra="queue" data-n="${esc(x.name)}">Warteschlange</button>
          <button class="btn sm" type="button" data-pra="clear" data-n="${esc(x.name)}">Leeren</button><button class="btn sm lk-del" type="button" data-pra="remove" data-n="${esc(x.name)}">${ic('trash')}Entfernen</button></div><div class="pr-res" id="prR${i}"></div></div>`).join('')}</div>` : chk('info', 'Keine Drucker eingerichtet');
    };
    $('#prList', p).onclick = list;
    $('#prErr', p).onclick = () => ctx.openTool('err', { q: ERRCODES });
    if (win) {
      run('Treiber anzeigen', 'Get-PrinterDriver | Select-Object -ExpandProperty Name | Sort-Object -Unique').then(r => {
        const L = (r?.result?.output || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean), sel = $('#prDrvSel', p);
        if (sel) sel.innerHTML = L.map(n => `<option${/IPP Class Driver/i.test(n) ? ' selected' : ''}>${esc(n)}</option>`).join('') || '<option value="">Keine Treiber gefunden</option>';
      });
      $('#prDrv', p).onclick = async () => {
        const r = await run('Unbenutzte Treiber', "$u=(Get-Printer).DriverName; Get-PrinterDriver | Where-Object { $u -notcontains $_.Name } | Select-Object -ExpandProperty Name");
        const L = (r?.result?.output || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        out.innerHTML = L.length ? `<div class="sub"><h5>Nicht verwendete Treiber <small>${L.length}</small></h5><p class="note">Alte Treiber können Druckprobleme verursachen. Mitgelieferte Microsoft-Treiber lassen sich teils nicht entfernen.</p>${L.map(n => `<div class="wz-hrow"><span class="mono">${esc(n)}</span><button class="btn sm lk-del" type="button" data-prdrv="${esc(n)}">${ic('trash')}Entfernen</button></div>`).join('')}</div>` : chk('ok', 'Keine unbenutzten Treiber');
      };
    }
    p.addEventListener('click', async e => {
      const dv = e.target.closest('[data-prdrv]');
      if (dv) { const r = await run(`Treiber „${dv.dataset.prdrv}“ entfernen`, `Remove-PrinterDriver -Name ${psq(dv.dataset.prdrv)}; 'Entfernt'`, { change: true, admin: true, impact: 'Der Druckertreiber wird gelöscht. Drucker, die ihn noch brauchen, müssten neu eingerichtet werden.' }); if (r && !r.result.error) dv.closest('.wz-hrow').remove(); return; }
      const a = e.target.closest('[data-pra]'); if (!a) return;
      const n = a.dataset.n, box = a.closest('.er-card').querySelector('.pr-res');
      const show = r => { if (r) box.innerHTML = `<pre class="srv">${esc(r.result.output || r.result.error || 'Erledigt')}</pre>`; };
      if (a.dataset.pra === 'test') show(await run(`Testseite an „${n}“`, win ? `rundll32 printui.dll,PrintUIEntry /k /n "${n.replace(/"/g, '')}"` : `printf 'AdminKit Testseite\\n%s\\n' "$(date)" | lp -d ${shq(n)}`, { cmd: true, change: true, impact: 'Es wird eine Seite gedruckt (Papier/Toner).' }));
      else if (a.dataset.pra === 'queue') show(await run(`Warteschlange „${n}“`, win ? `Get-PrintJob -PrinterName ${psq(n)} | Format-Table Id,DocumentName,UserName,JobStatus,Size -AutoSize | Out-String -Width 200` : `lpstat -o ${shq(n)}`));
      else if (a.dataset.pra === 'clear') show(await run(`Warteschlange „${n}“ leeren`, win ? `Get-PrintJob -PrinterName ${psq(n)} | Remove-PrintJob; 'Warteschlange geleert'` : `cancel -a ${shq(n)} && echo 'Warteschlange geleert'`, { change: true, admin: win, impact: 'Alle wartenden Druckaufträge dieses Druckers werden gelöscht – auch die anderer Benutzer.' }));
      else if (a.dataset.pra === 'remove') { const r = await run(`Drucker „${n}“ entfernen`, win ? `Remove-Printer -Name ${psq(n)}; 'Entfernt'` : `lpadmin -x ${shq(n)} && echo Entfernt`, { change: true, admin: true, impact: 'Der Drucker verschwindet für alle Benutzer dieses Rechners. Treiber bleiben erhalten.' }); if (r && !r.result.error) list(); }
    });
    $('#prAdd', p).addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target), ip = String(fd.get('ip')).trim(), name = cleanName(fd.get('name')), drv = String(fd.get('drv') || '');
      if (!isIP(ip)) { ctx.toast('IP-Adresse ungültig'); return; }
      if (!name) { ctx.toast('Name fehlt'); return; }
      const chkEl = $('#prChk', p); chkEl.textContent = 'Prüfe Erreichbarkeit …';
      try { const r = await ctx.net.ports(ip, [9100, 631, 80]); const open = r.filter(x => x.state === 'open').map(x => x.port); chkEl.textContent = open.length ? `Erreichbar (Ports ${open.join(', ')})` : 'Drucker antwortet nicht auf 9100/631/80 – trotzdem einrichten?'; } catch (_) { chkEl.textContent = ''; }
      if (win && !drv) { ctx.toast('Treiber wählen'); return; }
      const cmd = win ? `$p=${psq('IP_' + ip)}; if (-not (Get-PrinterPort -Name $p -ErrorAction SilentlyContinue)) { Add-PrinterPort -Name $p -PrinterHostAddress ${psq(ip)} }; Add-Printer -Name ${psq(name)} -PortName $p -DriverName ${psq(drv)}; 'Drucker eingerichtet'`
        : `lpadmin -p ${shq(name.replace(/\s+/g, '_'))} -D ${shq(name)} -E -v ${shq('ipp://' + ip + '/ipp/print')} -m everywhere && echo 'Drucker eingerichtet'`;
      const r = await run(`Drucker „${name}“ hinzufügen`, cmd, { change: true, admin: true, timeout: 120, impact: `Ein neuer Drucker „${name}“ (${ip}) wird für alle Benutzer dieses Rechners eingerichtet.` });
      if (r && !r.result.error) { ctx.toast('Drucker hinzugefügt'); e.target.reset(); list(); }
    });
  },
};
