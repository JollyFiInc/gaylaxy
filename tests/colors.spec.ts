import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { DEFAULT_COLORS } from '../src/config';
import { FLAGS } from '../src/flags';
import type { VideoConfig } from '../src/types';

const preview = (page: Page) => page.getByRole('img', { name: 'Live preview of your galaxy meme' });
const ready = (page: Page) => expect(page.getByRole('button', { name: 'Make my video', exact: true })).toBeEnabled();

async function setInput(page: Page, label: string, value: string): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  // Set the native form control and dispatch its browser events; this supports
  // range/colour pickers without an operating-system-specific colour dialog.
  await input.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(input).toHaveValue(value);
}

async function frameHash(page: Page): Promise<number> {
  return preview(page).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < bytes.length; index += 4) {
      hash = Math.imul(hash ^ bytes[index], 16777619);
      hash = Math.imul(hash ^ bytes[index + 1], 16777619);
      hash = Math.imul(hash ^ bytes[index + 2], 16777619);
    }
    return hash >>> 0;
  });
}

async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return preview(page).evaluate((element, point) => {
    const canvas = element as HTMLCanvasElement;
    return Array.from(canvas.getContext('2d')!.getImageData(Math.floor(point.x * canvas.width / 1080), Math.floor(point.y * canvas.height / 1080), 1, 1).data);
  }, { x, y });
}

async function captionPixels(page: Page, hex: string): Promise<number> {
  return preview(page).evaluate((element, hex) => {
    const canvas = element as HTMLCanvasElement, scale = canvas.width / 1080;
    const data = canvas.getContext('2d')!.getImageData(0, Math.floor(840 * scale), canvas.width, Math.floor(170 * scale)).data;
    const rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (rgb.every((value, channel) => Math.abs(data[i + channel] - value) < 5)) count++;
    return count;
  }, hex);
}

async function chooseFlag(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Flag', exact: true }).click();
  await page.getByLabel('Search flags').fill(name);
  await page.getByRole('button', { name, exact: true }).click();
  await ready(page);
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await expect(page.getByLabel('Flag colour 1', { exact: true })).toBeVisible();
}

async function saveProject(page: Page, info: TestInfo, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = info.outputPath(name); await download.saveAs(path);
  const files = unzipSync(new Uint8Array(await readFile(path)));
  const manifest = JSON.parse(new TextDecoder().decode(files['project.json'])) as { config: VideoConfig };
  return { path, files, config: manifest.config };
}

test('every bundled flag exposes a valid editable palette through the production UI', async ({ page }) => {
  await page.goto('./'); await ready(page);
  for (const flag of FLAGS) {
    await chooseFlag(page, flag.name);
    const values = await page.locator('input[aria-label^="Flag colour "]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    expect(values.length, `${flag.name} palette`).toBeGreaterThan(0);
    expect(values.length).toBeLessThanOrEqual(32);
    for (const value of values) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(values).size).toBe(values.length);
  }
});

test('colour edits change rendered pixels, survive project reload, reset, and clear on flag change', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('./'); await ready(page);
  await expect(page.getByRole('button', { name: 'MP3 audio', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Sound', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Built-in soundtrack selected', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Audio waveform')).toBeVisible();
  await page.getByRole('button', { name: 'Remove soundtrack', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MP3 audio', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Use built-in soundtrack', exact: true }).click();
  await expect(page.getByText('Built-in soundtrack restored.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MP3 audio', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await expect(page.getByLabel('Flag colour 1', { exact: true })).toBeVisible();
  await setInput(page, 'Preview position', '8.5');
  const baseline = await frameHash(page);
  await setInput(page, 'Galaxy colour 1', '#18bd58');
  await setInput(page, 'Galaxy colour 2', '#f0a020');
  await setInput(page, 'Galaxy colour 3', '#5ddfc1');
  await expect.poll(() => frameHash(page)).not.toBe(baseline);
  await setInput(page, 'Caption text', '#ff5500');
  await setInput(page, 'Caption outline', '#00ff55');
  await expect.poll(() => captionPixels(page, '#ff5500')).toBeGreaterThan(100);
  await expect.poll(() => captionPixels(page, '#00ff55')).toBeGreaterThan(100);

  const originalFlagColor = await page.getByLabel('Flag colour 1', { exact: true }).inputValue();
  const beforeFlag = await frameHash(page);
  await setInput(page, 'Flag colour 1', '#56ff13'); await ready(page);
  await expect.poll(() => frameHash(page)).not.toBe(beforeFlag);
  await setInput(page, 'Intro background', '#a1b2c3');
  await setInput(page, 'Intro text', '#101820');
  await setInput(page, 'Intro accent text', '#e84080');
  await setInput(page, 'Preview position', '2');
  await expect.poll(() => pixel(page, 4, 4)).toEqual([161, 178, 195, 255]);
  await setInput(page, 'Preview position', '8.5');
  const customFrame = await frameHash(page);
  const saved = await saveProject(page, info, 'edited-colours.zip');
  expect(saved.files['media/audio'].length).toBeGreaterThan(1000);
  expect(saved.config.colors).toEqual({
    galaxy: ['#18bd58', '#f0a020', '#5ddfc1'], introBackground: '#a1b2c3',
    introCaptionFill: '#101820', introCaptionAccent: '#e84080', captionFill: '#ff5500', captionOutline: '#00ff55',
    flagOverrides: { [originalFlagColor]: '#56ff13' },
  });
  // The original SVG is retained, rather than baking edits into its source.
  expect(Buffer.from(saved.files['media/selectedFlag'])).toEqual(await readFile(new URL('../public/flags/sapphic.svg', import.meta.url)));

  await page.getByRole('button', { name: 'Reset colours', exact: true }).click(); await ready(page);
  await expect(page.getByLabel('Galaxy colour 1', { exact: true })).toHaveValue(DEFAULT_COLORS.galaxy[0]);
  await expect(page.getByLabel('Caption text', { exact: true })).toHaveValue(DEFAULT_COLORS.captionFill);
  await expect(page.getByLabel('Flag colour 1', { exact: true })).toHaveValue(originalFlagColor);
  await expect.poll(() => frameHash(page)).toBe(baseline);

  await page.getByLabel('Open saved project').setInputFiles(saved.path);
  await expect(page.getByText('Project opened. Everything is ready to edit.')).toBeVisible(); await ready(page);
  await expect(page.getByLabel('Flag colour 1', { exact: true })).toHaveValue('#56ff13');
  await expect(page.getByLabel('Intro background', { exact: true })).toHaveValue('#a1b2c3');
  await expect.poll(() => frameHash(page)).toBe(customFrame);

  await chooseFlag(page, 'Progress Pride');
  const switched = await saveProject(page, info, 'switched-flag.zip');
  expect(switched.config.flagId).toBe('progress'); expect(switched.config.colors.flagOverrides).toEqual({});
  expect(switched.config.colors.galaxy).toEqual(saved.config.colors.galaxy);
  expect(errors).toEqual([]);
});
