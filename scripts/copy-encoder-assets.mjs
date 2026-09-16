import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'public/encoder');
await mkdir(destination, { recursive: true });
// The single-thread core works on GitHub Pages without COOP/COEP headers.
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await copyFile(path.join(root, 'node_modules/@ffmpeg/core/dist/esm', file), path.join(destination, file));
}
for (const file of ['worker.js', 'const.js', 'errors.js']) {
  await copyFile(path.join(root, 'node_modules/@ffmpeg/ffmpeg/dist/esm', file), path.join(destination, file));
}
console.log('Copied same-origin FFmpeg single-thread runtime to public/encoder.');
