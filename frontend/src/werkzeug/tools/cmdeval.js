// Auswertung von Befehlsausgaben (#110): Werte herausziehen → Ampel + kurze
// Erklärung. Deutsche und englische Windows-Ausgaben. Eigene Befehle: Regeln.
// Ergebnis: [{ level: 'ok'|'warn'|'err'|'info', title, text }]
const num = s => parseFloat(String(s).replace(',', '.'));
const R = (level, title, text = '') => ({ level, title, text });

export const EVAL = {
  ping(o) {
    const out = [];
    if (/konnte (?:den )?host|could not find host|unknown host|cannot resolve|name or service not known/i.test(o)) return [R('err', 'Name nicht auflösbar', 'Der Name ist unbekannt oder DNS funktioniert nicht. Mit einer IP-Adresse (z. B. 8.8.8.8) gegentesten.')];
    const loss = o.match(/\((\d+)\s*%\s*(?:verlust|loss)\)/i) || o.match(/([\d.]+)%\s*packet loss/i);
    const avg = o.match(/(?:mittelwert|average)\s*=\s*(\d+)\s*ms/i) || o.match(/=\s*[\d.]+\/([\d.]+)\//);
    if (loss) {
      const l = num(loss[1]);
      out.push(l === 0 ? R('ok', 'Kein Paketverlust') : l >= 100 ? R('err', 'Keine Antwort (100 % Verlust)', 'Ziel nicht erreichbar oder es blockiert Ping. Router-IP und 8.8.8.8 gegentesten.') : R('warn', `${l} % Paketverlust`, 'Instabile Verbindung: WLAN-Empfang, Kabel oder überlastete Leitung prüfen.'));
    }
    if (avg) { const a = num(avg[1]); out.push(a < 50 ? R('ok', `Antwortzeit ${a} ms`, a < 5 ? 'Typisch für das lokale Netz.' : '') : a < 150 ? R('warn', `Antwortzeit ${a} ms`, 'Etwas langsam – bei Videokonferenzen spürbar.') : R('err', `Antwortzeit ${a} ms`, 'Sehr langsam: Leitung ausgelastet oder schlechte Verbindung.')); }
    return out;
  },
  ipconfig(o) {
    const out = [];
    const apipa = o.match(/(?:autokonfiguration ipv4-adresse|autoconfiguration ipv4 address)[ .]*:\s*(169\.254\.\d+\.\d+)/i) || o.match(/inet (169\.254\.\d+\.\d+)/);
    if (apipa) out.push(R('err', `Adresse ${apipa[1]}: kein DHCP-Server erreicht`, 'Der Rechner hat sich selbst eine Notadresse gegeben. Kabel/WLAN, Router und DHCP prüfen; `ipconfig /renew` versuchen.'));
    const v4 = [...o.matchAll(/(?:ipv4-adresse|ipv4 address)[ .]*:\s*([\d.]+)/gi)].map(m => m[1]).concat([...o.matchAll(/\binet (\d+\.\d+\.\d+\.\d+)/g)].map(m => m[1]).filter(ip => !ip.startsWith('127.')));
    const usable = v4.filter(ip => !ip.startsWith('169.254.'));
    if (usable.length) out.push(R('ok', `IPv4-Adresse: ${usable.join(', ')}`));
    else if (!apipa) out.push(R('warn', 'Keine IPv4-Adresse gefunden', 'Ist ein Netzwerkadapter verbunden?'));
    if (/(?:standardgateway|default gateway)[ .]*:\s*$/im.test(o) && usable.length && !/(?:standardgateway|default gateway)[ .]*:\s*\d/i.test(o)) out.push(R('warn', 'Kein Standardgateway', 'Ohne Gateway kein Internet. Bei fester IP das Gateway eintragen.'));
    const dns = [...o.matchAll(/(?:dns-server|dns servers)[ .]*:\s*([\d.:a-f]+)/gi)].map(m => m[1]);
    if (dns.length) out.push(R('info', `DNS-Server: ${[...new Set(dns)].join(', ')}`));
    return out;
  },
  nslookup(o) {
    if (/non-existent domain|nxdomain|can't find|kann .* nicht finden|nicht vorhandene domäne/i.test(o)) return [R('err', 'Name nicht gefunden', 'Den Namen gibt es (beim befragten DNS-Server) nicht – Tippfehler, abgelaufene Domain oder fehlender Eintrag.')];
    if (/timed out|zeitüberschreitung|no response from server/i.test(o)) return [R('err', 'DNS-Server antwortet nicht', 'Netzwerk/Router prüfen oder anderen DNS-Server testen (DNS & Mail-Check).')];
    const parts = o.split(/\n\s*\n/).slice(1).join('\n');
    const ips = [...parts.matchAll(/(\d+\.\d+\.\d+\.\d+|[0-9a-f]*:[0-9a-f:]+)/gi)].map(m => m[1]);
    return ips.length ? [R('ok', `Aufgelöst: ${[...new Set(ips)].slice(0, 4).join(', ')}`)] : [];
  },
  sfc(o) {
    if (/administrator/i.test(o) && /(muss|must)/i.test(o)) return [R('err', 'Administratorrechte nötig')];
    if (/keine integritätsverletzungen|did not find any integrity violations/i.test(o)) return [R('ok', 'Keine beschädigten Systemdateien')];
    if (/erfolgreich repariert|successfully repaired/i.test(o)) return [R('ok', 'Beschädigte Dateien wurden repariert', 'Neustart empfohlen.')];
    if (/einige.*nicht reparieren|unable to fix some/i.test(o)) return [R('err', 'Nicht alle Dateien reparierbar', 'Erst „Komponentenspeicher reparieren“ (DISM RestoreHealth), dann sfc erneut.')];
    if (/integritätsverletzungen|integrity violations/i.test(o)) return [R('warn', 'Integritätsverletzungen gefunden', '„Systemdateien reparieren“ ausführen.')];
    if (/konnte den angeforderten vorgang nicht|could not perform the requested operation/i.test(o)) return [R('err', 'sfc konnte nicht ausgeführt werden', 'Neu starten und erneut versuchen; ggf. im abgesicherten Modus.')];
    return [];
  },
  dism(o) {
    if (/keine komponentenspeicherbeschädigung|no component store corruption/i.test(o)) return [R('ok', 'Komponentenspeicher in Ordnung')];
    if (/kann repariert werden|is repairable/i.test(o)) return [R('warn', 'Komponentenspeicher beschädigt, reparierbar', '„Komponentenspeicher reparieren“ (RestoreHealth) ausführen.')];
    if (/wiederherstellungsvorgang wurde erfolgreich|restore operation completed successfully/i.test(o)) return [R('ok', 'Reparatur erfolgreich', 'Jetzt „Systemdateien reparieren“ (sfc /scannow) ausführen.')];
    const e = o.match(/(?:fehler|error):\s*(0x[0-9a-f]{8}|\d+)/i);
    if (e) return [R('err', `DISM-Fehler ${e[1]}`, 'Den Code im Werkzeug „Fehlercodes“ nachschlagen (z. B. 0x800f081f = Quelldateien fehlen).')];
    return [];
  },
  chkdsk(o) {
    if (/keine probleme|found no problems|the volume appears to be ok|appears to be ok/i.test(o)) return [R('ok', 'Dateisystem in Ordnung')];
    if (/fehler gefunden|found problems|errors found|probleme gefunden|corrupt|needs to be repaired|muss repariert/i.test(o)) return [R('err', 'Fehler im Dateisystem', 'Daten sichern, dann Reparatur mit Neustart einplanen (`chkdsk C: /f`) bzw. Erste Hilfe im Wiederherstellungsmodus.')];
    return [];
  },
  wlan(o) {
    const out = [];
    if (/(?:status|state)\s*:\s*(getrennt|disconnected)/i.test(o)) return [R('info', 'WLAN nicht verbunden')];
    const sig = o.match(/signal\s*:\s*(\d+)\s*%/i);
    if (sig) { const s = +sig[1]; out.push(s >= 70 ? R('ok', `Signal ${s} %`) : s >= 50 ? R('warn', `Signal ${s} %`, 'Ausreichend, aber Abbrüche möglich. Näher an den Router oder Repeater/Mesh.') : R('err', `Signal ${s} %`, 'Schwach: langsam und instabil. Standort, Repeater/Mesh oder Kabel prüfen.')); }
    const rssi = o.match(/signal \/ noise:\s*(-\d+)\s*dbm/i);
    if (rssi) { const v = +rssi[1]; out.push(v >= -60 ? R('ok', `Signal ${v} dBm`) : v >= -70 ? R('warn', `Signal ${v} dBm`, 'Ausreichend, Abbrüche möglich.') : R('err', `Signal ${v} dBm`, 'Schwach.')); }
    const rate = o.match(/(?:empfangsrate|receive rate)[^:]*:\s*([\d.,]+)/i) || o.match(/transmit rate:\s*(\d+)/i);
    if (rate) out.push(R('info', `Übertragungsrate ${rate[1]} Mbit/s`));
    const ch = o.match(/(?:kanal|channel)\s*:\s*(\d+)/i);
    if (ch) out.push(R('info', `Kanal ${ch[1]} (${+ch[1] > 14 ? '5/6 GHz' : '2,4 GHz'})`));
    return out;
  },
  w32tm(o) {
    const src = o.match(/(?:quelle|source)\s*:\s*(.+)/i);
    if (src && /local cmos clock|free-running/i.test(src[1])) return [R('warn', 'Uhrzeit wird nicht synchronisiert', `Quelle: ${src[1].trim()}. „Uhrzeit jetzt synchronisieren“ bzw. Zeitserver/Domäne prüfen.`)];
    if (src) return [R('ok', `Zeitquelle: ${src[1].trim()}`)];
    const off = o.match(/([+-]?\d+\.\d+)\s*\+\/-/);
    if (off) { const v = Math.abs(num(off[1])); return [v < 1 ? R('ok', `Abweichung ${v.toFixed(3)} s`) : R('warn', `Abweichung ${v.toFixed(1)} s`, 'Uhr geht falsch – synchronisieren.')]; }
    if (/dienst wurde nicht gestartet|service has not been started/i.test(o)) return [R('err', 'Zeitdienst läuft nicht', 'Dienst „Windows-Zeitgeber“ (w32time) starten.')];
    return [];
  },
  crypt(o) {
    if (/filevault is on/i.test(o)) return [R('ok', 'FileVault ist aktiv')];
    if (/filevault is off/i.test(o)) return [R('warn', 'FileVault ist aus', 'Bei Notebooks Verschlüsselung empfehlen (Datenschutz bei Verlust).')];
    const on = (o.match(/(?:schutz ist aktiviert|protection on)/gi) || []).length, off = (o.match(/(?:schutz ist deaktiviert|protection off)/gi) || []).length;
    const out = [];
    if (on) out.push(R('ok', `${on} Laufwerk${on > 1 ? 'e' : ''} geschützt`));
    if (off) out.push(R('warn', `${off} Laufwerk${off > 1 ? 'e' : ''} ohne BitLocker-Schutz`, 'Bei Notebooks Verschlüsselung empfehlen; Wiederherstellungsschlüssel sichern.'));
    return out;
  },
  disks(o) {
    const out = [];
    if (/\b(unhealthy|failing|fehlerhaft)\b/i.test(o)) out.push(R('err', 'Datenträger mit Fehlern', 'Sofort Daten sichern und Datenträger tauschen.'));
    else if (/\bwarning\b/i.test(o)) out.push(R('warn', 'Datenträger meldet Warnung', 'SMART-Werte prüfen (Tools → Hardware), Sicherung prüfen.'));
    else if (/\b(healthy|verified)\b/i.test(o)) out.push(R('ok', 'Datenträger in Ordnung'));
    return out;
  },
  tracert(o) {
    const lines = o.split('\n').filter(l => /^\s*\d+\s/.test(l));
    if (!lines.length) return [];
    let tail = 0; for (let i = lines.length - 1; i >= 0 && /(\*\s+){2}\*|zeitüberschreitung|request timed out/i.test(lines[i]); i--) tail++;
    return tail >= 3 ? [R('warn', `Ziel nach ${lines.length - tail} Stationen nicht mehr erreicht`, 'Ab der ersten Station mit nur „*“ antwortet nichts mehr. Liegt das am eigenen Router (Station 1/2) oder beim Provider?')] : [R('ok', `Ziel über ${lines.length} Stationen erreicht`)];
  },
  battery(o) {
    const out = [], c = o.match(/condition:\s*(.+)/i), cyc = o.match(/cycle count:\s*(\d+)/i), cap = o.match(/maximum capacity:\s*(\d+)\s*%/i), pct = o.match(/(\d+)%;\s*(\w+)/);
    if (c) out.push(/normal/i.test(c[1]) ? R('ok', 'Akkuzustand normal') : R('warn', `Akkuzustand: ${c[1].trim()}`, 'Akkutausch empfehlen.'));
    if (cap) { const v = +cap[1]; out.push(v >= 80 ? R('ok', `Maximale Kapazität ${v} %`) : R('warn', `Maximale Kapazität ${v} %`, 'Deutlich gealtert, Laufzeit spürbar kürzer.')); }
    if (cyc) out.push(R('info', `${cyc[1]} Ladezyklen`));
    if (pct) out.push(R('info', `Ladestand ${pct[1]} % (${pct[2]})`));
    return out;
  },
  netq(o) {
    const out = [], d = o.match(/downlink capacity:\s*([\d.]+)\s*(\w+)/i), u = o.match(/uplink capacity:\s*([\d.]+)\s*(\w+)/i), r = o.match(/responsiveness:\s*(\w+)/i);
    if (d) out.push(R('info', `Download ${d[1]} ${d[2]}`));
    if (u) out.push(R('info', `Upload ${u[1]} ${u[2]}`));
    if (r) out.push(/high/i.test(r[1]) ? R('ok', 'Reaktionsfähigkeit hoch') : /medium/i.test(r[1]) ? R('warn', 'Reaktionsfähigkeit mittel', 'Unter Last spürbare Verzögerungen möglich.') : R('err', 'Reaktionsfähigkeit niedrig', 'Videokonferenzen ruckeln unter Last.'));
    return out;
  },
};

// Eigene Regeln: { when: 'contains'|'missing'|'number', pattern, op, value, level, text }
export function evalRules(out, rules = []) {
  const res = [];
  for (const r of rules) {
    let hit = false, val = '';
    try {
      if (r.when === 'number') {
        const m = out.match(new RegExp(r.pattern, 'i'));
        if (m && m[1] != null) { const v = num(m[1]), x = num(r.value); val = m[1]; hit = { '>': v > x, '<': v < x, '>=': v >= x, '<=': v <= x, '=': v === x }[r.op || '>']; }
      } else {
        const has = String(out).toLowerCase().includes(String(r.pattern || '').toLowerCase());
        hit = r.when === 'missing' ? !has : has;
      }
    } catch (_) { hit = false; }
    if (hit) res.push(R(r.level || 'info', (r.text || r.pattern || 'Regel trifft zu').replace('{wert}', val)));
  }
  return res;
}

export function evaluate(cmd, result) {
  const o = String(result.output || '');
  const res = [];
  if (result.timed_out) res.push(R('warn', 'Zeitlimit erreicht – Befehl abgebrochen'));
  if (result.error) res.push(R('err', result.error));
  if (!result.external) {
    if (cmd.ev && EVAL[cmd.ev]) res.push(...EVAL[cmd.ev](o));
    if (cmd.rules?.length) res.push(...evalRules(o, cmd.rules));
    if (!res.length && result.exit_code) res.push(R('warn', `Beendet mit Code ${result.exit_code}`, 'Ausgabe prüfen; Codes lassen sich im Werkzeug „Fehlercodes“ nachschlagen.'));
  }
  return res;
}

// Platzhalter {name} bzw. {name|Vorgabe}
export function placeholders(cmd) {
  const out = [];
  for (const m of String(cmd || '').matchAll(/\{([\p{L}\p{N} _-]{1,30})(?:\|([^}]*))?\}/gu)) if (!out.some(x => x.name === m[1])) out.push({ name: m[1], def: m[2] || '' });
  return out;
}
// Werte dürfen keine Shell-Sonderzeichen enthalten (kein Einschleusen weiterer Befehle)
export const safeValue = v => /^[\p{L}\p{N}._:@/\\+=-]{1,200}$/u.test(v);
export function fillCommand(cmd, values) {
  return String(cmd).replace(/\{([\p{L}\p{N} _-]{1,30})(?:\|([^}]*))?\}/gu, (m, n, d) => { const v = values[n] ?? d ?? ''; if (!safeValue(v)) throw new Error(`Wert für „${n}“ ungültig (keine Leer- oder Sonderzeichen wie & | ; < > " ' $)`); return v; });
}
