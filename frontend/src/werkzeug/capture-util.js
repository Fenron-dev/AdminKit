// Hilfen für die Bildschirmaufnahme (#121), ohne DOM/Wails → testbar.
export const pickMime = (isOk = t => globalThis.MediaRecorder?.isTypeSupported?.(t)) => ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(isOk) || '';
// Zeitausschnitt als Media Fragment (#t=Start,Ende) – leer, wenn ungekürzt
export const trimFragment = (s, e, dur) => (s > 0.05 || (e && e < dur - 0.05)) ? `#t=${Math.round(s * 10) / 10}${e && e < dur - 0.05 ? ',' + Math.round(e * 10) / 10 : ''}` : '';
