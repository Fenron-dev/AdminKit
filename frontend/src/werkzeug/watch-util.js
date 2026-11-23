// Ablauf-Wächter (#129): Fristen sammeln und bewerten (ohne DOM → testbar).
export const KINDS = { domain: 'Domain', cert: 'Zertifikat', license: 'Lizenz/Abo', warranty: 'Garantie', other: 'Sonstiges' };
export function daysUntil(day, now = Date.now()) { if (!day) return null; const t = Date.parse(day + 'T23:59:59'); return isNaN(t) ? null : Math.ceil((t - now) / 86400000); }
export const level = d => d === null ? 'info' : d < 0 ? 'err' : d <= 14 ? 'err' : d <= 30 ? 'warn' : 'ok';
// Einträge aus dem Wächter + Garantien/Lizenzen aus der Kundenakte
export function collect(watch = [], customers = [], now = Date.now()) {
  const out = watch.map(w => ({ ...w, src: 'watch' }));
  for (const c of customers) {
    for (const d of c.devices || []) if (d.warranty) out.push({ id: `k:${c.id}:d:${d.serial || d.name}`, kind: 'warranty', name: `${d.name || d.model || 'Gerät'}${d.serial ? ' (' + d.serial + ')' : ''}`, customer: c.name, due: d.warranty, src: 'kunde', cid: c.id });
    for (const l of c.licenses || []) if (l.until) out.push({ id: `k:${c.id}:l:${l.name}`, kind: 'license', name: l.name || 'Lizenz', customer: c.name, due: l.until, src: 'kunde', cid: c.id });
  }
  return out.map(x => ({ ...x, days: daysUntil(x.due, now) })).sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
}
export const dueSoon = (list, within = 14) => list.filter(x => x.days !== null && x.days <= within);
