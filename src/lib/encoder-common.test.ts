import { describe, expect, it } from 'vitest';
import { freshConfig } from '../config';
import { audioSourceTime, frameCount, pcmToWav, prepareAudio, type AudioBufferLike } from './encoder-common';

function fixture(samples: number[], sampleRate = 48000): AudioBufferLike {
  const channel = Float32Array.from(samples);
  return { sampleRate, numberOfChannels: 1, length: channel.length, getChannelData: () => channel };
}

describe('movie/audio timeline', () => {
  it('exports exactly 560 frames for the reference duration', () => {
    expect(frameCount(freshConfig())).toBe(560);
  });
  it('pads leading silence, trims the source, scales volume, and pads the ending', () => {
    const config = freshConfig();
    config.duration = 1 / 30;
    config.audioOffset = 2 / 48000;
    config.audioTrimStart = 1 / 48000;
    config.volume = 0.5;
    const pcm = prepareAudio(fixture([0.2, 0.4, 0.8, -0.8]), config);
    expect(pcm.length).toBe(1600);
    expect(Array.from(pcm.channels[0].slice(0, 7))).toEqual([0, 0, expect.closeTo(0.2), expect.closeTo(0.4), expect.closeTo(-0.4), 0, 0]);
  });
  it('supports a negative offset that starts partway through the source', () => {
    const config = freshConfig();
    config.audioTrimStart = 1;
    config.audioOffset = -0.25;
    expect(audioSourceTime(0, config)).toBe(1.25);
    config.audioOffset = 2;
    expect(audioSourceTime(1, config)).toBeNull();
    expect(audioSourceTime(2, config)).toBe(1);
  });
  it('resamples a mono signal to encoder-safe 48 kHz', () => {
    const config = freshConfig(); config.duration = 1 / 30;
    const pcm = prepareAudio(fixture([0, 1, 0], 24000), config);
    expect(pcm.sampleRate).toBe(48000);
    expect(Array.from(pcm.channels[0].slice(0, 5))).toEqual([0, 0.5, 1, 0.5, 0]);
  });
  it('writes a valid PCM16 stereo WAV with interleaved channels', () => {
    const wav = pcmToWav({ sampleRate: 48000, length: 2, channels: [Float32Array.from([1, 0.5]), Float32Array.from([-1, 0])] });
    const data = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(data.getUint16(22, true)).toBe(2);
    expect(data.getUint32(24, true)).toBe(48000);
    expect(data.getUint32(40, true)).toBe(8);
    expect([44, 46, 48, 50].map(offset => data.getInt16(offset, true))).toEqual([32767, -32768, 16384, 0]);
  });
  it('rejects unbounded or invalid frame timelines before allocating memory', () => {
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 61]) {
      expect(() => frameCount({ ...freshConfig(), duration })).toThrow();
    }
  });
});
