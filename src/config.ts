import type { VideoColors, VideoConfig } from './types';

export const DEFAULT_COLORS: VideoColors = {
  galaxy: ['#6e32c1', '#e54eab', '#3978c4'],
  introBackground: '#fffafd', introCaptionFill: '#160c2b', introCaptionAccent: '#c03e7f',
  captionFill: '#fffafd', captionOutline: '#160c2b', flagOverrides: {},
};
export function freshColors(): VideoColors { return structuredClone(DEFAULT_COLORS); }

export const DEFAULT_CONFIG: VideoConfig = {
  schemaVersion: 1, duration: 560 / 30, fps: 30, resolution: 1080,
  firstSceneEnd: 88 / 30, launchTime: 212 / 30, echoTime: 13.5,
  name1: 'you', name2: 'your person',
  captions: { intro: 'but we made it out somehow', together: 'take a look at us right now', names: 'you and me', flight: 'zooming through the gaylaxy', ending: "there’s nowhere where i’d rather be" },
  colors: freshColors(),
  crops: [{ framing: 'contain', zoom: 1, x: 0, y: 0 }, { framing: 'contain', zoom: 1, x: 0, y: 0 }],
  pfpScale: 1, flightSpeed: 1, bobAmount: 1, flagScale: 1, brightness: 1,
  captionScale: 1, showEchoes: true, flagId: 'sapphic', audioTrimStart: 0, audioOffset: 0, volume: 1,
};

export function freshConfig(): VideoConfig { return structuredClone(DEFAULT_CONFIG); }
export const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
