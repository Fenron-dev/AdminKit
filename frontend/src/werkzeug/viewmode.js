// Karten-/Listenansicht (#94) für Wiki, Links und Handbuch. Die Wahl liegt
// pro Bereich im Werkzeug-Zustand des Vaults (kein localStorage – auf dem
// Kunden-PC soll nichts zurückbleiben).
import { ic } from './icons.js';

const KEY = area => 'view.' + area;

export function getView(ctx, area) {
  const v = ctx?.state?.get(KEY(area), 'cards');
  return v === 'list' ? 'list' : 'cards';
}

export function setView(ctx, area, v, root) {
  ctx.state.set(KEY(area), v === 'list' ? 'list' : 'cards');
  root?.querySelectorAll('.view-toggle [data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
}

export const viewToggleHTML = cur => `<div class="seg view-toggle" role="group" aria-label="Ansicht">` +
  `<button type="button" data-view="cards" aria-pressed="${cur !== 'list'}" title="Kartenansicht">${ic('grid')}</button>` +
  `<button type="button" data-view="list" aria-pressed="${cur === 'list'}" title="Listenansicht">${ic('list')}</button></div>`;
