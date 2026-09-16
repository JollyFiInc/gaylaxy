import { describe, expect, it } from 'vitest';
import { videoFilename } from '../src/lib/export-name';

describe('download names', () => {
  const date = new Date('2026-09-16T12:34:56.000Z');
  it('identifies the chosen sentence and export time', () => {
    expect(videoFilename('Our own sentence!', date, '12345678-abcd'))
      .toBe('gaylaxy-our-own-sentence-20260916T123456Z-12345678.mp4');
  });
  it('distinguishes renders with the same caption made in the same second', () => {
    expect(videoFilename('Again', date)).not.toBe(videoFilename('Again', date));
  });
  it('keeps Unicode names and removes filename/path punctuation', () => {
    const filename = videoFilename('../שירה and me: 🌈', date, '12345678');
    expect(filename).toContain('שירה-and-me');
    expect(filename).not.toMatch(/[/:\\?*"<>|]/);
  });
  it('supports intentionally empty captions', () => {
    expect(videoFilename('', date, '12345678')).toContain('gaylaxy-video-');
  });
});
