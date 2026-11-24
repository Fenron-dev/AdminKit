// Verbindungs-Langzeittest (#124): Auswertung ohne DOM → testbar.
// Ausfall = mindestens `min` Fehlmessungen hintereinander.
export function outages(samples, min = 2) {
  const res = []; let cur = null, n = 0;
  for (const s of samples) {
    if (!s.ok) { if (!cur) { cur = { start: s.t, end: s.t }; n = 0; } cur.end = s.t; n++; }
    else if (cur) { if (n >= min) res.push({ ...cur, n }); cur = null; }
  }
  if (cur && n >= min) res.push({ ...cur, n, open: true });
  return res;
}
export function stats(samples) {
  const ok = samples.filter(s => s.ok), ms = ok.map(s => s.ms).sort((a, b) => a - b);
  return { n: samples.length, loss: samples.length ? Math.round((samples.length - ok.length) / samples.length * 1000) / 10 : 0,
    avg: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length * 10) / 10 : 0, p95: ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : 0, max: ms.length ? ms[ms.length - 1] : 0 };
}
const overlap = (a, b, pad = 3000) => a.start - pad <= b.end && b.start - pad <= a.end;
// Wo liegt der Fehler? Vergleicht Ausfälle von Router, Internet und DNS.
export function diagnose(o) {
  const gw = o.gw || [], net = o.net || [], dns = o.dns || [];
  if (!gw.length && !net.length && !dns.length) return { level: 'ok', text: 'Keine Aussetzer gemessen.' };
  const local = net.filter(x => gw.some(g => overlap(x, g))).length + gw.filter(g => !net.some(x => overlap(x, g))).length;
  const provider = net.filter(x => !gw.some(g => overlap(x, g))).length;
  const dnsOnly = dns.filter(d => !net.some(x => overlap(x, d)) && !gw.some(g => overlap(d, g))).length;
  const parts = [];
  if (local) parts.push(`${local}× war schon der Router nicht erreichbar → Problem im lokalen Netz (WLAN-Empfang, Kabel, Router selbst)`);
  if (provider) parts.push(`${provider}× war der Router erreichbar, das Internet aber nicht → Problem am Anschluss bzw. beim Provider`);
  if (dnsOnly) parts.push(`${dnsOnly}× antwortete nur der DNS-Server nicht → DNS-Problem (Router-DNS oder Provider-DNS)`);
  return { level: local || provider ? 'err' : 'warn', text: parts.join('. ') + '.' };
}
export const toCSV = (targets, samples) => ['Zeit;Ziel;OK;ms', ...targets.flatMap(t => (samples[t.id] || []).map(s => `${new Date(s.t).toISOString()};${t.label};${s.ok ? 1 : 0};${String(s.ms).replace('.', ',')}`))].join('\n');
