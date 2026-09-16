/** A fresh render gets a distinct name, even if the caption hasn't changed. */
export function videoFilename(caption: string, now = new Date(), id: string = crypto.randomUUID()): string {
  const phrase = caption.normalize('NFKC').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/g, '');
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `gaylaxy-${phrase || 'video'}-${timestamp}-${id.slice(0, 8)}.mp4`;
}
