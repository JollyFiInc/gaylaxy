import type { ExportProgress, VideoConfig } from '../types';
import { checkAbort, pcmToWav, prepareAudio } from './encoder-common';
import { loadFfmpeg } from './encoder-ffmpeg';

export { audioSourceTime, prepareAudio } from './encoder-common';

/** decodeAudioData handles common audio files and audio tracks inside MP4 uploads. */
export async function decodeAudio(file: Blob): Promise<AudioBuffer> {
  if (file.size > 150 * 1024 * 1024) throw new Error('Choose an audio or video file smaller than 150 MB.');
  const context = new AudioContext({ sampleRate: 48000 });
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await context.decodeAudioData(await file.arrayBuffer());
    } catch {
      // Native audio decoding differs across browsers; the same-origin WASM decoder
      // can also extract a soundtrack from a locally uploaded video.
      const session = await loadFfmpeg();
      try {
        await session.ffmpeg.writeFile('input-media', new Uint8Array(await file.arrayBuffer()));
        await session.run(['-i', 'input-media', '-map', '0:a:0', '-vn', '-t', '600', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', 'decoded.wav']);
        const result = await session.ffmpeg.readFile('decoded.wav');
        if (typeof result === 'string') throw new Error('Unexpected audio output.');
        decoded = await context.decodeAudioData(new Uint8Array(result).buffer);
      } catch {
        throw new Error('No readable audio track was found. Try an MP3, WAV, M4A, OGG, or an MP4 with sound.');
      } finally { session.dispose(); }
    }
    if (decoded.duration > 600.1) throw new Error('Choose audio up to 10 minutes long, or trim the file before uploading.');
    return decoded;
  } finally { await context.close(); }
}

export async function exportMp3(audio: AudioBuffer, config: VideoConfig, signal?: AbortSignal, onProgress?: (progress: ExportProgress) => void): Promise<Blob> {
  checkAbort(signal);
  const pcm = prepareAudio(audio, config);
  const session = await loadFfmpeg(signal, onProgress);
  try {
    checkAbort(signal);
    await session.ffmpeg.writeFile('audio.wav', pcmToWav(pcm), { signal });
    onProgress?.({ fraction: 0.1, stage: 'Encoding the trimmed soundtrack as MP3…' });
    session.ffmpeg.on('progress', ({ progress }) => onProgress?.({ fraction: 0.1 + Math.min(1, Math.max(0, progress)) * 0.85, stage: 'Encoding MP3…' }));
    await session.run(['-i', 'audio.wav', '-c:a', 'libmp3lame', '-b:a', '192k', 'soundtrack.mp3']);
    const result = await session.ffmpeg.readFile('soundtrack.mp3', 'binary', { signal });
    checkAbort(signal);
    if (typeof result === 'string') throw new Error('Unexpected MP3 encoder output.');
    onProgress?.({ fraction: 1, stage: 'MP3 ready' });
    return new Blob([new Uint8Array(result)], { type: 'audio/mpeg' });
  } finally { session.dispose(); }
}
