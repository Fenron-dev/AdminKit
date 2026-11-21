// Subnetzrechner – aus dem Ideler-Portal übernommen.
import { $, esc, ic } from '../ui.js';

export function ipToInt(s) { const p = s.split('.'); if (p.length !== 4) return null; let n = 0; for (const x of p) { if (!/^\d{1,3}$/.test(x) || +x > 255) return null; n = n * 256 + (+x); } return n >>> 0; }
export const intToIp = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

// Reine Berechnung: liefert {error} oder die Netzdaten
export function calcNet(v) {
  const m = String(v).trim().match(/^(\d+\.\d+\.\d+\.\d+)\s*(?:\/\s*(\d{1,2})|\s+(\d+\.\d+\.\d+\.\d+))?$/);
  if (!m) return { error: 'Format nicht erkannt. Gib eine Adresse wie 10.0.0.5/24 oder 10.0.0.5 255.255.255.0 ein.' };
  const ip = ipToInt(m[1]); if (ip == null) return { error: 'Jeder Block der Adresse muss zwischen 0 und 255 liegen.' };
  let pre = m[2] != null ? +m[2] : 24;
  if (m[3]) {
    const mk = ipToInt(m[3]); if (mk == null) return { error: 'Die Subnetzmaske ist keine gültige Adresse.' };
    const b = mk.toString(2).padStart(32, '0');
    if (!/^1*0*$/.test(b)) return { error: 'Die Subnetzmaske muss aus durchgehenden Einsen bestehen, z. B. 255.255.255.192.' };
    pre = b.indexOf('0') < 0 ? 32 : b.indexOf('0');
  }
  if (pre > 32) return { error: 'Das Präfix muss zwischen 0 und 32 liegen.' };
  const mask = pre === 0 ? 0 : (0xFFFFFFFF << (32 - pre)) >>> 0, net = (ip & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
  const hosts = pre === 32 ? 1 : pre === 31 ? 2 : Math.pow(2, 32 - pre) - 2, first = pre >= 31 ? net : net + 1, last = pre >= 31 ? bc : bc - 1;
  const o1 = ip >>> 24, o2 = (ip >>> 16) & 255; let kind = 'Öffentliche Adresse';
  if (o1 === 10 || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168)) kind = 'Privat (RFC 1918)';
  else if (o1 === 127) kind = 'Loopback'; else if (o1 === 169 && o2 === 254) kind = 'Link-Local (APIPA)';
  else if (o1 === 100 && o2 >= 64 && o2 <= 127) kind = 'Carrier-Grade-NAT'; else if (o1 >= 224 && o1 <= 239) kind = 'Multicast';
  return { ip, pre, net: intToIp(net) + '/' + pre, broadcast: intToIp(bc), mask: intToIp(mask), wildcard: intToIp((~mask) >>> 0),
    first: intToIp(first), last: intToIp(last), hosts, kind };
}

let lastInput = '192.168.10.34/26';

export default {
  id: 'net', name: 'Subnetzrechner', group: 'Netzwerk & Mail', icon: 'network',
  keys: 'subnetz ip netzmaske cidr', online: false,
  render(p) {
    p.innerHTML = `<div class="util"><h3>Subnetzrechner</h3><p>IPv4-Adresse mit Präfix oder Subnetzmaske eingeben, zum Beispiel <code>192.168.10.34/26</code>.</p>
      <div class="stack"><label class="field"><span>Adresse</span><input id="netIn" class="input" value="${esc(lastInput)}" spellcheck="false" autocomplete="off"></label><div id="netBits"></div></div><div id="netOut"></div></div>`;
    const draw = () => {
      lastInput = $('#netIn', p).value;
      const out = $('#netOut', p), bitsEl = $('#netBits', p), r = calcNet(lastInput);
      if (r.error) { out.innerHTML = `<div class="out-box err">${r.error}</div>`; bitsEl.innerHTML = ''; return; }
      const rows = [['Netzadresse', r.net], ['Broadcast', r.broadcast], ['Subnetzmaske', r.mask], ['Wildcard', r.wildcard], ['Erster Host', r.first], ['Letzter Host', r.last], ['Nutzbare Hosts', r.hosts.toLocaleString('de-DE')], ['Adressbereich', r.kind]];
      out.innerHTML = `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}<button class="icon-btn copy" type="button" data-copy="${esc(v)}" aria-label="${k} kopieren">${ic('copy')}</button></dd>`).join('')}</dl>`;
      const b = r.ip.toString(2).padStart(32, '0');
      bitsEl.innerHTML = `<div class="bits" aria-label="Bitdarstellung der Adresse">${[0, 1, 2, 3].map(o => `<div class="oct">${[...b.slice(o * 8, o * 8 + 8)].map((x, j) => `<span class="bit${o * 8 + j < r.pre ? ' n' : ''}">${x}</span>`).join('')}</div>`).join('')}</div>
        <div class="bits-legend" style="margin-top:10px"><span><i style="background:color-mix(in srgb, var(--color-primary) 50%, transparent)"></i>Netzanteil (${r.pre} Bit)</span><span><i style="background:var(--color-surface-2)"></i>Hostanteil (${32 - r.pre} Bit)</span></div>`;
    };
    $('#netIn', p).addEventListener('input', draw); draw();
  },
};
