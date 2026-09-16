import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetUrl } from '../src/config';
import { FLAGS } from '../src/flags';

const publicDirectory = new URL('../public/', import.meta.url);
const readPublic = (path: string): string => readFileSync(new URL(path, publicDirectory), 'utf8');
const expectedIds = [
  'rainbow', 'progress', 'intersex-progress', 'lesbian', 'gay-men', 'bisexual',
  'pansexual', 'transgender', 'nonbinary', 'genderqueer', 'genderfluid', 'agender',
  'bigender', 'intersex', 'asexual', 'aromantic', 'aroace', 'demisexual',
  'demiromantic', 'sapphic', 'achillean', 'omnisexual', 'polysexual',
];
const provenance = JSON.parse(readPublic('flags/sources.json')) as Array<{
  id: string; assetPath: string; sourceUrl: string; licenseUrl: string;
  viewBox: string; bundledSha256: string;
}>;

afterEach(() => vi.unstubAllEnvs());

describe('the bundled flag catalog', () => {
  it('contains all 23 requested identities, with distinct IDs and local paths', () => {
    expect(FLAGS).toHaveLength(23);
    expect(FLAGS.map(flag => flag.id).sort()).toEqual([...expectedIds].sort());
    expect(new Set(FLAGS.map(flag => flag.id)).size).toBe(23);
    expect(new Set(FLAGS.map(flag => flag.assetPath)).size).toBe(23);
    expect(provenance).toHaveLength(FLAGS.length);
  });

  it.each(FLAGS)('$name has a complete source, named variant and matching local SVG', flag => {
    expect(flag.name.trim()).not.toBe('');
    expect(flag.variant.trim()).not.toBe('');
    expect(flag.license.trim()).not.toBe('');
    expect(flag.attribution.trim()).not.toBe('');
    expect(new URL(flag.sourceUrl).hostname).toBe('commons.wikimedia.org');
    expect(flag.assetPath).toMatch(/^flags\/[a-z0-9-]+\.svg$/);
    const fullPath = fileURLToPath(new URL(flag.assetPath, publicDirectory));
    expect(fullPath.startsWith(fileURLToPath(publicDirectory))).toBe(true);

    const svg = readPublic(flag.assetPath);
    expect(svg).toMatch(/^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
    const source = provenance.find(entry => entry.id === flag.id);
    expect(source).toBeDefined();
    expect(source?.assetPath).toBe(flag.assetPath);
    expect(source?.sourceUrl).toBe(flag.sourceUrl);
    expect(source?.licenseUrl).toMatch(/^https?:\/\//);
    expect(createHash('sha256').update(svg).digest('hex')).toBe(source?.bundledSha256);
  });

  it.each(FLAGS)('$name retains its original viewBox and intrinsic aspect ratio', flag => {
    const root = readPublic(flag.assetPath).match(/^<svg\b[^>]*>/)?.[0] ?? '';
    const attribute = (name: string): string => root.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1] ?? '';
    const viewBox = attribute('viewBox');
    expect(viewBox).toBe(provenance.find(entry => entry.id === flag.id)?.viewBox);
    const coordinates = viewBox.trim().split(/[\s,]+/).map(Number);
    expect(coordinates).toHaveLength(4);
    expect(coordinates.every(Number.isFinite)).toBe(true);
    const [x, y, width, height] = coordinates;
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    const intrinsicWidth = Number(attribute('width'));
    const intrinsicHeight = Number(attribute('height'));
    expect(intrinsicWidth).toBeGreaterThan(0);
    expect(intrinsicHeight).toBeGreaterThan(0);
    // Commons rounds some intrinsic raster sizes (e.g. 512×325); the vector viewBox is exact.
    expect(Math.abs(intrinsicWidth - intrinsicHeight * width / height)).toBeLessThan(1);
  });

  it.each(FLAGS)('$name contains only static, self-contained SVG drawing elements', flag => {
    const svg = readPublic(flag.assetPath);
    const safeTags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'polygon',
      'polyline', 'line', 'defs', 'use', 'clipPath', 'mask', 'title', 'desc',
      'linearGradient', 'radialGradient', 'stop']);
    for (const match of svg.matchAll(/<\/?([\w:-]+)\b/g)) expect(safeTags.has(match[1])).toBe(true);
    expect(svg).not.toMatch(/<!DOCTYPE|<!ENTITY|<\?|\bon[a-z]+\s*=|javascript\s*:|@import/i);
    for (const match of svg.matchAll(/\b(?:href|xlink:href|src)\s*=\s*["']([^"']*)["']/gi)) {
      expect(match[1]).toMatch(/^#[A-Za-z_][\w:.-]*$/);
    }
    for (const match of svg.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)) {
      expect(match[1]).toMatch(/^#[A-Za-z_][\w:.-]*$/);
    }
  });

  it('retains the circles, flower paths and chevrons that identify the symbol-bearing flags', () => {
    for (const id of ['intersex', 'intersex-progress']) {
      expect(readPublic(`flags/${id}.svg`)).toMatch(/<circle\b/);
    }
    for (const id of ['progress', 'intersex-progress']) {
      const svg = readPublic(`flags/${id}.svg`);
      expect([...svg.matchAll(/<path\b/g)].length).toBeGreaterThanOrEqual(10);
    }
    for (const id of ['sapphic', 'achillean']) {
      expect([...readPublic(`flags/${id}.svg`).matchAll(/<path\b/g)].length).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('flag URLs on GitHub Pages', () => {
  it.each(['/', '/gaylaxy-maker/', '/nested/repository/'])('honors the Vite base %s', base => {
    vi.stubEnv('BASE_URL', base);
    for (const flag of FLAGS) {
      expect(assetUrl(flag.assetPath)).toBe(`${base}${flag.assetPath}`);
      expect(assetUrl(`/${flag.assetPath}`)).toBe(`${base}${flag.assetPath}`);
      const publishedUrl = new URL(assetUrl(flag.assetPath), 'https://example.github.io');
      expect(publishedUrl.pathname).toBe(`${base}${flag.assetPath}`);
      expect(publishedUrl.origin).toBe('https://example.github.io');
    }
  });
});
