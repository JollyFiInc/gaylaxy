import type { VideoConfig } from '../types';

export type Scene = 'intro' | 'together' | 'launch' | 'flight' | 'echoes';
export type CaptionKey = keyof VideoConfig['captions'];
export interface Timeline {
  time: number;
  firstSceneEnd: number;
  launchTime: number;
  echoTime: number;
  duration: number;
  flightTime: number;
  scene: Scene;
}
export interface CaptionState {
  key: CaptionKey;
  text: string;
  fullText: string;
  wordCount: number;
  progress: number;
  sinceReveal: number;
  intro: boolean;
}
export interface PfpPose { x: number; y: number; size: number; rotation: number; opacity: number }

export const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
export const mix = (a: number, b: number, progress: number): number => a + (b - a) * clamp(progress);
export const smoothstep = (progress: number): number => { const p = clamp(progress); return p * p * (3 - 2 * p); };

/** Animation is a function of the selected time, never of previous frames. */
export function getTimeline(timeSeconds: number, config: VideoConfig): Timeline {
  const duration = Math.max(1, config.duration);
  const time = clamp(Number.isFinite(timeSeconds) ? timeSeconds : 0, 0, duration);
  const launchTime = clamp(config.launchTime, 0.4, duration - 0.3);
  const firstSceneEnd = clamp(config.firstSceneEnd, 0.2, launchTime - 0.2);
  const echoTime = clamp(config.echoTime, launchTime + 0.15, duration - 0.1);
  const scene: Scene = time < firstSceneEnd ? 'intro'
    : time < launchTime - 0.14 ? 'together'
      : time < launchTime + 0.2 ? 'launch'
        : time < echoTime ? 'flight' : 'echoes';
  return { time, duration, firstSceneEnd, launchTime, echoTime, scene, flightTime: Math.max(0, time - launchTime) };
}

export function getSceneLabel(timeSeconds: number, config: VideoConfig): string {
  return { intro: 'The first hello', together: 'Better together', launch: 'Ready for liftoff', flight: 'Through the gaylaxy', echoes: 'Nowhere else to be' }[getTimeline(timeSeconds, config).scene];
}

function reveal(
  key: CaptionKey, fullText: string, time: number, start: number, end: number,
  beats: readonly number[], fractions: readonly number[], intro: boolean,
): CaptionState {
  const words = fullText.trim().split(/\s+/u).filter(Boolean);
  const progress = clamp((time - start) / Math.max(0.01, end - start));
  let beat = 0;
  for (let i = 1; i < beats.length; i++) if (progress >= beats[i]) beat = i;
  const wordCount = Math.min(words.length, Math.max(words.length ? 1 : 0, Math.round(words.length * fractions[beat])));
  return {
    key, text: words.slice(0, wordCount).join(' '), fullText, wordCount, progress,
    sinceReveal: Math.max(0, time - start - beats[beat] * (end - start)), intro,
  };
}

/** The reference's musical beats are normalized within each editable scene. */
export function getCaption(timeSeconds: number, config: VideoConfig): CaptionState {
  const { time, firstSceneEnd, launchTime, echoTime, duration } = getTimeline(timeSeconds, config);
  if (time < firstSceneEnd) {
    return reveal('intro', config.captions.intro, time, 0, firstSceneEnd,
      [0, 0.5 / (88 / 30), 0.766667 / (88 / 30), 1.933333 / (88 / 30)], [2 / 6, 3 / 6, 5 / 6, 1], true);
  }
  if (time < launchTime) {
    return reveal('together', config.captions.together, time, firstSceneEnd, launchTime,
      [0, 0.38, 0.50, 0.765], [2 / 7, 3 / 7, 5 / 7, 1], true);
  }
  const nameEnd = launchTime + (echoTime - launchTime) * 0.42;
  if (time < nameEnd) {
    return reveal('names', config.captions.names, time, launchTime, nameEnd,
      [0, 0.16, 0.195], [1 / 3, 2 / 3, 1], false);
  }
  if (time < echoTime) {
    return reveal('flight', config.captions.flight, time, nameEnd, echoTime,
      [0, 0.20, 0.41, 0.50], [1 / 4, 2 / 4, 3 / 4, 1], false);
  }
  return reveal('ending', config.captions.ending, time, echoTime, duration,
    [0, 0.13, 0.245, 0.325, 0.452], [1 / 6, 2 / 6, 4 / 6, 5 / 6, 1], false);
}

