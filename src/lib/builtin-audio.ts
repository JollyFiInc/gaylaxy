import { decodeAudio } from './audio';
import { fetchMedia } from './media';
import type { StoredMedia } from '../types';

export const BUILTIN_SOUNDTRACK_NAME = 'Built-in meme soundtrack.mp3';
let soundtrack: Promise<{ media: StoredMedia; audio: AudioBuffer }> | undefined;

export function loadBuiltInSoundtrack() {
  return soundtrack ??= (async () => {
    const media = await fetchMedia('audio/gaylaxy-soundtrack.mp3', BUILTIN_SOUNDTRACK_NAME);
    const audio = await decodeAudio(media.blob);
    return { media, audio };
  })().catch((error) => { soundtrack = undefined; throw error; });
}
