import { describe, expect, it } from 'vitest';
import { freshConfig } from '../src/config';
import { getCaption, getPfpPose, getSceneLabel, getTimeline } from '../src/lib/timeline';

describe('the reference lyric cadence', () => {
  const config = freshConfig();
  it.each([
    [0, 'but we'], [0.5, 'but we made'], [0.8, 'but we made it out'], [2, 'but we made it out somehow'],
    [3, 'take a'], [4.6, 'take a look'], [5.1, 'take a look at us'], [6.2, 'take a look at us right now'],
    [7.1, 'you'], [7.6, 'you and me'], [10, 'zooming'], [12.3, 'zooming through the gaylaxy'],
    [13.5, 'there’s'], [16, 'there’s nowhere where i’d rather be'],
  ])('shows the expected words at %s seconds', (time, text) => {
    expect(getCaption(time, config).text).toBe(text);
  });

  it('honors custom text, including emoji and non-English words, without injecting reference lyrics', () => {
    config.captions.intro = 'אנחנו יחד בגלקסיה 🌈';
    config.captions.ending = 'together, wherever we go 🪐';
    expect(getCaption(2.5, config).text).toBe(config.captions.intro);
    expect(getCaption(config.duration, config).text).toBe(config.captions.ending);
    expect(getCaption(0, config).text).toBe('אנחנו');
  });

  it('preserves deliberately empty captions', () => {
    const emptyConfig = freshConfig(); emptyConfig.captions.names = '';
    expect(getCaption(8, emptyConfig).text).toBe('');
  });
});

describe('editable scene timing', () => {
  it('assigns all exact boundaries to the incoming scene', () => {
    const config = freshConfig();
    expect(getTimeline(config.firstSceneEnd - 0.001, config).scene).toBe('intro');
    expect(getTimeline(config.firstSceneEnd, config).scene).toBe('together');
    expect(getTimeline(config.launchTime, config).scene).toBe('launch');
    expect(getTimeline(config.launchTime + 0.201, config).scene).toBe('flight');
    expect(getTimeline(config.echoTime, config).scene).toBe('echoes');
  });

  it('moves lyric and echo boundaries with the settings', () => {
    const config = freshConfig();
    Object.assign(config, { duration: 12, firstSceneEnd: 2, launchTime: 4, echoTime: 9 });
    expect(getCaption(1.99, config).key).toBe('intro');
    expect(getCaption(2, config).key).toBe('together');
    expect(getCaption(4, config).key).toBe('names');
    expect(getCaption(8.9, config).key).toBe('flight');
    expect(getCaption(9, config).key).toBe('ending');
    expect(getCaption(12, config).text).toBe(config.captions.ending);
    expect(getTimeline(9, config).scene).toBe('echoes');
  });

  it('clamps invalid seeks and gives a useful scene label', () => {
    const config = freshConfig();
    expect(getTimeline(-2, config).time).toBe(0);
    expect(getTimeline(Infinity, config).time).toBe(0);
    expect(getTimeline(50, config).time).toBe(config.duration);
    expect(getSceneLabel(9, config)).toBe('Through the gaylaxy');
  });
});

describe('seekable picture motion', () => {
  it('returns the same pose after seeking backward and forward', () => {
    const config = freshConfig();
    const expected = getPfpPose(0, 10.123, config);
    getPfpPose(0, 0.1, config); getPfpPose(0, 18, config);
    expect(getPfpPose(0, 10.123, config)).toEqual(expected);
  });

  it('keeps the second picture invisible until its entrance', () => {
    const config = freshConfig();
    expect(getPfpPose(1, 2, config).opacity).toBe(0);
    expect(getPfpPose(1, 3.5, config).opacity).toBe(1);
  });

  it('keeps both default flight pictures completely within the frame', () => {
    const config = freshConfig();
    for (let frame = Math.ceil((config.launchTime + 0.3) * config.fps); frame < config.duration * config.fps; frame++) {
      for (const index of [0, 1] as const) {
        const pose = getPfpPose(index, frame / config.fps, config);
        const radius = pose.size * 0.62;
        expect(pose.x - radius).toBeGreaterThan(0);
        expect(pose.x + radius).toBeLessThan(1080);
        expect(pose.y - radius).toBeGreaterThan(0);
        expect(pose.y + radius).toBeLessThan(1080);
      }
    }
  });

  it('supports still flight when the bobbing control is zero', () => {
    const config = freshConfig(); config.bobAmount = 0;
    expect(getPfpPose(0, 10, config).y).toBe(getPfpPose(0, 12, config).y);
    expect(getPfpPose(1, 10, config).rotation).toBe(getPfpPose(1, 12, config).rotation);
  });
});
