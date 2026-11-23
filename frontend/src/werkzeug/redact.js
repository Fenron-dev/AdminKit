// Daten unkenntlich machen (#132): Texte vor dem Weitergeben bereinigen.
// Gleicher Wert → gleicher Platzhalter (z. B. <E-MAIL-1>), damit Zusammenhänge
// erhalten bleiben. Reine Logik, offline.
export const RULES = [
  ['secret', 'Kennwörter/Schlüssel', /\b((?:pass(?:wor[dt])?|pwd|kennwort|secret|token|api[-_]?key|client[-_]?secret|authorization)\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, 'GEHEIM', 2],
  ['bearer', 'Bearer-/Basic-Token', /\b((?:Bearer|Basic)\s+)([A-Za-z0-9._~+/=-]{12,})/g, 'TOKEN', 2],
  ['email', 'E-Mail-Adressen', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'E-MAIL'],
  ['url', 'Adressen mit Zugangsdaten', /\b([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+:[^\s@/]+)@/gi, 'ZUGANG', 2],
  ['mac', 'MAC-Adressen', /\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b/g, 'MAC'],
  ['ipv4', 'IPv4-Adressen', /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g, 'IP'],
  ['ipv6', 'IPv6-Adressen', /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi, 'IPV6'],
  ['userpath', 'Benutzernamen in Pfaden', /((?:[A-Za-z]:\\(?:Users|Benutzer)\\|\/Users\/|\/home\/))([^\\/\s"']+)/g, 'BENUTZER', 2],
  ['phone', 'Telefonnummern', /(?<![\w.])(?:\+\d{2}|0)[\d ()/-]{6,}\d(?![\w.])/g, 'TELEFON'],
  ['iban', 'IBAN', /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g, 'IBAN'],
  ['serial', 'Seriennummern (nach „Serial/Seriennummer“)', /\b((?:serial(?:\s*number)?|seriennummer|s\/n|service\s*tag)\s*[:=#]?\s*)([A-Z0-9-]{5,})/gi, 'SERIENNR', 2],
  ['host', 'Rechnernamen (nach „Computer/Host“)', /\b((?:computername|computer|hostname|host|rechnername|arbeitsstation|workstation)\s*[:=]\s*)([\w.-]{2,})/gi, 'RECHNER', 2],
];
export const DEFAULT_ON = RULES.map(r => r[0]);

// opts: { rules: [ids], names: ['Müller', …] (eigene Begriffe) }
export function redact(text, opts = {}) {
  const on = new Set(opts.rules || DEFAULT_ON), maps = {}, counts = {};
  const ph = (label, val) => { const m = maps[label] = maps[label] || new Map(); if (!m.has(val)) m.set(val, `<${label}-${m.size + 1}>`); counts[label] = (counts[label] || 0) + 1; return m.get(val); };
  let s = String(text || '');
  for (const [id, , re, label, grp] of RULES) {
    if (!on.has(id)) continue;
    s = s.replace(re, (m, ...g) => {
      if (/^<[A-Z0-9-]+-\d+>$/.test(m)) return m;
      if (grp) return g[0] + ph(label, g[1]);
      if (id === 'ipv4' && /^(0\.0\.0\.0|127\.0\.0\.1|255\.255\.255\.\d+)$/.test(m)) return m; // harmlose Standardwerte behalten
      return ph(label, m.toLowerCase());
    });
  }
  // Eigene Begriffe zuletzt, damit E-Mail-Adressen usw. vorher als Ganzes erkannt werden
  for (const n of (opts.names || []).map(x => String(x).trim()).filter(x => x.length > 1).sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => ph('NAME', m.toLowerCase()));
  }
  return { text: s, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}
