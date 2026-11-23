// Abläufe (#119): Schritte aus einem Wiki-Artikel lesen und Protokoll erzeugen.
// Reine Logik ohne DOM → testbar.

// Schritte: ##-Abschnitte (sonst ###); ohne Überschriften die Checklisten-Punkte;
// sonst der ganze Artikel als ein Schritt. Text vor der ersten Überschrift = Einleitung.
export function parseSteps(body) {
  const src = String(body || '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  // Überschriften in Codeblöcken ignorieren
  let fence = false;
  const heads = [];
  lines.forEach((l, i) => { if (/^(`{3,}|~{3,})/.test(l.trim())) fence = !fence; else if (!fence) { const m = l.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/); if (m) heads.push({ i, lvl: m[1].length, t: m[2] }); } });
  for (const lvl of [2, 3]) {
    const H = heads.filter(h => h.lvl === lvl);
    if (H.length) {
      return {
        intro: lines.slice(0, H[0].i).join('\n').trim(),
        steps: H.map((h, k) => ({ title: h.t.replace(/^\d+[.)]\s*/, ''), body: lines.slice(h.i + 1, k + 1 < H.length ? H[k + 1].i : lines.length).join('\n').trim() })),
      };
    }
  }
  const tasks = lines.map((l, i) => ({ l, i, m: l.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+)$/) })).filter(x => x.m);
  if (tasks.length) return { intro: lines.slice(0, tasks[0].i).join('\n').trim(), steps: tasks.map(x => ({ title: x.m[1].trim(), body: '' })) };
  return { intro: '', steps: [{ title: 'Durchführen', body: src.trim() }] };
}

export function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60);
  return h ? `${h} Std. ${m % 60} Min.` : `${m} Min.`;
}
const fmtDT = t => t ? new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
const OSN = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
const LVL = { ok: '✓', warn: '⚠', err: '✗', info: 'ℹ' };
const MAX_OUT = 20000;
export const clipOutput = s => String(s || '').length > MAX_OUT ? String(s).slice(0, MAX_OUT) + '\n… (gekürzt)' : String(s || '');

// Protokoll als Markdown (wird als Wiki-Artikel in „Protokolle“ gespeichert)
export function buildProtocol(run) {
  const done = run.steps.filter(s => s.done).length;
  const L = [];
  L.push(`> [!INFO] ${run.finished ? 'Abgeschlossen' : 'In Arbeit'} – ${done} von ${run.steps.length} Schritten erledigt`);
  L.push(`> Vorlage: ${run.template ? `[${run.templateTitle || run.template}](#/wiki/a/${run.template})` : '–'}  `);
  if (run.customer) L.push(`> Kunde/Ticket: ${run.customer}  `);
  L.push(`> System: ${OSN[run.os] || run.os || '–'}  `);
  L.push(`> Beginn: ${fmtDT(run.started)} · Ende: ${fmtDT(run.finished)}${run.finished ? ` · Dauer: ${fmtDuration(run.finished - run.started)}` : ''}`);
  if (run.notes?.trim()) L.push('', run.notes.trim());
  run.steps.forEach((s, i) => {
    L.push('', `## ${s.done ? '✓' : '○'} ${i + 1}. ${s.title}`);
    if (s.doneAt) L.push(`*erledigt ${fmtDT(s.doneAt)}*`);
    if (s.notes?.trim()) L.push('', s.notes.trim());
    for (const m of s.media || []) L.push('', m);
    for (const o of s.outputs || []) {
      L.push('', `**${o.name}** – \`${o.command}\`${o.evals?.length ? '  ' : ''}`);
      for (const e of o.evals || []) L.push(`${LVL[e.level] || '•'} ${e.title}${e.text ? ' – ' + e.text : ''}  `);
      if (o.output) L.push('', '```console', clipOutput(o.output), '```');
    }
  });
  return L.join('\n') + '\n';
}
