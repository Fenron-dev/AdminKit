// Vorlagen-Platzhalter und Markdown-Ergänzungen (#96). Ausführen: cd frontend && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fields, fill, autoValues } from '../vorlage.js';
import { md } from '../markdown.js';

test('Felder: Reihenfolge, Vorgabe, lang, Code ignoriert', () => {
  const f = fields('Hallo {{Kunde}} | {{Ort\\|vor Ort}}\n{{Fehler:lang|–}} {{Kunde}} `{{NichtDies}}`');
  assert.deepEqual(f, [
    { name: 'Kunde', long: false, def: '' },
    { name: 'Ort', long: false, def: 'vor Ort' },
    { name: 'Fehler', long: true, def: '–' },
  ]);
});

test('Ausfüllen: Tabellen bleiben intakt, mehrzeilig mit Umbrüchen', () => {
  const t = '| **Kunde** | {{Kunde}} |\n|---|---|\n| Ort | {{Ort\\|vor Ort}} |\n\n{{Arbeiten:lang}}';
  const out = fill(t, { Kunde: 'A | B\nGmbH', Arbeiten: 'Zeile 1\nZeile 2' });
  assert.match(out, /\| A \\\| B, GmbH \|/);
  assert.match(out, /\| vor Ort \|/);
  assert.match(out, /Zeile 1  \nZeile 2/);
  const html = md(out);
  assert.match(html, /<th>A \| B, GmbH<\/th>/);
  assert.match(html, /Zeile 1<br>Zeile 2/);
});

test('Listen in mehrzeiligen Feldern bleiben Listen', () => {
  const html = md(fill('{{P:lang}}', { P: '- eins\n- zwei' }));
  assert.match(html, /<ul><li>eins<\/li><li>zwei<\/li><\/ul>/);
});

test('Automatische Werte', () => {
  const v = autoValues({ technician: 'Dennis', company: 'IT GmbH', customer: 'Müller' }, new Date(2026, 10, 21));
  assert.equal(v.Datum, '21.11.2026');
  assert.equal(v.Techniker, 'Dennis');
});

test('Mitgelieferte Vorlagen: ausfüllbar und renderbar', () => {
  const t = readFileSync(new URL('../../../../internal/werkzeug/dokumente_seeds/Kundendienst/Kundendienstzettel.md', import.meta.url), 'utf8');
  const names = fields(t).map(f => f.name);
  assert.ok(names.includes('Kunde') && names.includes('Fehlerbeschreibung'));
  const html = md(fill(t, { Kunde: 'Test' }));
  assert.ok(!/\{\{/.test(html), 'Platzhalter übrig');
  assert.match(html, /<td>vor Ort<\/td>/);
});

test('Tabellen mit leerer Kopfzeile ohne thead', () => {
  const html = md('| | |\n|---|---|\n| **A** | b |');
  assert.ok(!html.includes('<thead>'));
  assert.match(html, /<td><strong>A<\/strong><\/td><td>b<\/td>/);
});