type Point = readonly [number, number];
function interpolate(points: readonly Point[], time: number): number {
  if (time <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (time <= points[i][0]) return mix(points[i - 1][1], points[i][1], (time - points[i - 1][0]) / (points[i][0] - points[i - 1][0]));
  }
  return points[points.length - 1][1];
}

function firstIntroPose(time: number): PfpPose {
  return {
    x: interpolate([[0, 555], [0.4, 540], [1.9, 555], [2.7, 540], [2.933333, 550]], time),
    y: interpolate([[0, 712], [0.33, 646], [0.53, 667], [1.2, 650], [1.9, 667], [2.5, 653], [2.933333, 650]], time),
    size: interpolate([[0, 475], [0.33, 592], [0.53, 565], [1.9, 585], [2.7, 565]], time),
    rotation: interpolate([[0, -15], [0.33, 3], [0.53, -6], [1.2, -3], [1.9, 3], [2.7, -4]], time),
    opacity: clamp(time / 0.2),
  };
}

export function getPfpPose(index: 0 | 1, timeSeconds: number, config: VideoConfig): PfpPose {
  const { time, firstSceneEnd, launchTime } = getTimeline(timeSeconds, config);
  let pose: PfpPose;
  if (time < firstSceneEnd) {
    pose = index === 0 ? firstIntroPose(time / firstSceneEnd * (88 / 30))
      : { x: 855, y: 718, size: 280, rotation: 19, opacity: 0 };
  } else {
    const join = smoothstep((time - firstSceneEnd) / Math.min(0.37, (launchTime - firstSceneEnd) * 0.2));
    const clock = (time - firstSceneEnd) / Math.max(0.2, launchTime - firstSceneEnd) * 4.133333;
    const punch = 1 + 0.045 * Math.exp(-(((clock - 1.57) / 0.14) ** 2)) + 0.04 * Math.exp(-(((clock - 3.17) / 0.14) ** 2));
    const joiningPose: PfpPose = index === 0
      ? { x: mix(550, 308, join), y: mix(650, 660, join) + Math.sin(clock * 2.4) * 6, size: mix(565, 385, join) * punch, rotation: mix(-4, -6, join) + Math.sin(clock * 2.3) * 4, opacity: 1 }
      : { x: mix(855, 769, join), y: mix(718, 655, join) + Math.sin(clock * 2.4 + 0.45) * 6, size: mix(280, 385, join) * punch, rotation: mix(19, 5, join) + Math.sin(clock * 2.2) * 4, opacity: join };
    const flightClock = Math.max(0, time - launchTime - 0.22) * config.flightSpeed;
    const phase = flightClock * Math.PI * 2 / 1.76;
    const phaseOffset = index === 0 ? 0 : 0.45;
    const drift = 23 * Math.sin(phase * 0.5);
    const flight: PfpPose = {
      x: (index === 0 ? 605 : 855) + drift,
      y: (index === 0 ? 540 : 530) + config.bobAmount * 24 * Math.sin(phase + phaseOffset),
      size: 280 + 9 * Math.sin(phase * 0.5),
      rotation: (index === 0 ? -4 : 4) + config.bobAmount * 6 * Math.sin(phase + phaseOffset),
      opacity: 1,
    };
    const launch = smoothstep((time - launchTime + 0.14) / 0.36);
    const zoom = Math.sin(clamp((time - launchTime + 0.24) / 0.44) * Math.PI) * 0.21;
    pose = {
      x: mix(joiningPose.x, flight.x, launch), y: mix(joiningPose.y, flight.y, launch),
      size: mix(joiningPose.size, flight.size, launch) * (1 + zoom),
      rotation: mix(joiningPose.rotation, flight.rotation, launch), opacity: joiningPose.opacity,
    };
  }
  return { ...pose, size: pose.size * config.pfpScale };
}
