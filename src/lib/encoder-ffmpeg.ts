import { assetUrl } from '../config';
import type { ExportProgress } from '../types';
import { checkAbort } from './encoder-common';
import type { FFmpeg } from '@ffmpeg/ffmpeg';

export interface FfmpegSession { ffmpeg: FFmpeg; dispose: () => void; run: (args: string[]) => Promise<void> }

export async function loadFfmpeg(signal?: AbortSignal, onProgress?: (progress: ExportProgress) => void): Promise<FfmpegSession> {
  checkAbort(signal);
  onProgress?.({ fraction: 0, stage: 'Loading the local encoder (31 MB on the first export)…' });
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  checkAbort(signal);
  const ffmpeg = new FFmpeg();
  let lastLog = '';
  const abort = (): void => ffmpeg.terminate();
  signal?.addEventListener('abort', abort, { once: true });
  const dispose = (): void => { signal?.removeEventListener('abort', abort); ffmpeg.terminate(); };
  ffmpeg.on('log', ({ message }) => { lastLog = message; });
  try {
    const absoluteAsset = (path: string): string => new URL(assetUrl(path), globalThis.location.href).href;
    await ffmpeg.load({
      classWorkerURL: absoluteAsset('encoder/worker.js'),
      coreURL: absoluteAsset('encoder/ffmpeg-core.js'),
      wasmURL: absoluteAsset('encoder/ffmpeg-core.wasm'),
    }, { signal });
    checkAbort(signal);
  } catch (error) {
    dispose(); checkAbort(signal);
    throw new Error(`Could not load the local media encoder. Check your connection and retry. ${error instanceof Error ? error.message : String(error)}`);
  }
  return { ffmpeg, dispose, run: async (args: string[]): Promise<void> => {
    checkAbort(signal);
    try {
      const code = await ffmpeg.exec(args, -1, { signal });
      checkAbort(signal);
      if (code !== 0) throw new Error(`Media encoding failed (${code}). ${lastLog}`);
    } catch (error) { checkAbort(signal); throw error; }
  } };
}
