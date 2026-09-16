import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

function silentWav(): Buffer {
  const rate = 48000, bytes = Buffer.alloc(44 + rate * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(rate * 2, 40);
  return bytes;
}

test('slow initialization guards audio and flag uploads, then preserves a user audio selection', async ({ page }, info) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/audio/gaylaxy-soundtrack.mp3', async (route) => { await pending; await route.continue(); });
  try {
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Flag', exact: true }).click();
    await expect(page.getByLabel('Choose custom flag')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Upload your own flag', exact: true })).toBeDisabled();
    await page.getByRole('tab', { name: 'Sound', exact: true }).click();
    await expect(page.getByLabel('Choose soundtrack')).toBeDisabled();
    await expect(page.getByRole('button', { name: /Drop your audio or video here/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Use built-in soundtrack', exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole('button', { name: 'Make my video', exact: true })).toBeEnabled();
    await page.getByRole('tab', { name: 'Flag', exact: true }).click();
    await expect(page.getByLabel('Choose custom flag')).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Upload your own flag', exact: true })).toBeEnabled();
    await page.getByRole('tab', { name: 'Sound', exact: true }).click();
    await expect(page.getByLabel('Choose soundtrack')).toBeEnabled();

    const uploaded = silentWav();
    await page.getByLabel('Choose soundtrack').setInputFiles({ name: 'startup-selected.wav', mimeType: 'audio/wav', buffer: uploaded });
    await expect(page.getByText('Soundtrack added. Play your preview to check the timing.', { exact: true })).toBeVisible();
    await expect(page.getByText('startup-selected.wav', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use built-in soundtrack', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'MP3 audio', exact: true })).toBeEnabled();

    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    const download = await downloading, path = info.outputPath('startup-audio.zip');
    await download.saveAs(path);
    const files = unzipSync(new Uint8Array(await readFile(path)));
    const manifest = JSON.parse(new TextDecoder().decode(files['project.json']));
    expect(manifest.media.audio.name).toBe('startup-selected.wav');
    expect(Buffer.from(files['media/audio'])).toEqual(uploaded);
  } finally { release(); }
});
