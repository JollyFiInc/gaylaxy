import type { VideoConfig } from '../types';
import { FLAGS } from '../flags';

export interface PcmAudio { channels: Float32Array[]; sampleRate: number; length: number }
export type AudioBufferLike = Pick<AudioBuffer, 'numberOfChannels' | 'sampleRate' | 'length' | 'getChannelData'>;

export function abortError(): DOMException { return new DOMException('Export cancelled.', 'AbortError'); }
export function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }
export const yieldToBrowser = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

export function exportCredits(config: VideoConfig): string {
  const flag = FLAGS.find(item => item.id === config.flagId);
  if (!flag) return 'Created with Gaylaxy Maker.\nCustom flag supplied by the project author. The author retains responsibility for its source and license.\n';
  const licenseUrl = flag.license === 'CC BY-SA 4.0' ? 'https://creativecommons.org/licenses/by-sa/4.0/'
    : flag.license === 'CC0 1.0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : flag.sourceUrl;
  return `Created with Gaylaxy Maker.\n\nFlag: ${flag.name}\nVariant: ${flag.variant}\nCredit: ${flag.attribution}\nLicense: ${flag.license}\nLicense details: ${licenseUrl}\nSource: ${flag.sourceUrl}\n\nThe flag is scaled and deformed for the waving animation. Original drawing geometry is retained in the source asset; SVG metadata was cleaned.\n${flag.license === 'CC BY-SA 4.0' ? 'Adaptations of this flag retain CC BY-SA 4.0. Keep this credit and license link when sharing the adapted flag.\n' : ''}`;
}

export function frameCount(config: VideoConfig): number {
  if (!Number.isFinite(config.duration) || config.duration <= 0 || config.duration > 60) {
    throw new Error('Choose a video duration between 1 frame and 60 seconds.');
  }
  return Math.max(1, Math.round(config.duration * config.fps));
}

/** The audio window matches preview: trim first, then place on the movie timeline. */
export function audioSourceTime(timelineTime: number, config: VideoConfig): number | null {
  if (timelineTime < config.audioOffset) return null;
  return Math.max(0, config.audioTrimStart) + timelineTime - config.audioOffset;
}

/** Bounded stereo PCM; exactly the same duration as the frame timeline. */
export function prepareAudio(audio: AudioBufferLike, config: VideoConfig): PcmAudio {
  const sampleRate = 48000;
  const length = Math.round(frameCount(config) / config.fps * sampleRate);
  const channelCount = Math.min(2, audio.numberOfChannels);
  const channels = Array.from({ length: channelCount }, () => new Float32Array(length));
  const volume = Math.max(0, Math.min(2, config.volume));
  for (let channel = 0; channel < channelCount; channel++) {
    const source = audio.getChannelData(channel);
    const target = channels[channel];
    for (let index = 0; index < length; index++) {
      const sourceTime = audioSourceTime(index / sampleRate, config);
      if (sourceTime === null || sourceTime < 0) continue;
      const position = sourceTime * audio.sampleRate;
      const left = Math.floor(position);
      if (left >= source.length) continue;
      const right = Math.min(left + 1, source.length - 1);
      const sample = source[left] + (source[right] - source[left]) * (position - left);
      target[index] = Math.max(-1, Math.min(1, sample * volume));
    }
  }
  return { channels, sampleRate, length };
}

/** Standard PCM16 WAV for the FFmpeg fallback and MP3 export. */
export function pcmToWav(audio: PcmAudio): Uint8Array<ArrayBuffer> {
  const channelCount = audio.channels.length;
  const dataLength = audio.length * channelCount * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const string = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  string(0, 'RIFF'); view.setUint32(4, dataLength + 36, true); string(8, 'WAVE');
  string(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true); view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channelCount * 2, true);
  view.setUint16(32, channelCount * 2, true); view.setUint16(34, 16, true);
  string(36, 'data'); view.setUint32(40, dataLength, true);
  let cursor = 44;
  for (let index = 0; index < audio.length; index++) {
    for (let channel = 0; channel < channelCount; channel++) {
      const value = Math.max(-1, Math.min(1, audio.channels[channel][index]));
      view.setInt16(cursor, Math.round(value * (value < 0 ? 32768 : 32767)), true);
      cursor += 2;
    }
  }
  return bytes;
}
