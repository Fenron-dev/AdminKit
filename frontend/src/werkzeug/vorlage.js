// Platzhalter in Markdown-Vorlagen (#96). Keine DOM-Zugriffe → mit node --test prüfbar.
//   {{Kunde}}                 Eingabefeld
//   {{Kostenrahmen|150 €}}    mit Vorgabe (in Tabellen: {{Feld\|Vorgabe}})
//   {{Fehler:lang}}           mehrzeiliges Feld (auch {{Fehler:lang|Vorgabe}})
// Platzhalter in `Code` werden ignoriert (z. B. in Erklärtexten).

const RE = /\{\{\s*([^{}|:\\]+?)\s*(?::\s*(lang)\s*)?(?:\\?\|([^{}]*))?\}\}/g;

// Ruft fn für alle Textstücke außerhalb von `Code` auf.
function outsideCode(text, fn) {
  return String(text).split(/(`[^`\n]*`)/).map((part, i) => (i % 2 ? part : fn(part))).join('');
}

/** Alle Felder in Reihenfolge des ersten Auftretens: [{ name, long, def }]. */
export function fields(text) {
  const out = [], seen = new Map();
  outsideCode(text, part => {
    for (const m of part.matchAll(RE)) {
      const name = m[1].trim();
      const f = seen.get(name);
      if (f) { f.long = f.long || !!m[2]; if (!f.def && m[3]) f.def = m[3].trim(); continue; }
      const nf = { name, long: !!m[2], def: (m[3] || '').trim() };
      seen.set(name, nf); out.push(nf);
    }
    return part;
  });
  return out;
}

/** Setzt Werte ein. Leere Werte → Vorgabe, sonst leer. */
export function fill(text, values) {
  return String(text).split('\n').map(line => {
    const inTable = /^\s*\|/.test(line);
    return outsideCode(line, part => part.replace(RE, (m, name, long, def) => {
      let v = values[name.trim()];
      if (v == null || String(v).trim() === '') v = (def || '').trim();
      v = String(v).replace(/\r\n?/g, '\n').trim();
      if (inTable) return v.split('\n').map(s => s.trim()).filter(Boolean).join(', ').replace(/\|/g, '\\|');
      // Mehrzeilig außerhalb von Tabellen: Listen bleiben Listen, sonst harte Umbrüche
      return v.split('\n').map((s, i, a) => (i < a.length - 1 && !/^\s*([-*+]|\d+\.)\s/.test(a[i + 1]) ? s + '  ' : s)).join('\n');
    }));
  }).join('\n');
}

/** Automatisch vorbelegte Felder. */
export function autoValues(info, now = new Date()) {
  return {
    Datum: now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    Techniker: info?.technician || '',
    Firma: info?.company || '',
    Kunde: info?.customer || '',
  };
}
