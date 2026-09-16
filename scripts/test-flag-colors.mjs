// Run against Vite (not dist): FLAG_TEST_URL=http://127.0.0.1:5176/ node scripts/test-flag-colors.mjs
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const url = process.env.FLAG_TEST_URL || 'http://127.0.0.1:5176/';
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  // Prevent UI/HMR updates from affecting the source-module verification page.
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Flag colour verification</title>' }));
  await page.goto(url);
  const result = await page.evaluate(async () => {
    const base = new URL('.', location.href);
    const { extractFlagPalette, recolorFlagSvg } = await import(new URL('src/lib/flag-colors.ts', base).href);
    const { FLAGS } = await import(new URL('src/flags.ts', base).href);
    const raster = async (svg) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 320;
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      } finally { URL.revokeObjectURL(url); }
    };
    const geometry = (svg) => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      return [doc.documentElement, ...doc.documentElement.querySelectorAll('*')].map((element) => ({
        tag: element.localName,
        attrs: [...element.attributes].filter((attribute) => !['fill', 'stroke', 'stop-color', 'style'].includes(attribute.name)).map((attribute) => [attribute.name, attribute.value]).sort(),
      }));
    };
    const reports = [];
    for (const flag of FLAGS) {
      const svg = await (await fetch(new URL(flag.assetPath, base))).text();
      const palette = extractFlagPalette(svg);
      if (!palette.length || palette.some(color => !/^#[0-9a-f]{6}$/.test(color))) throw new Error(`Invalid palette: ${flag.id}`);
      if (!['sapphic', 'progress', 'demisexual', 'intersex-progress'].includes(flag.id)) continue;
      // Every solid original paint receives a distinct replacement, allowing
      // exact per-pixel checks of flowers, triangles, chevrons, and circles.
      const replacements = Object.fromEntries(palette.map((color, index) => [color, `#${(0x234567 + index * 0x080605).toString(16).padStart(6, '0')}`]));
      const recolored = recolorFlagSvg(svg, replacements);
      if (JSON.stringify(geometry(svg)) !== JSON.stringify(geometry(recolored))) throw new Error(`Geometry changed: ${flag.id}`);
      const before = await raster(svg), after = await raster(recolored);
      const masks = Object.fromEntries(palette.map(color => [color, 0]));
      let alphaChanges = 0, mismatches = 0;
      for (let index = 0; index < before.length; index += 4) {
        if (before[index + 3] !== after[index + 3]) alphaChanges++;
        if (before[index + 3] !== 255) continue;
        const color = '#' + [before[index], before[index + 1], before[index + 2]].map(value => value.toString(16).padStart(2, '0')).join('');
        if (!Object.hasOwn(replacements, color)) continue;
        masks[color]++;
        const target = replacements[color];
        if ([1, 3, 5].some((offset, channel) => Math.abs(after[index + channel] - Number.parseInt(target.slice(offset, offset + 2), 16)) > 1)) mismatches++;
      }
      if (alphaChanges || mismatches) throw new Error(`Flag pixels changed shape: ${flag.id} (${alphaChanges} alpha changes; ${mismatches} paint mismatches)`);
      if (Object.values(masks).some(count => count < 5)) throw new Error(`A flag feature vanished or was not tested: ${flag.id}`);
      reports.push({ flag: flag.id, colors: palette.length, preservedColorMasks: masks });
    }
    const implicit = '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><path d="M0 0h3v2H0z"/></svg>';
    if (JSON.stringify(extractFlagPalette(implicit)) !== '["#000000"]') throw new Error('Implicit black was not detected.');
    const pixels = await raster(recolorFlagSvg(implicit, { '#000000': '#12ab34' }));
    const center = (160 * 480 + 240) * 4;
    if (pixels[center] !== 18 || pixels[center + 1] !== 171 || pixels[center + 2] !== 52) throw new Error('Implicit black did not recolor.');
    return { flagsChecked: FLAGS.length, implicitBlack: true, reports, browser: navigator.userAgent };
  });
  assert.equal(result.flagsChecked, 23); assert.equal(result.reports.length, 4); assert.equal(result.implicitBlack, true);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
