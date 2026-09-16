import { assetUrl } from '../config';
import type { RasterAsset, StoredMedia } from '../types';

export async function fetchMedia(path: string, name: string): Promise<StoredMedia> {
  const response = await fetch(assetUrl(path));
  if (!response.ok) throw new Error(`Could not load ${name}. Please refresh and try again.`);
  const blob = await response.blob();
  return { name, type: blob.type, blob };
}

export function validateImage(file: File): void {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPG, or WebP image.');
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('Please choose an image smaller than 20 MB.');
}

export async function loadRaster(blob: Blob): Promise<RasterAsset> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This image has no dimensions.');
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not create an image canvas.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { image: await createImageBitmap(canvas), width: canvas.width, height: canvas.height };
  } catch {
    throw new Error('This image could not be read. Try exporting it as PNG or JPG.');
  } finally { URL.revokeObjectURL(url); }
}

export function closeRaster(asset: RasterAsset | null): void {
  if (asset?.image instanceof ImageBitmap) asset.image.close();
}

let fontPromise: Promise<unknown> | undefined;
export function loadVideoFont(): Promise<unknown> {
  return fontPromise ??= (async () => {
    const font = new FontFace('Comic Neue', `url(${assetUrl('fonts/ComicNeue-Bold.ttf')})`, { weight: '700' });
    await font.load();
    document.fonts.add(font);
    await document.fonts.ready;
  })();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}
export function formatSize(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
