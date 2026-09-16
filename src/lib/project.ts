import { unzip, zip } from 'fflate';
import { DEFAULT_CONFIG, freshColors } from '../config';
import { FLAGS } from '../flags';
import { exportCredits } from './encoder-common';
import type { CropConfig, ProjectMedia, StoredMedia, VideoColors, VideoConfig } from '../types';

const LIMIT = 180 * 1024 * 1024;
const SETTINGS_LIMIT = 100_000;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid project settings.');
  return value as RecordValue;
}
function number(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${name} in project.`);
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text in project.');
  return value;
}
function crop(value: unknown): CropConfig {
  const c = record(value);
  if (!['contain', 'square', 'circle'].includes(c.framing as string)) throw new Error('Invalid picture framing.');
  return { framing: c.framing as CropConfig['framing'], zoom: number(c.zoom, 1, 3, 'crop zoom'), x: number(c.x, -1, 1, 'crop position'), y: number(c.y, -1, 1, 'crop position') };
}

function color(value: unknown): string {
  if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) throw new Error('Invalid colour in project. Use a hexadecimal colour such as #ff99cc.');
  const hex = value.toLowerCase();
  return hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
}

/** Schema v1 projects created before colour editing retain their original look. */
export function validateColors(value: unknown): VideoColors {
  if (value === undefined) return freshColors();
  const c = record(value);
  if (!Array.isArray(c.galaxy) || c.galaxy.length !== 3) throw new Error('The project must have three galaxy colours.');
  const overrides = record(c.flagOverrides);
  if (Object.keys(overrides).length > 32) throw new Error('The project has too many flag colour replacements.');
  const flagOverrides: Record<string, string> = {};
  for (const [source, replacement] of Object.entries(overrides)) flagOverrides[color(source)] = color(replacement);
  return {
    galaxy: [color(c.galaxy[0]), color(c.galaxy[1]), color(c.galaxy[2])],
    introBackground: color(c.introBackground), introCaptionFill: color(c.introCaptionFill),
    introCaptionAccent: color(c.introCaptionAccent), captionFill: color(c.captionFill),
    captionOutline: color(c.captionOutline), flagOverrides,
  };
}
export function validateConfig(value: unknown): VideoConfig {
  const c = record(value);
  if (c.schemaVersion !== 1) throw new Error('This project version is not supported.');
  const duration = number(c.duration, 8, 30, 'duration');
  const firstSceneEnd = number(c.firstSceneEnd, .5, duration - 2, 'first scene');
  const launchTime = number(c.launchTime, firstSceneEnd + .2, duration - 1, 'launch time');
  const echoTime = number(c.echoTime, launchTime, duration, 'echo time');
  if (c.fps !== 30 || ![720, 1080].includes(c.resolution as number)) throw new Error('Unsupported project export format.');
  const captions = record(c.captions);
  if (!Array.isArray(c.crops) || c.crops.length !== 2) throw new Error('The project must have two pictures.');
  if (typeof c.showEchoes !== 'boolean') throw new Error('Invalid echo setting.');
  const flagId = text(c.flagId, 60);
  if (flagId !== 'custom' && !FLAGS.some(flag => flag.id === flagId)) throw new Error('Unknown flag in project.');
  return {
    schemaVersion: 1, duration, firstSceneEnd, launchTime, echoTime, fps: 30, resolution: c.resolution as 720 | 1080,
    name1: text(c.name1, 40), name2: text(c.name2, 40),
    captions: { intro: text(captions.intro, 160), together: text(captions.together, 160), names: text(captions.names, 160), flight: text(captions.flight, 160), ending: text(captions.ending, 160) },
    colors: validateColors(c.colors),
    crops: [crop(c.crops[0]), crop(c.crops[1])],
    pfpScale: number(c.pfpScale, .65, 1.2, 'picture size'), flightSpeed: number(c.flightSpeed, .3, 2, 'speed'), bobAmount: number(c.bobAmount, 0, 2, 'bobbing'),
    flagScale: number(c.flagScale, .6, 1.3, 'flag size'), brightness: number(c.brightness, .4, 1.6, 'brightness'), captionScale: number(c.captionScale, .65, 1.3, 'caption size'),
    showEchoes: c.showEchoes, flagId, audioTrimStart: number(c.audioTrimStart, 0, 600, 'audio trim'), audioOffset: number(c.audioOffset, -10, 20, 'audio offset'), volume: number(c.volume, 0, 1.5, 'volume'),
  };
}

function validateImage(bytes: Uint8Array, type: string): void {
  if (!IMAGE_TYPES.has(type)) throw new Error('Unsupported picture in project.');
  if (bytes.length === 0) throw new Error('A picture in the project is empty.');
  if (type !== 'image/svg+xml') return;
  const svg = new TextDecoder().decode(bytes).trimStart().replace(/^<\?xml\s+[^?]*\?>\s*/i, '');
  const safeTags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline',
    'line', 'defs', 'use', 'clipPath', 'mask', 'title', 'desc', 'linearGradient', 'radialGradient', 'stop', 'text', 'tspan']);
  const unsafe = () => { throw new Error('The project contains an SVG with unsupported or external content.'); };
  if (!/^<svg\b[^>]*xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(svg) || !/<\/svg>\s*$/.test(svg)) unsafe();
  if (/<!DOCTYPE|<!ENTITY|<\?|\son[\w:-]+\s*=|javascript\s*:|@import|xml:base\s*=/i.test(svg)) unsafe();
  for (const tag of svg.matchAll(/<\/?([\w:-]+)\b/g)) if (!safeTags.has(tag[1])) unsafe();
  for (const attr of svg.matchAll(/\b(?:href|xlink:href|src)\s*=\s*["']([^"']*)["']/gi)) {
    if (!/^#[A-Za-z_][\w:.-]*$/.test(attr[1])) unsafe();
  }
  for (const style of svg.matchAll(/\bstyle\s*=\s*["']([^"']*)["']/gi)) {
    if (/[\\&@]/.test(style[1])) unsafe();
  }
  for (const url of svg.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)) {
    if (!/^#[A-Za-z_][\w:.-]*$/.test(url[1])) unsafe();
  }
}

export async function saveProject(config: VideoConfig, media: ProjectMedia, selectedFlagMedia: StoredMedia | null = null): Promise<Blob> {
  const cleanConfig = validateConfig(config);
  if (!Array.isArray(media.pfps) || media.pfps.length !== 2 || media.pfps.some(asset => !asset)) throw new Error('The project must have two profile pictures.');
  if (cleanConfig.flagId === 'custom' && !media.customFlag) throw new Error('The selected custom flag is missing from the project.');
  // Keep a built-in flag snapshot separate from the user's optional custom upload.
  // This optional field extends schema v1 without changing legacy load behavior.
  const selectedFlag = cleanConfig.flagId === 'custom' ? null : selectedFlagMedia;
  let total = 0;
  for (const asset of [...media.pfps, media.customFlag, media.audio, selectedFlag]) {
    if (!asset) continue;
    if (!(asset.blob instanceof Blob)) throw new Error('Invalid media in project.');
    total += asset.blob.size;
  }
  if (total > LIMIT) throw new Error('This project is too large. The limit is 180 MB.');
  const entries: Record<string, Uint8Array> = {};
  async function add(path: string, asset: StoredMedia | null) {
    if (!asset) return null;
    const type = text(asset.type, 80);
    const bytes = new Uint8Array(await asset.blob.arrayBuffer());
    if (path !== 'media/audio') validateImage(bytes, type);
    entries[path] = bytes;
    return { path, name: text(asset.name, 200), type };
  }
  const [first, second, flag, audio, selectedFlagEntry] = await Promise.all([add('media/first', media.pfps[0]), add('media/second', media.pfps[1]), add('media/flag', media.customFlag), add('media/audio', media.audio), add('media/selectedFlag', selectedFlag)]);
  entries['project.json'] = new TextEncoder().encode(JSON.stringify({ format: 'gaylaxy-maker', schemaVersion: 1, config: cleanConfig, media: { first, second, flag, audio, selectedFlag: selectedFlagEntry } }, null, 2));
  entries['credits.txt'] = new TextEncoder().encode(exportCredits(cleanConfig));
  if (Object.values(entries).reduce((sum, bytes) => sum + bytes.length, 0) > LIMIT) throw new Error('This project is too large. The limit is 180 MB.');
  return new Promise((resolve, reject) => zip(entries, { level: 0 }, (error, result) => {
    if (error) reject(error);
    else if (result.length > LIMIT) reject(new Error('This project is too large. The limit is 180 MB.'));
    else resolve(new Blob([result as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
  }));
}

export async function loadProject(blob: Blob): Promise<{ config: VideoConfig; media: ProjectMedia; selectedFlagMedia: StoredMedia | null }> {
  if (blob.size > LIMIT) throw new Error('This project is too large. The limit is 180 MB.');
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let total = 0;
  let settingsTooLarge = false;
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(buffer, {
    filter: (file) => {
      if (!['project.json', 'media/first', 'media/second', 'media/flag', 'media/audio', 'media/selectedFlag'].includes(file.name)) return false;
      total += file.originalSize;
      if (file.name === 'project.json' && file.originalSize > SETTINGS_LIMIT) settingsTooLarge = true;
      if (total > LIMIT || settingsTooLarge) return false;
      return true;
    },
  }, (error, result) => error ? reject(new Error('This is not a readable Gaylaxy project.')) : resolve(result)));
  if (total > LIMIT) throw new Error('The project expands beyond the 180 MB limit.');
  if (settingsTooLarge) throw new Error('The project settings exceed the 100 KB limit.');
  if (!files['project.json']) throw new Error('The project settings file is missing.');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(files['project.json'])); }
  catch { throw new Error('The project settings are not valid JSON.'); }
  const data = record(parsed);
  if (data.format !== 'gaylaxy-maker' || data.schemaVersion !== 1) throw new Error('Choose a Gaylaxy Maker project ZIP.');
  const config = validateConfig(data.config);
  const manifest = record(data.media);
  function media(key: string, required = false): StoredMedia | null {
    if (!manifest[key]) { if (required) throw new Error('A profile picture is missing from the project.'); return null; }
    const meta = record(manifest[key]);
    const path = text(meta.path, 40);
    const type = text(meta.type, 80);
    if (path !== `media/${key}` || !files[path]) throw new Error(`Missing ${key} media.`);
    const bytes = files[path];
    if (key !== 'audio') validateImage(bytes, type);
    return { name: text(meta.name, 200), type, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type }) };
  }
  const restored: ProjectMedia = { pfps: [media('first', true)!, media('second', true)!], customFlag: media('flag'), audio: media('audio') };
  if (config.flagId === 'custom' && !restored.customFlag) throw new Error('The selected custom flag is missing from the project.');
  const selectedFlagMedia = media('selectedFlag');
  return { config, media: restored, selectedFlagMedia: config.flagId === 'custom' ? null : selectedFlagMedia };
}

export function withDuration(config: VideoConfig, duration: number): VideoConfig {
  const firstSceneEnd = Math.min(config.firstSceneEnd, duration - 3);
  const launchTime = Math.min(config.launchTime, duration - 2);
  return { ...config, duration, firstSceneEnd, launchTime, echoTime: Math.min(config.echoTime, duration - .5) };
}
export const PROJECT_DEFAULTS = DEFAULT_CONFIG;
