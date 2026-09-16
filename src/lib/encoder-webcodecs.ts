import type { ExportProgress, LoadedAssets, VideoConfig } from '../types';
import { renderFrame } from './renderer';
import { checkAbort, exportCredits, frameCount, yieldToBrowser, type PcmAudio } from './encoder-common';

export interface EncodeJob {
  config: VideoConfig;
  assets: LoadedAssets;
  audio: PcmAudio | null;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

export class UnsupportedVideoEncoder extends Error { constructor() { super('Native AVC video encoding is unavailable.'); this.name = 'UnsupportedVideoEncoder'; } }

let fontLoad: Promise<void> | undefined;
export async function loadExportFont(fontUrl: string): Promise<void> {
  if (typeof FontFace === 'undefined') return;
  const scope = globalThis as unknown as { fonts?: FontFaceSet; document?: Document };
  const fonts = scope.fonts ?? scope.document?.fonts;
  if (!fonts) return;
  if (!fontLoad) {
    fontLoad = (async () => {
      const face = new FontFace('Comic Neue', `url(${JSON.stringify(fontUrl)})`, { weight: '700' });
      await face.load();
      fonts.add(face);
    })().catch(error => { fontLoad = undefined; throw error; });
  }
  await fontLoad;
}

export async function encodeWebCodecs(job: EncodeJob): Promise<Blob> {
  const { config, assets, audio, signal, onProgress } = job;
  const count = frameCount(config);
  const width = config.resolution;
  const height = width;
  checkAbort(signal);
  const bunny = await import('mediabunny');
  if (!(await bunny.canEncodeVideo('avc', { width, height, bitrate: width === 1080 ? 9_000_000 : 5_000_000 }))) {
    throw new UnsupportedVideoEncoder();
  }
  if (audio && !(await bunny.canEncodeAudio('aac', { sampleRate: audio.sampleRate, numberOfChannels: audio.channels.length }))) {
    onProgress?.({ fraction: 0, stage: 'Loading the local AAC audio encoder…' });
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
  }
  checkAbort(signal);
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error('Your browser could not create a video canvas.');
  const output = new bunny.Output({ format: new bunny.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new bunny.BufferTarget() });
  output.setMetadataTags({ title: 'Zooming through the gaylaxy', comment: exportCredits(config), description: exportCredits(config) });
  const videoSource = new bunny.CanvasSource(canvas, {
    codec: 'avc', bitrate: width === 1080 ? 9_000_000 : 5_000_000,
    keyFrameInterval: 1, latencyMode: 'quality',
  });
  output.addVideoTrack(videoSource, { frameRate: config.fps });
  const audioSource = audio ? new bunny.AudioSampleSource({ codec: 'aac', bitrate: 192_000 }) : null;
  if (audioSource) output.addAudioTrack(audioSource);
  let finished = false;
  const abort = (): void => { void output.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await output.start();
    for (let frame = 0; frame < count; frame++) {
      checkAbort(signal);
      renderFrame(context, frame / config.fps, config, assets);
      await videoSource.add(frame / config.fps, 1 / config.fps);
      // Interleave audio with video, respecting encoder/muxer backpressure.
      if (audio && audioSource) {
        const first = Math.round(frame / config.fps * audio.sampleRate);
        const last = Math.min(audio.length, Math.round((frame + 1) / config.fps * audio.sampleRate));
        const length = last - first;
        if (length > 0) {
          const planar = new Float32Array(length * audio.channels.length);
          for (let channel = 0; channel < audio.channels.length; channel++) planar.set(audio.channels[channel].subarray(first, last), length * channel);
          const sample = new bunny.AudioSample({ data: planar, format: 'f32-planar', sampleRate: audio.sampleRate, numberOfChannels: audio.channels.length, timestamp: first / audio.sampleRate });
          try { await audioSource.add(sample); } finally { sample.close(); }
        }
      }
      onProgress?.({ fraction: (frame + 1) / count * 0.95, stage: `Rendering frame ${frame + 1} of ${count}` });
      // Keep cancellation and UI responsive on the main-thread fallback path.
      if (frame % 3 === 0) await yieldToBrowser();
    }
    checkAbort(signal);
    onProgress?.({ fraction: 0.96, stage: 'Finishing MP4 video and audio…' });
    await output.finalize();
    checkAbort(signal);
    if (!output.target.buffer) throw new Error('The MP4 encoder returned an empty file.');
    finished = true;
    onProgress?.({ fraction: 1, stage: 'MP4 ready' });
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  } catch (error) { checkAbort(signal); throw error; }
  finally {
    signal?.removeEventListener('abort', abort);
    if (!finished) await output.cancel().catch(() => {});
    canvas.width = 1; canvas.height = 1;
  }
}
