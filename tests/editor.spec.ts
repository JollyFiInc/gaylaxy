import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';

interface StreamInfo { codec_name: string; codec_type: string; width?: number; height?: number; nb_frames?: string; duration?: string }
interface MediaInfo { streams: StreamInfo[]; format: { duration: string; tags?: Record<string, string> } }

function probe(path: string): MediaInfo {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,nb_frames,duration:format=duration:format_tags', '-of', 'json', path], { encoding: 'utf8' })) as MediaInfo;
}

function toneWav(duration = 24): Buffer {
  const sampleRate = 48000;
  const frames = sampleRate * duration;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index++) bytes.writeInt16LE(Math.round(Math.sin(index * 440 * Math.PI * 2 / sampleRate) * 5000), 44 + index * 2);
  return bytes;
}

async function syntheticPicture(page: Page, color: string): Promise<Buffer> {
  const base64 = await page.evaluate(color => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, 128, 128);
    context.fillStyle = '#fff'; context.fillRect(30, 35, 16, 16); context.fillRect(80, 35, 16, 16); context.fillRect(40, 87, 50, 12);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  return Buffer.from(base64, 'base64');
}

async function previewHash(page: Page): Promise<number> {
  return page.getByRole('img', { name: 'Live preview of your galaxy meme' }).evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < bytes.length; index += 16) hash = Math.imul(hash ^ bytes[index], 16777619);
    return hash >>> 0;
  });
}

async function saveDownload(page: Page, info: TestInfo, name: string, action: () => Promise<void>): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await action();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const path = info.outputPath(name);
  await download.saveAs(path);
  return path;
}

function assertVideo(path: string, frames: number, resolution = 720): MediaInfo {
  const info = probe(path);
  const video = info.streams.find(stream => stream.codec_type === 'video')!;
  const audio = info.streams.find(stream => stream.codec_type === 'audio')!;
  expect(video.codec_name).toBe('h264'); expect(video.width).toBe(resolution); expect(video.height).toBe(resolution);
  expect(Number(video.nb_frames)).toBe(frames); expect(Number(video.duration)).toBeCloseTo(frames / 30, 4);
  expect(audio.codec_name).toBe('aac'); expect(info.format.tags?.comment).toContain('Bisexual');
  return info;
}

function assertAudioOffset(path: string): void {
  const bytes = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '48000', '-t', '1.2', '-f', 'f32le', 'pipe:1'], { maxBuffer: 1_000_000 });
  const rms = (start: number, duration: number): number => {
    const count = Math.floor(duration * 48000); let energy = 0;
    for (let frame = Math.floor(start * 48000); frame < Math.floor(start * 48000) + count; frame++) energy += bytes.readFloatLE(frame * 4) ** 2;
    return Math.sqrt(energy / count);
  };
  expect(rms(0.05, 0.2)).toBeLessThan(0.001); // User chose a 0.5-second delay.
  expect(rms(0.8, 0.2)).toBeGreaterThan(0.05); // The soundtrack is actually audible.
}

