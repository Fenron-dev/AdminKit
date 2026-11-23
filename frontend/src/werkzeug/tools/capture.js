// Bildschirmaufnahme als Werkzeug (#121): Screenshot mit Markierungen oder Video
// aufnehmen und als Datei speichern. Im Wiki-Editor gibt es dafür „Aufnahme“.
import { ic } from '../ui.js';

export default {
  id: 'capture', name: 'Bildschirmaufnahme', group: 'Windows & macOS', icon: 'camera', tags: ['Dokumentation', 'Screenshot', 'Video'],
  keys: 'screenshot bildschirmfoto aufnahme video aufnehmen bildschirm schwärzen markieren anleitung dokumentation gif', online: false,
  render(p, ctx) {
    p.innerHTML = `<div class="util wide"><h3>Bildschirmaufnahme</h3><p>Bildschirmfoto mit Markierungen (Rahmen, Pfeile, Nummern, Text, Schwärzen) oder Video mit Kommentar aufnehmen und als Datei speichern. Für Anleitungen direkt im Wiki: im Editor auf „Aufnahme“.</p>
      <div class="row"><button class="btn primary" type="button" data-cap="shot">${ic('image')}Bildschirmfoto</button><button class="btn" type="button" data-cap="video">${ic('video')}Video</button></div>
      <p class="note">Vor der Aufnahme Kennwörter, Kundendaten und private Fenster schließen oder nachher schwärzen. Unter macOS beim ersten Mal „Bildschirmaufnahme“ für AdminKit in den Systemeinstellungen erlauben.</p></div>`;
    p.addEventListener('click', async e => { const b = e.target.closest('[data-cap]'); if (!b) return; const { openCapture } = await import('../recorder.js'); openCapture(ctx, { mode: b.dataset.cap }); });
  },
};
