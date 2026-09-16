import { assetUrl } from '../config';
import type { ExportOptions, ExportResult, LoadedAssets, RasterAsset } from '../types';
import { checkAbort, abortError, exportCredits, frameCount, pcmToWav, prepareAudio, yieldToBrowser, type PcmAudio } from './encoder-common';
import type { EncoderWorkerRequest, EncoderWorkerResponse } from './encoder.worker';

export { exportMp3 } from './audio';

async function cloneAssets(assets: LoadedAssets): Promise<LoadedAssets> {
  const cloned: ImageBitmap[] = [];
  const clone = async (asset: RasterAsset): Promise<RasterAsset> => {
    const image = await createImageBitmap(asset.image as ImageBitmapSource);
    cloned.push(image);
    return { image, width: asset.width, height: asset.height };
  };
  try { return { pfps: [await clone(assets.pfps[0]), await clone(assets.pfps[1])], flag: await clone(assets.flag) }; }
  catch (error) { cloned.forEach(image => image.close()); throw error; }
}

async function workerExport(options: ExportOptions, audio: PcmAudio | null, fontUrl: string): Promise<Blob> {
  const assets = await cloneAssets(options.assets);
  const bitmaps = [...assets.pfps, assets.flag].map(asset => asset.image as ImageBitmap);
  if (options.signal?.aborted) { bitmaps.forEach(bitmap => bitmap.close()); throw abortError(); }
  let worker: Worker;
  try { worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' }); }
  catch (error) { bitmaps.forEach(bitmap => bitmap.close()); throw error; }
  return new Promise((resolve, reject) => {
    const dispose = (): void => { options.signal?.removeEventListener('abort', abort); worker.terminate(); };
    const abort = (): void => { dispose(); reject(abortError()); };
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<EncoderWorkerResponse>) => {
      if (data.type === 'progress') options.onProgress?.(data.value);
      else if (data.type === 'done') { dispose(); resolve(data.blob); }
      else { dispose(); const error = new Error(data.message); error.name = data.name; reject(error); }
    };
    worker.onerror = (event): void => { event.preventDefault(); dispose(); reject(new Error(event.message || 'The export worker could not start.')); };
    const request: EncoderWorkerRequest = { config: options.config, assets, audio, fontUrl };
    // Image bitmaps are independent copies. PCM is cloned so a retry keeps its input.
    try { worker.postMessage(request, bitmaps); }
    catch (error) { bitmaps.forEach(bitmap => bitmap.close()); dispose(); reject(error); }
  });
}

