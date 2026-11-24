// Treemap-Geometrie (#98). Ausführen: cd frontend && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squarify, hitTest } from '../treemap.js';

test('Flächen proportional, lückenlos, im Rahmen', () => {
  const items = [600, 300, 60, 25, 10, 5].map((size, i) => ({ id: i, size }));
  const r = squarify(items, 0, 0, 400, 250);
  assert.equal(r.length, 6);
  const total = 1000, area = 400 * 250;
  let sum = 0;
  for (const x of r) {
    const a = x.w * x.h; sum += a;
    assert.ok(Math.abs(a - x.item.size / total * area) < 1e-6, 'Fläche proportional');
    assert.ok(x.x >= -1e-9 && x.y >= -1e-9 && x.x + x.w <= 400 + 1e-6 && x.y + x.h <= 250 + 1e-6, 'im Rahmen');
  }
  assert.ok(Math.abs(sum - area) < 1e-6, 'lückenlos');
  // Squarified: keine extrem schmalen Kacheln bei diesen Werten
  for (const x of r.slice(0, 3)) assert.ok(Math.max(x.w / x.h, x.h / x.w) < 4, 'Seitenverhältnis');
});

test('Nullgrößen werden ignoriert, Treffer findet Kachel', () => {
  const r = squarify([{ size: 0 }, { size: 3, n: 'a' }, { size: 1, n: 'b' }], 0, 0, 100, 100);
  assert.equal(r.length, 2);
  assert.equal(hitTest(r, 10, 10).n, 'a');
  assert.equal(hitTest(r, 500, 500), null);
  assert.deepEqual(squarify([], 0, 0, 10, 10), []);
});