test('nested production editor: uploads, preview, project roundtrip, MP4, MP3, cancel and software retry', async ({ page }, info) => {
  const errors: string[] = [];
  const failedRequests: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto('./');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  const nativeSupported = await page.evaluate(async () => {
    try { return typeof VideoEncoder !== 'undefined' && (await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 720, height: 720, bitrate: 5_000_000, framerate: 30 })).supported; }
    catch { return false; }
  });
  await expect(page.getByRole('heading', { name: 'Meet you in the gaylaxy.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make my video' })).toBeEnabled();
  expect(new URL(page.url()).pathname).toContain('/gaylaxy-maker/');

  // Upload synthetic PNGs through the actual file inputs; no personal files.
  await page.getByLabel('Choose profile picture 1').setInputFiles({ name: 'violet-person.png', mimeType: 'image/png', buffer: await syntheticPicture(page, '#bc80e7') });
  await expect(page.getByRole('button', { name: 'Make my video' })).toBeEnabled();
  await page.getByLabel('Choose profile picture 2').setInputFiles({ name: 'blue-person.png', mimeType: 'image/png', buffer: await syntheticPicture(page, '#63afcf') });
  await expect(page.getByRole('button', { name: 'Make my video' })).toBeEnabled();
  await page.getByLabel('Person 1 name').fill('Violet');
  await page.getByLabel('Person 2 name').fill('Blue');
  await page.getByLabel('Your main caption').fill('Violet and Blue');
  await expect(page.getByRole('img', { name: 'Profile picture for Violet' })).toBeVisible();
  await page.getByRole('button', { name: 'Swap people' }).click();
  await expect(page.getByLabel('Person 1 name')).toHaveValue('Blue');
  await page.getByRole('button', { name: 'Swap people' }).click();
  await page.getByRole('button', { name: 'Gaylaxy', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Make my video' })).toBeEnabled();
  const beforeFlag = await previewHash(page);
  await page.getByRole('tab', { name: 'Flag', exact: true }).click();
  await page.getByLabel('Search flags').fill('bisexual');
  await page.getByRole('button', { name: 'Bisexual', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bisexual', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => previewHash(page)).not.toBe(beforeFlag);

  await page.getByRole('tab', { name: 'Sound', exact: true }).click();
  await page.getByLabel('Choose soundtrack').setInputFiles({ name: 'synthetic-tone.wav', mimeType: 'audio/wav', buffer: toneWav() });
  await expect(page.getByLabel('Audio waveform')).toBeVisible();
  await page.getByLabel('Audio trim start').fill('1.5');
  const audioOffset = page.getByRole('slider', { name: 'Start on video timeline' });
  await audioOffset.focus();
  for (let index = 0; index < 5; index++) await audioOffset.press('ArrowRight');
  await expect(audioOffset).toHaveValue('0.5');
  await page.getByLabel('Video quality').selectOption('720');
  const startPosition = Number(await page.getByLabel('Preview position').inputValue());
  await page.getByRole('button', { name: 'Play preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause preview', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await page.getByLabel('Preview position').inputValue())).toBeGreaterThan(startPosition + 0.2);
  await page.getByRole('button', { name: 'Pause preview', exact: true }).click();

  const projectPath = await saveDownload(page, info, 'project.zip', () => page.getByRole('button', { name: 'Save project', exact: true }).click());
  const projectFiles = unzipSync(new Uint8Array(await readFile(projectPath)));
  const manifest = JSON.parse(new TextDecoder().decode(projectFiles['project.json']));
  expect(manifest.config.name1).toBe('Violet'); expect(manifest.config.flagId).toBe('bisexual');
  expect(manifest.config.audioTrimStart).toBe(1.5); expect(manifest.config.audioOffset).toBe(0.5);
  expect(projectFiles['media/audio'].length).toBeGreaterThan(1000);
  expect(projectFiles['media/selectedFlag'].length).toBeGreaterThan(100);
  expect(new TextDecoder().decode(projectFiles['credits.txt'])).toContain('Bisexual');
  await page.getByRole('tab', { name: 'People', exact: true }).click();
  await page.getByLabel('Person 1 name').fill('Temporary edit');
  await page.getByLabel('Open saved project').setInputFiles(projectPath);
  await expect(page.getByText('Project opened. Everything is ready to edit.')).toBeVisible();
  await expect(page.getByLabel('Person 1 name')).toHaveValue('Violet');
  await expect(page.getByLabel('Your main caption')).toHaveValue('Violet and Blue');
  await page.getByRole('tab', { name: 'Sound', exact: true }).click();
  await expect(page.getByLabel('Audio trim start')).toHaveValue('1.5');
  await expect(page.getByRole('slider', { name: 'Start on video timeline' })).toHaveValue('0.5');

  // Export the reference's complete 560-frame timeline through the real UI.
  await page.getByRole('button', { name: 'Make my video' }).click();
  await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toBeVisible({ timeout: 120_000 });
  if (nativeSupported) await expect(page.getByText(/Software export/)).toHaveCount(0);
  const nativePath = await saveDownload(page, info, 'reference.mp4', () => page.getByRole('link', { name: 'Download MP4', exact: true }).click());
  assertVideo(nativePath, 560);
  assertAudioOffset(nativePath);
  const mp3Path = await saveDownload(page, info, 'soundtrack.mp3', () => page.getByRole('button', { name: 'MP3 audio', exact: true }).click());
  const mp3 = probe(mp3Path);
  expect(mp3.streams[0].codec_name).toBe('mp3'); expect(Number(mp3.format.duration)).toBeCloseTo(560 / 30, 1);

  // Force software mode to exercise same-origin WASM/worker paths in dist.
  await page.getByText('Export options', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Use software encoder' }).check();
  await page.getByRole('button', { name: 'Make my video' }).click();
  await expect(page.getByRole('button', { name: 'Cancel export', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await expect(page.getByText('Export cancelled. Your edits are still here.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make my video' })).toBeEnabled();
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await page.getByText('Scene timing', { exact: true }).click();
  const duration = page.getByRole('slider', { name: 'Video duration' });
  await duration.focus(); await duration.press('Home');
  await expect(duration).toHaveValue('8');
  await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Make my video' }).click();
  await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Software export/)).toBeVisible();
  const fallbackPath = await saveDownload(page, info, 'software-retry.mp4', () => page.getByRole('link', { name: 'Download MP4', exact: true }).click());
  assertVideo(fallbackPath, 240);

  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
  const origin = new URL(page.url()).origin;
  expect(requests.every(url => url.startsWith(`${origin}/gaylaxy-maker/`))).toBe(true);
  expect(requests.some(url => url.endsWith('/encoder/ffmpeg-core.wasm'))).toBe(true);
  await info.attach('verification', { contentType: 'application/json', body: JSON.stringify({ native: probe(nativePath), fallback: probe(fallbackPath), mp3 }, null, 2) });
});

test('static host is non-isolated and project ZIP keeps both uploads plus selected flag', async ({ page }, info) => {
  await page.goto('./');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  const generate = page.getByRole('button', { name: 'Make my video' });
  await expect(generate).toBeEnabled();
  const first = await syntheticPicture(page, '#db7696');
  const second = await syntheticPicture(page, '#89a3da');
  await page.getByLabel('Choose profile picture 1').setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: first });
  await expect(generate).toBeEnabled();
  await page.getByLabel('Choose profile picture 2').setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: second });
  await expect(generate).toBeEnabled();
  await page.getByRole('tab', { name: 'Flag', exact: true }).click();
  await page.getByLabel('Search flags').fill('bisexual');
  await page.getByRole('button', { name: 'Bisexual', exact: true }).click();
  await expect(generate).toBeEnabled();
  const path = await saveDownload(page, info, 'static-host-project.zip', () => page.getByRole('button', { name: 'Save project', exact: true }).click());
  const files = unzipSync(new Uint8Array(await readFile(path)));
  expect(Buffer.from(files['media/first'])).toEqual(first);
  expect(Buffer.from(files['media/second'])).toEqual(second);
  expect(new TextDecoder().decode(files['media/selectedFlag'])).toContain('<svg');
  const manifest = JSON.parse(new TextDecoder().decode(files['project.json']));
  expect(manifest.config.flagId).toBe('bisexual');
  expect(manifest.media.selectedFlag.path).toBe('media/selectedFlag');
});
