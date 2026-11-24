// Medien hochladen (#117/#119/#121): große Dateien/Aufnahmen in Stücken an Go
// übergeben (wiki/_medien/<slug>/). Liefert den relativen Pfad für das Markdown.
import { WikiMediaBegin, WikiMediaChunk, WikiMediaEnd, WikiMediaAbort, PickWikiMedia, OpenWikiMedia } from '../../wailsjs/go/main/App';

const CHUNK = 1536 * 1024; // 1,5 MB Rohdaten je Aufruf
const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

export async function uploadBlob(slug, name, blob, onProgress) {
  const id = await WikiMediaBegin(slug, name);
  try {
    for (let off = 0; off < blob.size; off += CHUNK) {
      await WikiMediaChunk(id, b64(await blob.slice(off, off + CHUNK).arrayBuffer()));
      onProgress?.(Math.min(1, (off + CHUNK) / blob.size));
    }
    return await WikiMediaEnd(id);
  } catch (e) { WikiMediaAbort(id).catch(() => {}); throw e; }
}
export const pickMedia = slug => PickWikiMedia(slug);
export const openMedia = rel => OpenWikiMedia(rel);
export const isMediaFile = f => /^(video|audio)\//.test(f.type) || f.type === 'image/gif' || /\.(mp4|m4v|webm|mov|mp3|m4a|ogg|oga|opus|wav|gif|pdf|txt|log|zip)$/i.test(f.name || '');
