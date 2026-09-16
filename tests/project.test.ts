import { readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { freshConfig } from '../src/config';
import { FLAGS } from '../src/flags';
import { exportCredits } from '../src/lib/encoder-common';
import { loadProject, saveProject, validateConfig, withDuration } from '../src/lib/project';
import type { ProjectMedia, StoredMedia, VideoConfig } from '../src/types';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60" viewBox="0 0 100 60"><rect width="100" height="60" fill="pink"/></svg>';
function stored(name: string, type: string, content: BlobPart = png): StoredMedia {
  return { name, type, blob: new Blob([content], { type }) };
}
function sampleMedia(): ProjectMedia {
  return { pfps: [stored('one.png', 'image/png'), stored('two.png', 'image/png')], customFlag: null, audio: null };
}
function rawProject(config: unknown = freshConfig()) {
  return {
    format: 'gaylaxy-maker', schemaVersion: 1, config,
    media: {
      first: { path: 'media/first', name: 'one.png', type: 'image/png' },
      second: { path: 'media/second', name: 'two.png', type: 'image/png' },
      flag: null as null | { path: string; name: string; type: string }, audio: null,
    },
  };
}
function archive(data: unknown, extra: Record<string, Uint8Array> = {}): Blob {
  const zipped = zipSync({ 'project.json': encode(JSON.stringify(data)), 'media/first': png, 'media/second': png, ...extra });
  return new Blob([zipped], { type: 'application/zip' });
}
async function contents(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe('project configuration validation', () => {
  it('accepts defaults and constructs an independent, clean settings object', () => {
    const original = { ...freshConfig(), ignored: 'not a setting' };
    const clean = validateConfig(original);
    expect(clean).toEqual(freshConfig());
    expect(clean).not.toBe(original);
    expect(clean.crops).not.toBe(original.crops);
    expect(clean.captions).not.toBe(original.captions);
    expect(clean).not.toHaveProperty('ignored');
  });

  it.each([
    ['schemaVersion', 2], ['duration', NaN], ['duration', Infinity], ['duration', 7],
    ['duration', 31], ['fps', 60], ['resolution', 1440], ['showEchoes', 'true'],
    ['flagId', 'unrecognized'], ['name1', 'x'.repeat(41)], ['volume', -1],
    ['volume', 1.6], ['audioTrimStart', 601], ['audioOffset', -11],
    ['pfpScale', .1], ['flightSpeed', 0], ['flagScale', 5], ['captionScale', 0],
  ])('rejects invalid %s value %s', (key, value) => {
    expect(() => validateConfig({ ...freshConfig(), [key]: value })).toThrow();
  });

  it.each([null, [], 'settings', 3])('rejects a non-object settings document: %s', value => {
    expect(() => validateConfig(value)).toThrow('Invalid project settings');
  });

  it('enforces scene order and bounded caption/crop settings', () => {
    const c = freshConfig();
    expect(() => validateConfig({ ...c, launchTime: c.firstSceneEnd })).toThrow('launch time');
    expect(() => validateConfig({ ...c, echoTime: c.launchTime - .1 })).toThrow('echo time');
    expect(() => validateConfig({ ...c, crops: [c.crops[0]] })).toThrow('two pictures');
    expect(() => validateConfig({ ...c, crops: [{ framing: 'triangle', zoom: 1, x: 0, y: 0 }, c.crops[1]] })).toThrow('framing');
    expect(() => validateConfig({ ...c, crops: [{ ...c.crops[0], zoom: 4 }, c.crops[1]] })).toThrow('crop zoom');
    expect(() => validateConfig({ ...c, captions: { ...c.captions, names: 'x'.repeat(161) } })).toThrow('text');
  });

  it('preserves empty captions, Unicode names, custom selection and edited duration', () => {
    const config = withDuration(freshConfig(), 8);
    config.name1 = 'שירה 🌈'; config.captions.intro = ''; config.flagId = 'custom';
    expect(validateConfig(config)).toEqual(config);
  });
});

describe('project ZIP save/load', () => {
  it('roundtrips custom images, original audio bytes, filenames and all edited settings', async () => {
    const config = freshConfig();
    Object.assign(config, { flagId: 'custom', name1: 'שירה', name2: 'Yuval', audioTrimStart: 12.2, audioOffset: -.5, showEchoes: false, resolution: 720 });
    config.crops[0] = { framing: 'circle', zoom: 1.5, x: -.3, y: .25 };
    config.captions.names = 'two people in space 🪐';
    const media = sampleMedia();
    media.customFlag = stored('my flag.svg', 'image/svg+xml', svg);
    media.audio = stored('local soundtrack.wav', 'audio/wav', new Uint8Array([82, 73, 70, 70, 0, 1, 2, 3]));
    const zip = await saveProject(config, media);
    expect(zip.type).toBe('application/zip');
    const result = await loadProject(zip);
    expect(result.config).toEqual(config);
    for (const [before, after] of [
      [media.pfps[0], result.media.pfps[0]], [media.pfps[1], result.media.pfps[1]],
      [media.customFlag, result.media.customFlag], [media.audio, result.media.audio],
    ]) {
      expect(after?.name).toBe(before?.name);
      expect(after?.type).toBe(before?.type);
      expect(new Uint8Array(await after!.blob.arrayBuffer())).toEqual(new Uint8Array(await before!.blob.arrayBuffer()));
    }
    const files = await contents(zip);
    expect(new TextDecoder().decode(files['credits.txt'])).toContain('Custom flag supplied by the project author');
  });

  it('keeps SVG demo projects reloadable and permits no audio', async () => {
    const media = sampleMedia();
    media.pfps = ['demo-you.svg', 'demo-them.svg'].map(name => stored(name, 'image/svg+xml', readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8'))) as ProjectMedia['pfps'];
    const loaded = await loadProject(await saveProject(freshConfig(), media));
    expect(loaded.media.pfps[0].type).toBe('image/svg+xml');
    expect(await loaded.media.pfps[1].blob.text()).toContain('them');
    expect(loaded.media.audio).toBeNull();
    expect(loaded.media.customFlag).toBeNull();
  });

  it('archives the selected built-in flag bytes without making it a custom upload', async () => {
    const content = readFileSync(new URL('../public/flags/sapphic.svg', import.meta.url), 'utf8');
    const selected = stored('sapphic.svg', 'image/svg+xml', content);
    const saved = await saveProject(freshConfig(), sampleMedia(), selected);
    const files = await contents(saved);
    expect(new TextDecoder().decode(files['media/selectedFlag'])).toBe(content);
    expect(files['media/flag']).toBeUndefined();
    const manifest = JSON.parse(new TextDecoder().decode(files['project.json']));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.media.selectedFlag.path).toBe('media/selectedFlag');
    expect(manifest.media.flag).toBeNull();
    const loaded = await loadProject(saved);
    expect(loaded.config.flagId).toBe('sapphic');
    expect(loaded.media.customFlag).toBeNull();
    expect(loaded.selectedFlagMedia?.name).toBe('sapphic.svg');
    expect(await loaded.selectedFlagMedia?.blob.text()).toBe(content);
  });

  it('preserves an unused custom upload separately from the selected built-in snapshot', async () => {
    const media = sampleMedia();
    media.customFlag = stored('personal.svg', 'image/svg+xml', svg);
    const selected = stored('sapphic.svg', 'image/svg+xml', readFileSync(new URL('../public/flags/sapphic.svg', import.meta.url), 'utf8'));
    const loaded = await loadProject(await saveProject(freshConfig(), media, selected));
    expect(loaded.media.customFlag?.name).toBe('personal.svg');
    expect(loaded.selectedFlagMedia?.name).toBe('sapphic.svg');
  });

  it('stores the selected custom flag once even when passed as the third argument', async () => {
    const media = sampleMedia(); media.customFlag = stored('personal.svg', 'image/svg+xml', svg);
    const saved = await saveProject({ ...freshConfig(), flagId: 'custom' }, media, media.customFlag);
    const files = await contents(saved);
    expect(files['media/flag']).toBeDefined();
    expect(files['media/selectedFlag']).toBeUndefined();
    expect((await loadProject(saved)).selectedFlagMedia).toBeNull();
  });

  it('includes the selected flag author, source, license link and adaptation notice', async () => {
    const config = { ...freshConfig(), flagId: 'omnisexual' };
    const files = await contents(await saveProject(config, sampleMedia()));
    const credits = new TextDecoder().decode(files['credits.txt']);
    expect(credits).toBe(exportCredits(config));
    const flag = FLAGS.find(item => item.id === config.flagId)!;
    expect(credits).toContain(flag.attribution);
    expect(credits).toContain(flag.sourceUrl);
    expect(credits).toContain('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(credits).toContain('scaled and deformed');
    expect(credits).toContain('Adaptations of this flag retain CC BY-SA 4.0');
    expect((await loadProject(new Blob([zipSync(files)]))).config.flagId).toBe('omnisexual');
  });

  it('loads legacy ZIPs without credits and ignores unrelated files', async () => {
    const result = await loadProject(archive(rawProject(), { 'unrelated.txt': encode('ignore me'), '../outside': encode('ignore me') }));
    expect(result.config).toEqual(freshConfig());
    expect(result.media.pfps[0].name).toBe('one.png');
    expect(result.selectedFlagMedia).toBeNull();
  });

  it('requires the selected custom flag on both save and load', async () => {
    const config = { ...freshConfig(), flagId: 'custom' };
    await expect(saveProject(config, sampleMedia())).rejects.toThrow('custom flag is missing');
    await expect(loadProject(archive(rawProject(config)))).rejects.toThrow('custom flag is missing');
  });

  it('rejects unsupported custom image types', async () => {
    const config = { ...freshConfig(), flagId: 'custom' };
    const media = sampleMedia(); media.customFlag = stored('flag.html', 'text/html', '<h1>flag</h1>');
    await expect(saveProject(config, media)).rejects.toThrow('Unsupported picture');
    const data = rawProject(config); data.media.flag = { path: 'media/flag', name: 'flag.html', type: 'text/html' };
    await expect(loadProject(archive(data, { 'media/flag': encode('<h1>flag</h1>') }))).rejects.toThrow('Unsupported picture');
  });

  it.each([
    '<script>alert(1)</script>', '<foreignObject><div>hello</div></foreignObject>',
    '<image href="https://example.com/private.png"/>', '<use href="https://example.com/shape.svg#x"/>',
    '<style>@import "https://example.com/style.css";</style>',
    '<rect width="20" height="20" onload="alert(1)"/>',
    '<rect width="20" height="20" fill="url(https://example.com/paint.svg#x)"/>',
  ])('rejects unsafe SVG content on save and import: %s', async content => {
    const unsafe = svg.replace('<rect width="100" height="60" fill="pink"/>', content);
    const media = sampleMedia(); media.pfps[0] = stored('unsafe.svg', 'image/svg+xml', unsafe);
    await expect(saveProject(freshConfig(), media)).rejects.toThrow('SVG');
    const data = rawProject(); data.media.first.type = 'image/svg+xml';
    await expect(loadProject(archive(data, { 'media/first': encode(unsafe) }))).rejects.toThrow('SVG');
  });

  it('allows static SVG local gradients and internal references', async () => {
    const content = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><defs><linearGradient id="g"><stop stop-color="pink"/></linearGradient><path id="p" d="M0 0h20v20H0z"/></defs><use href="#p" fill="url(#g)"/></svg>';
    const media = sampleMedia(); media.pfps[0] = stored('gradient.svg', 'image/svg+xml', content);
    expect(await (await loadProject(await saveProject(freshConfig(), media))).media.pfps[0].blob.text()).toBe(content);
  });
});

describe('malformed or oversized projects', () => {
  it.each([
    { ...rawProject(), schemaVersion: 2 }, { ...rawProject(), format: 'another-app' },
    rawProject({ ...freshConfig(), schemaVersion: 2 }),
  ])('rejects unsupported document/schema versions', async data => {
    await expect(loadProject(archive(data))).rejects.toThrow(/project ZIP|not supported/);
  });

  it('rejects missing settings, invalid JSON and invalid ZIPs', async () => {
    await expect(loadProject(new Blob([zipSync({ 'other.txt': encode('no project') })]))).rejects.toThrow('settings file is missing');
    await expect(loadProject(new Blob([zipSync({ 'project.json': encode('{bad json') })]))).rejects.toThrow('not valid JSON');
    await expect(loadProject(new Blob(['not a ZIP']))).rejects.toThrow('not a readable Gaylaxy project');
  });

  it('rejects missing PFP metadata, missing bytes and path substitution', async () => {
    const missing = rawProject();
    delete (missing.media as Partial<typeof missing.media>).first;
    await expect(loadProject(archive(missing))).rejects.toThrow('profile picture is missing');
    const files = await contents(archive(rawProject())); delete files['media/second'];
    await expect(loadProject(new Blob([zipSync(files)]))).rejects.toThrow('Missing second media');
    const swapped = rawProject(); swapped.media.first.path = 'media/second';
    await expect(loadProject(archive(swapped))).rejects.toThrow('Missing first media');
  });

  it('checks archive size before reading it into memory', async () => {
    const huge = new Blob(['small backing bytes']);
    Object.defineProperty(huge, 'size', { value: 180 * 1024 * 1024 + 1 });
    const read = vi.spyOn(huge, 'arrayBuffer');
    await expect(loadProject(huge)).rejects.toThrow('180 MB');
    expect(read).not.toHaveBeenCalled();
  });

  it('checks aggregate save size before reading any media', async () => {
    const media = sampleMedia();
    const reads = media.pfps.map(asset => {
      Object.defineProperty(asset.blob, 'size', { value: 91 * 1024 * 1024 });
      return vi.spyOn(asset.blob, 'arrayBuffer');
    });
    await expect(saveProject(freshConfig(), media)).rejects.toThrow('180 MB');
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });

  it('includes the selected flag snapshot in the aggregate size limit', async () => {
    const selected = stored('oversized.svg', 'image/svg+xml', svg);
    Object.defineProperty(selected.blob, 'size', { value: 180 * 1024 * 1024 });
    const read = vi.spyOn(selected.blob, 'arrayBuffer');
    await expect(saveProject(freshConfig(), sampleMedia(), selected)).rejects.toThrow('180 MB');
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects oversized settings before JSON parsing', async () => {
    const data = encode(' '.repeat(100_001));
    await expect(loadProject(new Blob([zipSync({ 'project.json': data })]))).rejects.toThrow('100 KB');
  });

  it('rejects a ZIP entry declaring an expansion beyond the memory limit', async () => {
    const bytes = zipSync({ 'media/first': png });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let changed = false;
    for (let offset = 0; offset <= bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        view.setUint32(offset + 24, 180 * 1024 * 1024 + 1, true);
        changed = true; break;
      }
    }
    expect(changed).toBe(true);
    await expect(loadProject(new Blob([bytes]))).rejects.toThrow('expands beyond');
  });
});