async function fallbackExport(options: ExportOptions, audio: PcmAudio | null): Promise<Blob> {
  const { renderFrame } = await import('./renderer');
  const { loadFfmpeg } = await import('./encoder-ffmpeg');
  const { signal, onProgress } = options;
  // Keep the software encoder practical on mobile and below WASM memory limits.
  const config = { ...options.config, resolution: 720 as const };
  const count = frameCount(config);
  const canvas = document.createElement('canvas');
  canvas.width = 720; canvas.height = 720;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Your browser could not create a video canvas.');
  const session = await loadFfmpeg(signal, onProgress);
  const { ffmpeg } = session;
  try {
    const chunks: string[] = [];
    // Encode one second at a time, then remove source JPEGs. At no point do we
    // retain all uncompressed frames or hundreds of full-resolution PNGs.
    const chunkSize = config.fps;
    for (let start = 0; start < count; start += chunkSize) {
      const length = Math.min(chunkSize, count - start);
      for (let index = 0; index < length; index++) {
        checkAbort(signal);
        const frame = start + index;
        renderFrame(context, frame / config.fps, config, options.assets);
        const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not capture a video frame.')), 'image/jpeg', 0.94));
        checkAbort(signal);
        await ffmpeg.writeFile(`frame-${String(index).padStart(3, '0')}.jpg`, new Uint8Array(await jpeg.arrayBuffer()), { signal });
        onProgress?.({ fraction: (start + index * 0.5) / count * 0.9, stage: `Software export · 720p · frame ${frame + 1} of ${count}` });
        if (index % 3 === 0) await yieldToBrowser();
      }
      checkAbort(signal);
      const chunk = `chunk-${chunks.length}.mp4`;
      onProgress?.({ fraction: (start + length * 0.5) / count * 0.9, stage: `Encoding 720p · part ${chunks.length + 1} of ${Math.ceil(count / chunkSize)}` });
      await session.run(['-framerate', String(config.fps), '-i', 'frame-%03d.jpg', '-frames:v', String(length), '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '21', '-pix_fmt', 'yuv420p', '-threads', '1', '-r', String(config.fps), '-g', String(config.fps), '-video_track_timescale', '90000', chunk]);
      chunks.push(chunk);
      for (let index = 0; index < length; index++) await ffmpeg.deleteFile(`frame-${String(index).padStart(3, '0')}.jpg`);
      onProgress?.({ fraction: (start + length) / count * 0.9, stage: `Encoded ${Math.min(start + length, count)} of ${count} frames` });
    }
    checkAbort(signal);
    await ffmpeg.writeFile('chunks.txt', chunks.map(chunk => `file '${chunk}'`).join('\n'));
    if (audio) await ffmpeg.writeFile('audio.wav', pcmToWav(audio), { signal });
    onProgress?.({ fraction: 0.92, stage: 'Combining video and audio into MP4…' });
    const args = ['-f', 'concat', '-safe', '0', '-i', 'chunks.txt'];
    if (audio) args.push('-i', 'audio.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k');
    args.push('-c:v', 'copy', '-t', String(count / config.fps), '-metadata', 'title=Zooming through the gaylaxy', '-metadata', `comment=${exportCredits(config)}`, '-movflags', '+faststart', 'gaylaxy.mp4');
    await session.run(args);
    const bytes = await ffmpeg.readFile('gaylaxy.mp4', 'binary', { signal });
    checkAbort(signal);
    if (typeof bytes === 'string') throw new Error('Unexpected MP4 encoder output.');
    onProgress?.({ fraction: 1, stage: '720p MP4 ready' });
    return new Blob([new Uint8Array(bytes)], { type: 'video/mp4' });
  } catch (error) { checkAbort(signal); throw error; }
  finally { session.dispose(); canvas.width = 1; canvas.height = 1; }
}

export async function exportVideo(options: ExportOptions): Promise<ExportResult> {
  // Freeze the chosen text/style before any lazy import or worker startup.
  options = { ...options, config: structuredClone(options.config) };
  checkAbort(options.signal);
  frameCount(options.config);
  const audio = options.audio ? prepareAudio(options.audio, options.config) : null;
  const fontUrl = new URL(assetUrl('fonts/ComicNeue-Bold.ttf'), globalThis.location.href).href;
  const { encodeWebCodecs, loadExportFont } = await import('./encoder-webcodecs');
  if (!options.forceFallback) {
    let nativeUnavailable = false;
    if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      try { return { blob: await workerExport(options, audio, fontUrl), method: 'webcodecs', resolution: options.config.resolution }; }
      catch (error) { checkAbort(options.signal); nativeUnavailable = error instanceof Error && error.name === 'UnsupportedVideoEncoder'; }
    }
    if (!nativeUnavailable) {
      try {
        await loadExportFont(fontUrl);
        return { blob: await encodeWebCodecs({ ...options, audio }), method: 'webcodecs', resolution: options.config.resolution };
      } catch { checkAbort(options.signal); }
    }
  }
  checkAbort(options.signal);
  options.onProgress?.({ fraction: 0, stage: 'Using the compatible software encoder at 720p…' });
  await loadExportFont(fontUrl);
  return { blob: await fallbackExport(options, audio), method: 'ffmpeg', resolution: 720 };
}
