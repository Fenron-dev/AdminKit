// Eigene Einträge (#105): gemeinsames Format für alles, was der Nutzer im
// Werkzeugkasten erweitern kann (eigene Werkzeuge, später Befehle, Mailkonten,
// Router …). Eine Sammlung liegt im Vault unter werkzeug/eintraege/<art>.json.
// Reine Logik ohne DOM → mit `node --test` prüfbar.
//
// Sammlung:
//   { version: 1,
//     entries:   [ { id, name, group, tags[], platforms[], … } ],   eigene Einträge
//     overrides: { <id>: { group?, tags?[], hidden? } },            Anpassungen an mitgelieferten
//     groupOrder: [ … ],                                            eigene Reihenfolge der Gruppen
//     tagAlias:  { <tag klein>: <neuer Name> | '' } }               umbenannte / entfernte Tags
// Mitgelieferte Einträge werden nie verändert – nur über overrides ergänzt.

export const PLATFORMS = [['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux']];
const PLAT_IDS = PLATFORMS.map(p => p[0]);
export const platName = id => (PLATFORMS.find(p => p[0] === id) || [, id])[1];

export const emptyCollection = () => ({ version: 1, entries: [], overrides: {}, groupOrder: [], tagAlias: {} });

const isObj = o => o && typeof o === 'object' && !Array.isArray(o);

