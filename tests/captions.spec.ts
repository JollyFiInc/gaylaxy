import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

async function picture(page: Page, color: string): Promise<Buffer> {
  const base64 = await page.evaluate(color => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color; context.fillRect(0, 0, 96, 96);
    context.fillStyle = '#fff'; context.fillRect(24, 25, 12, 12); context.fillRect(60, 25, 12, 12); context.fillRect(28, 65, 40, 8);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  return Buffer.from(base64, 'base64');
}

function readCaption(imagePath: string): string {
  // Isolate the deliberately selected orange fill from the purple galaxy.
  // Tesseract's default grayscale threshold can miss orange-on-purple words.
  const maskPath = imagePath.replace(/\.png$/, '-ocr-mask.png');
  const mask = "if(gt(r(X,Y),200)*lt(g(X,Y),150)*lt(b(X,Y),70),0,255)";
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', imagePath, '-vf', `format=gbrp,geq=r='${mask}':g='${mask}':b='${mask}'`, maskPath]);
  return execFileSync('tesseract', [maskPath, 'stdout', '--psm', '6'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
}

async function setColor(page: Page, label: string, value: string): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  await input.evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(input).toHaveValue(value);
}

function inspectMedia(video: string): void {
  const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', video], { encoding: 'utf8' })) as { streams: Array<{ codec_type: string; codec_name: string }> };
  expect(metadata.streams.find(stream => stream.codec_type === 'audio')?.codec_name).toBe('aac');
  const corner = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', video, '-frames:v', '1', '-vf', 'crop=8:8:10:10', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  const target = [0xa1, 0xb2, 0xc3];
  for (let channel = 0; channel < 3; channel++) {
    let total = 0;
    for (let index = channel; index < corner.length; index += 3) total += corner[index];
    expect(Math.abs(total / (corner.length / 3) - target[channel])).toBeLessThan(8);
  }
  const caption = execFileSync('ffmpeg', ['-v', 'error', '-ss', '8.5', '-i', video, '-frames:v', '1', '-vf', 'crop=iw:ih*0.24:0:ih*0.76', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 2_000_000 });
  let orangePixels = 0;
  for (let index = 0; index < caption.length; index += 3) {
    if (Math.abs(caption[index] - 255) < 25 && Math.abs(caption[index + 1] - 85) < 25 && caption[index + 2] < 25) orangePixels++;
  }
  expect(orangePixels).toBeGreaterThan(500);
}

async function captionPixels(page: Page, info: TestInfo, sentence: string, stem: string): Promise<{ video: string; frame: string; text: string; url: string; filename: string }> {
  await expect(page.getByLabel('Your main caption')).toHaveValue(sentence);
  // The initial preview is exactly 8.5s, inside the fully revealed main caption.
  const preview = await page.getByRole('img', { name: 'Live preview of your galaxy meme' }).evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const previewPath = info.outputPath(`${stem}-preview.png`);
  await writeFile(previewPath, Buffer.from(preview, 'base64'));
  await page.getByRole('button', { name: 'Make my video' }).click();
  const link = page.getByRole('link', { name: 'Download MP4', exact: true });
  await expect(link).toBeVisible({ timeout: 120_000 });
  const url = (await link.getAttribute('href'))!;
  await expect(page.getByLabel('Rendered video', { exact: true })).toHaveAttribute('src', url);
  const pendingDownload = page.waitForEvent('download');
  await link.click();
  const download = await pendingDownload;
  expect(download.suggestedFilename().toLowerCase()).toContain(sentence.toLowerCase().replaceAll(' ', '-'));
  const video = info.outputPath(`${stem}.mp4`);
  await download.saveAs(video);
  inspectMedia(video);
  const frame = info.outputPath(`${stem}-decoded-caption.png`);
  // OCR reads pixels from the downloaded MP4, never the project metadata.
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '8.5', '-i', video, '-frames:v', '1', '-vf', 'crop=iw:ih*0.24:0:ih*0.76,scale=1440:-1', frame]);
  const text = readCaption(frame);
  console.log(`${stem}: downloaded frame OCR = ${JSON.stringify(text)}; filename = ${download.suggestedFilename()}`);
  await info.attach(`${stem}-decoded-caption`, { path: frame, contentType: 'image/png' });
  expect(text).toContain(sentence);
  expect(text).not.toContain('YOU AND ME');
  return { video, frame, text, url, filename: download.suggestedFilename() };
}

for (const mode of ['automatic', 'software'] as const) {
  test(`${mode} exports use edited caption pixels and invalidate previous downloads`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('./');
    const generate = page.getByRole('button', { name: 'Make my video' });
    await expect(generate).toBeEnabled();
    await page.getByLabel('Choose profile picture 1').setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: await picture(page, '#d88fb5') });
    await expect(generate).toBeEnabled();
    await page.getByLabel('Choose profile picture 2').setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: await picture(page, '#81b9d8') });
    await expect(generate).toBeEnabled();
    await page.getByLabel('Video quality').selectOption('720');
    await page.getByRole('tab', { name: 'Style', exact: true }).click();
    await setColor(page, 'Intro background', '#a1b2c3');
    await setColor(page, 'Caption text', '#ff5500');
    await page.getByRole('tab', { name: 'People', exact: true }).click();
    if (mode === 'software') {
      await page.getByText('Export options', { exact: true }).click();
      await page.getByRole('checkbox', { name: 'Use software encoder' }).check();
    }
    await page.getByLabel('Your main caption').fill('CUSTOM ORBIT SENTENCE');
    const first = await captionPixels(page, info, 'CUSTOM ORBIT SENTENCE', `${mode}-first`);
    await page.getByLabel('Your main caption').fill('ANOTHER TRUE LOVE');
    await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toHaveCount(0);
    const second = await captionPixels(page, info, 'ANOTHER TRUE LOVE', `${mode}-second`);
    expect(second.url).not.toBe(first.url);
    expect(second.filename).not.toBe(first.filename);
    expect(second.text).not.toContain('CUSTOM ORBIT SENTENCE');
    // Re-rendering the same settings must also hide the previous finished file.
    await generate.click();
    await expect(page.getByRole('link', { name: 'Download MP4', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Rendered video', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
    await expect(page.getByText('Export cancelled. Your edits are still here.')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
