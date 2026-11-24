// Erzeugt frontend/src/werkzeug/data/oui.js aus der offiziellen IEEE-Liste (#109).
// Aufruf: curl -o /tmp/oui.csv https://standards-oui.ieee.org/oui/oui.csv
//         node scripts/gen-oui.mjs /tmp/oui.csv
// Ausgabe: V = Herstellernamen (gekürzt, ohne Rechtsform), O = "OUI<Index base36>;…" sortiert.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) { console.error('Pfad zur oui.csv angeben'); process.exit(1); }

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
// Rechtsformen und Füllwörter am Ende entfernen
const SUFFIX = /[\s,.]+(co|company|corp|corporation|inc|incorporated|ltd|limited|llc|gmbh|ag|kg|se|sa|s\.a|sas|srl|s\.r\.l|spa|s\.p\.a|bv|b\.v|nv|ab|oy|as|a\/s|plc|pte|pty|kk|k\.k|technology|technologies|tech|electronics|international|holdings?|group|trading|manufacturing|industrial|systems?)\.?$/i;
function short(n) {
  let s = n.replace(/\s+/g, ' ').trim(), prev;
  do { prev = s; s = s.replace(SUFFIX, '').replace(/[\s,.(]+$/, '').trim(); } while (s !== prev && s.length > 3);
  return s || n.trim();
}
const rows = parseCSV(readFileSync(src, 'utf8')).slice(1).filter(r => r[0] === 'MA-L' && /^[0-9A-F]{6}$/.test(r[1]));
const names = [], idx = new Map(), pairs = [];
for (const [, oui, org] of rows) {
  const n = short(org);
  if (!idx.has(n)) { idx.set(n, names.length); names.push(n); }
  pairs.push([oui, idx.get(n)]);
}
pairs.sort((a, b) => a[0] < b[0] ? -1 : 1);
const out = `// Automatisch erzeugt mit scripts/gen-oui.mjs aus der IEEE-OUI-Liste (MA-L), Stand ${new Date().toISOString().slice(0, 10)}.\n// Nicht von Hand bearbeiten. ${pairs.length} Einträge, ${names.length} Hersteller.\n` +
  `export const V=${JSON.stringify(names)};\nexport const O=${JSON.stringify(pairs.map(([o, i]) => o + i.toString(36)).join(';'))};\n`;
writeFileSync(new URL('../frontend/src/werkzeug/data/oui.js', import.meta.url), out);
console.log(`${pairs.length} OUIs, ${names.length} Hersteller, ${(out.length / 1024).toFixed(0)} KB`);