export function normTags(arr) {
  const seen = new Set(), out = [];
  for (let t of Array.isArray(arr) ? arr : []) {
    t = String(t ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  return out;
}
export const splitTags = s => normTags(String(s || '').split(','));
export const normPlatforms = arr => [...new Set((Array.isArray(arr) ? arr : []).filter(p => PLAT_IDS.includes(p)))];

export function normEntry(e) {
  return Object.assign({}, e, {
    id: String(e.id), name: String(e.name || '').trim(), group: String(e.group || '').trim(),
    tags: normTags(e.tags), platforms: normPlatforms(e.platforms),
  });
}

export function parseCollection(src) {
  let o;
  try { o = typeof src === 'string' ? JSON.parse(src || '{}') : src; } catch (_) { o = null; }
  const c = emptyCollection();
  if (!isObj(o)) return c;
  if (Array.isArray(o.entries)) c.entries = o.entries.filter(e => isObj(e) && typeof e.id === 'string' && e.id).map(normEntry);
  if (isObj(o.overrides)) for (const [id, v] of Object.entries(o.overrides)) if (isObj(v)) {
    const x = {};
    if (typeof v.group === 'string' && v.group.trim()) x.group = v.group.trim();
    if (Array.isArray(v.tags) && v.tags.length) x.tags = normTags(v.tags);
    if (v.hidden) x.hidden = true;
    if (Object.keys(x).length) c.overrides[id] = x;
  }
  if (Array.isArray(o.groupOrder)) c.groupOrder = [...new Set(o.groupOrder.filter(g => typeof g === 'string' && g.trim()))];
  if (isObj(o.tagAlias)) for (const [k, v] of Object.entries(o.tagAlias)) if (typeof v === 'string') c.tagAlias[k.toLowerCase()] = v.trim();
  return c;
}

export function applyAlias(tags, alias) {
  return normTags(tags.map(t => { const a = alias && alias[t.toLowerCase()]; return a === undefined ? t : a; }));
}

// Mitgelieferte + eigene Einträge zu einer Liste zusammenführen
export function mergeEntries(builtin, coll) {
  const al = coll.tagAlias;
  return builtin.map(b => {
    const o = coll.overrides[b.id] || {};
    return Object.assign({}, b, {
      builtin: true, group: o.group || b.group, baseGroup: b.group,
      tags: applyAlias(normTags([...(b.tags || []), ...(o.tags || [])]), al), extraTags: o.tags || [],
      platforms: normPlatforms(b.platforms), hidden: !!o.hidden,
    });
  }).concat(coll.entries.map(e => Object.assign({}, e, { own: true, tags: applyAlias(e.tags, al) })));
}

// Synonyme für die Suche (jede Zeile = gleichwertige Begriffe)
export const SYN = [
  ['passwort', 'kennwort', 'password', 'pw'], ['wlan', 'wifi', 'wi-fi'], ['mail', 'email', 'e-mail'],
  ['drucker', 'printer', 'drucken'], ['rechner', 'pc', 'computer'], ['netzwerk', 'network', 'lan'],
  ['fehler', 'error', 'problem', 'störung'], ['zertifikat', 'ssl', 'tls'], ['befehl', 'kommando', 'command', 'cmd'],
  ['handy', 'smartphone', 'telefon', 'mobil'], ['mac', 'macos', 'apple'], ['windows', 'win'],
  ['anleitung', 'howto', 'tutorial'], ['qr', 'qr-code'], ['ip', 'ip-adresse', 'adresse'],
];
export function expandWord(w) {
  const row = SYN.find(r => r.includes(w));
  return row ? row : [w];
}

export function haystack(e) {
  return [e.name, e.keys, e.group, (e.tags || []).join(' '), (e.platforms || []).map(platName).join(' '), e.text || '']
    .join(' ').toLowerCase();
}

// Filter: Textsuche (alle Wörter, mit Synonymen), Tags (alle gewählten), Plattform
export function filterEntries(list, { q = '', tags = [], platform = '', showHidden = false } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const want = tags.map(t => t.toLowerCase());
  return list.filter(e => {
    if (e.hidden && !showHidden) return false;
    if (platform && e.platforms?.length && !e.platforms.includes(platform)) return false;
    if (want.length) { const have = (e.tags || []).map(t => t.toLowerCase()); if (!want.every(t => have.includes(t))) return false; }
    if (!words.length) return true;
    const hay = haystack(e);
    return words.every(w => expandWord(w).some(x => hay.includes(x)) || (typeof e.match === 'function' && e.match(w)));
  });
}

export function tagCounts(list) {
  const m = new Map();
  for (const e of list) for (const t of e.tags || []) { const k = t.toLowerCase(), x = m.get(k); if (x) x.n++; else m.set(k, { tag: t, n: 1 }); }
  return [...m.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'de'));
}

// Gruppen in Anzeige-Reihenfolge: eigene Reihenfolge, dann Standard, dann neue alphabetisch
export function orderGroups(list, baseOrder, coll) {
  const used = new Set(list.map(e => e.group || 'Eigene'));
  const out = [];
  for (const g of [...coll.groupOrder, ...baseOrder]) if (used.has(g) && !out.includes(g)) out.push(g);
  [...used].filter(g => !out.includes(g)).sort((a, b) => a.localeCompare(b, 'de')).forEach(g => out.push(g));
  return out;
}

// Tag umbenennen (to = '' entfernt ihn). Gilt für mitgelieferte (über Alias)
// und eigene Einträge; bestehender Tag gleichen Namens wird zusammengeführt.
export function renameTag(coll, from, to) {
  const f = from.toLowerCase(); to = String(to || '').trim().slice(0, 40);
  if (to && to.toLowerCase() === f && to === from) return coll;
  const swap = tags => normTags(tags.flatMap(t => t.toLowerCase() === f ? (to ? [to] : []) : [t]));
  coll.entries.forEach(e => { e.tags = swap(e.tags); });
  for (const o of Object.values(coll.overrides)) if (o.tags) { o.tags = swap(o.tags); if (!o.tags.length) delete o.tags; }
  for (const [k, v] of Object.entries(coll.tagAlias)) if (v.toLowerCase() === f) coll.tagAlias[k] = to;
  coll.tagAlias[f] = to;
  return coll;
}

export function uniqueId(base, used) {
  base = String(base).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'eintrag';
  let id = base, n = 2;
  while (used.has(id)) id = base + '-' + (n++);
  return id;
}

// Import: eigene Einträge ergänzen (IDs bei Konflikt neu), Anpassungen übernehmen
export function importCollection(coll, incoming, reservedIds = []) {
  const inc = parseCollection(incoming);
  const used = new Set([...reservedIds, ...coll.entries.map(e => e.id)]);
  let added = 0;
  for (const e of inc.entries) {
    const id = used.has(e.id) ? uniqueId(e.id, used) : e.id;
    used.add(id); coll.entries.push(Object.assign({}, e, { id })); added++;
  }
  Object.assign(coll.overrides, inc.overrides);
  Object.assign(coll.tagAlias, inc.tagAlias);
  if (!coll.groupOrder.length) coll.groupOrder = inc.groupOrder;
  return { added, overrides: Object.keys(inc.overrides).length };
}
