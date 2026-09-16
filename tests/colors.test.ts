import { describe, expect, it } from 'vitest';
import { DEFAULT_COLORS, freshColors, freshConfig } from '../src/config';
import { loadProject, saveProject, validateColors, validateConfig } from '../src/lib/project';
import type { ProjectMedia } from '../src/types';

describe('editable video colours', () => {
  it('fills missing colours in an old schema-v1 project without sharing mutable defaults', () => {
    const legacy = { ...freshConfig() } as Record<string, unknown>;
    delete legacy.colors;
    const first = validateConfig(legacy), second = validateConfig(legacy);
    expect(first.colors).toEqual(DEFAULT_COLORS);
    first.colors.galaxy[0] = '#ffffff'; first.colors.flagOverrides['#ffffff'] = '#000000';
    expect(second.colors).toEqual(DEFAULT_COLORS);
    expect(freshConfig().colors).toEqual(DEFAULT_COLORS);
  });

  it('preserves all colour controls and normalizes hexadecimal shorthand and case', () => {
    const input = freshColors();
    input.galaxy = ['#FF8040', '#F0A', '#112233'];
    input.introBackground = '#123'; input.introCaptionFill = '#abcdef'; input.introCaptionAccent = '#987654';
    input.captionFill = '#fff'; input.captionOutline = '#000';
    input.flagOverrides = { '#FfF': '#c0F', '#112233': '#445566' };
    expect(validateColors(input)).toEqual({
      galaxy: ['#ff8040', '#ff00aa', '#112233'], introBackground: '#112233',
      introCaptionFill: '#abcdef', introCaptionAccent: '#987654', captionFill: '#ffffff', captionOutline: '#000000',
      flagOverrides: { '#ffffff': '#cc00ff', '#112233': '#445566' },
    });
    expect(input.galaxy[0]).toBe('#FF8040');
  });

  it.each(['red', 'transparent', '#12345', '#12345678', 'url(https://example.com)', '', 2, null])('rejects unsupported colour %s', (value) => {
    expect(() => validateColors({ ...freshColors(), captionFill: value })).toThrow('colour');
  });

  it.each([null, [], '#ffffff', 1])('rejects a malformed colour settings object %s', (value) => {
    expect(() => validateColors(value)).toThrow();
  });

  it('requires exactly three galaxy colours and a bounded hexadecimal flag replacement map', () => {
    expect(() => validateColors({ ...freshColors(), galaxy: ['#123456', '#654321'] })).toThrow('three galaxy colours');
    expect(() => validateColors({ ...freshColors(), flagOverrides: [] })).toThrow();
    expect(() => validateColors({ ...freshColors(), flagOverrides: { red: '#123456' } })).toThrow('colour');
    expect(() => validateColors({ ...freshColors(), flagOverrides: { '#123456': 'red' } })).toThrow('colour');
    const flagOverrides = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`#${index.toString(16).padStart(6, '0')}`, '#ffffff']));
    expect(() => validateColors({ ...freshColors(), flagOverrides })).toThrow('too many flag colour');
  });

  it('roundtrips colours and flag replacements inside an editable project ZIP', async () => {
    const config = freshConfig();
    config.colors.galaxy = ['#e46f21', '#e8ca44', '#667800'];
    config.colors.introBackground = '#b2c4e6'; config.colors.captionFill = '#abcdef';
    config.colors.flagOverrides = { '#ffffff': '#ffeedd' };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><rect width="3" height="2" fill="#ffffff"/></svg>';
    const image = { name: 'picture.svg', type: 'image/svg+xml', blob: new Blob([svg], { type: 'image/svg+xml' }) };
    const media: ProjectMedia = { pfps: [image, image], audio: null, customFlag: null };
    const loaded = await loadProject(await saveProject(config, media, image));
    expect(loaded.config.colors).toEqual(config.colors);
    expect(await loaded.selectedFlagMedia!.blob.text()).toBe(svg);
  });
});
