import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../entries.js';

const B = [
  { id: 'pw', name: 'Passwort', group: 'Sicherheit', tags: ['Passwort', 'Sicherheit'], keys: 'generator' },
  { id: 'mail', name: 'Mail-Diagnose', group: 'Netz', tags: ['Mail'], keys: 'bounce' },
  { id: 'win', name: 'Nur Windows', group: 'Netz', tags: [], platforms: ['windows'] },
];

test('Sammlung: Parsen ist robust', () => {
  assert.deepEqual(E.parseCollection('kaputt'), E.emptyCollection());
  assert.deepEqual(E.parseCollection('[]'), E.emptyCollection());
  const c = E.parseCollection({ entries: [{ id: 'a', name: ' X ', tags: ['a', 'A', ' b ', ''], platforms: ['windows', 'dos'] }, { name: 'ohne id' }], overrides: { pw: { tags: [], hidden: 0 }, mail: { group: ' Neu ', hidden: true } }, tagAlias: { Mail: 'E-Mail' } });
  assert.equal(c.entries.length, 1);
  assert.deepEqual(c.entries[0].tags, ['a', 'b']);
  assert.deepEqual(c.entries[0].platforms, ['windows']);
  assert.deepEqual(c.overrides, { mail: { group: 'Neu', hidden: true } });
  assert.deepEqual(c.tagAlias, { mail: 'E-Mail' });
});

test('Zusammenführen, Filter, Synonyme, Plattform', () => {
  const c = E.parseCollection({ entries: [{ id: 'own', name: 'Drucker-Spickzettel', group: 'Eigene', tags: ['Drucker'], text: 'spooler neu starten' }], overrides: { pw: { tags: ['Kunde'] }, mail: { hidden: true } } });
  const all = E.mergeEntries(B, c);
  assert.equal(all.length, 4);
  assert.deepEqual(all[0].tags, ['Passwort', 'Sicherheit', 'Kunde']);
  assert.equal(all[0].group, 'Sicherheit');
  assert.equal(B[0].tags.length, 2, 'Original bleibt unverändert');
  assert.equal(E.filterEntries(all).some(e => e.id === 'mail'), false, 'ausgeblendet');
  assert.deepEqual(E.filterEntries(all, { q: 'kennwort' }).map(e => e.id), ['pw'], 'Synonym');
  assert.deepEqual(E.filterEntries(all, { q: 'spooler' }).map(e => e.id), ['own'], 'Inhalt eigener Einträge');
  assert.deepEqual(E.filterEntries(all, { tags: ['sicherheit', 'kunde'] }).map(e => e.id), ['pw'], 'alle Tags');
  assert.equal(E.filterEntries(all, { platform: 'macos' }).some(e => e.id === 'win'), false);
  assert.equal(E.filterEntries(all, { platform: 'windows' }).some(e => e.id === 'win'), true);
  assert.deepEqual(E.orderGroups(all, ['Netz', 'Sicherheit'], c), ['Netz', 'Sicherheit', 'Eigene']);
  c.groupOrder = ['Eigene'];
  assert.deepEqual(E.orderGroups(all, ['Netz', 'Sicherheit'], c), ['Eigene', 'Netz', 'Sicherheit']);
});

test('Tags umbenennen, zusammenführen, entfernen', () => {
  const c = E.parseCollection({ entries: [{ id: 'a', name: 'A', tags: ['Mail', 'Kunde'] }], overrides: { pw: { tags: ['Kunde'] } } });
  E.renameTag(c, 'Sicherheit', 'Security');
  E.renameTag(c, 'kunde', 'Kunden');
  let all = E.mergeEntries(B, c);
  assert.deepEqual(all[0].tags, ['Passwort', 'Security', 'Kunden']);
  assert.deepEqual(all[3].tags, ['Mail', 'Kunden']);
  E.renameTag(c, 'Security', 'Passwort'); // zusammenführen
  all = E.mergeEntries(B, c);
  assert.deepEqual(all[0].tags, ['Passwort', 'Kunden']);
  E.renameTag(c, 'Mail', '');
  all = E.mergeEntries(B, c);
  assert.deepEqual(all[1].tags, []);
  assert.deepEqual(all[3].tags, ['Kunden']);
  assert.equal(E.tagCounts(all)[0].tag, 'Kunden');
});

test('Import: IDs eindeutig, Anpassungen übernommen', () => {
  const c = E.parseCollection({ entries: [{ id: 'a', name: 'A' }] });
  const r = E.importCollection(c, JSON.stringify({ entries: [{ id: 'a', name: 'A2' }, { id: 'pw', name: 'Kollision' }], overrides: { mail: { hidden: true } } }), ['pw']);
  assert.equal(r.added, 2);
  assert.deepEqual(c.entries.map(e => e.id), ['a', 'a-2', 'pw-2']);
  assert.equal(c.overrides.mail.hidden, true);
  assert.equal(E.uniqueId('Größe & Maße', new Set()), 'groesse-masse');
});
