import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const url = process.env.ENCODER_TEST_URL || 'http://127.0.0.1:4178/';
const native1080 = process.env.NATIVE_1080_CHECK === '1';
const outputDirectory = native1080 ? '/tmp/gaylaxy-encoder-test-1080' : '/tmp/gaylaxy-encoder-test';
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  // Use an inert test document so concurrent UI edits and Vite HMR cannot reload
  // the browser in the middle of a real encode.
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Encoder integration test</title>' }));
  page.on('console', message => { if (message.type() === 'error') console.error('Browser:', message.text()); });
  page.on('pageerror', error => console.error('Browser error:', error.message));
  await page.goto(url);
  await page.exposeFunction('saveEncoderResult', async (name, base64) => { await writeFile(`${outputDirectory}/${name}`, Buffer.from(base64, 'base64')); });
  await page.exposeFunction('encoderLog', message => console.log(message));
  await page.evaluate(async ({ full, native1080 }) => {
    const saveBlob = async (name, blob) => {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob);
      });
      await window.saveEncoderResult(name, base64);
    };
    const { exportVideo, exportMp3 } = await import('/src/lib/export.ts');
    const { freshConfig } = await import('/src/config.ts');
    const { decodeAudio } = await import('/src/lib/audio.ts');
    const makeImage = (color) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 150;
      const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 150, 150);
      context.fillStyle = '#fff'; context.fillRect(40, 40, 20, 20); context.fillRect(90, 40, 20, 20); context.fillRect(50, 100, 50, 10);
      return { image: canvas, width: 150, height: 150 };
    };
    const assets = { pfps: [makeImage('#c69beb'), makeImage('#aaceec')], flag: makeImage('#e87ba8') };
    const config = { ...freshConfig(), duration: full ? 560 / 30 : 2, resolution: native1080 ? 1080 : 720 };
    const audio = new AudioBuffer({ numberOfChannels: 1, length: 48000 * config.duration, sampleRate: 48000 });
    const samples = audio.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.sin(index * 440 * 2 * Math.PI / 48000) * 0.1;
    let lastStage = '';
    const onProgress = progress => {
      if (progress.stage.includes('part') || (progress.fraction === 1 && progress.stage !== lastStage)) window.encoderLog(progress.stage);
      lastStage = progress.stage;
    };
    const native = await exportVideo({ config, assets, audio, onProgress });
    await saveBlob('auto.mp4', native.blob);
    await window.encoderLog(`Auto encoder: ${native.method}; ${native.blob.type}; ${native.blob.size} bytes`);
    const decoded = await decodeAudio(native.blob);
    if (Math.abs(decoded.duration - config.duration) > 0.1) throw new Error(`Decoded soundtrack duration ${decoded.duration} mismatches ${config.duration}`);
    if (native1080) {
      if (native.method !== 'webcodecs') throw new Error('This browser did not use native AVC encoding at1080.');
      globalThis.OffscreenCanvas = undefined;
      const main = await exportVideo({ config, assets, audio, onProgress });
      if (main.method !== 'webcodecs') throw new Error('Main-thread native encoding failed.');
      await saveBlob('main-thread.mp4', main.blob);
      await window.encoderLog('1080p export passed with and without OffscreenCanvas.');
      return;
    }
    const fallback = await exportVideo({ config, assets, audio, forceFallback: true, onProgress });
    await saveBlob('fallback.mp4', fallback.blob);
    const mp3 = await exportMp3(audio, config, undefined, onProgress);
    await saveBlob('soundtrack.mp3', mp3);
    const abort = new AbortController();
    let cancelled = false;
    try {
      await exportVideo({ config, assets, audio, signal: abort.signal, forceFallback: true, onProgress: progress => { if (progress.fraction > 0.03) abort.abort(); } });
    } catch (error) { cancelled = error.name === 'AbortError'; }
    if (!cancelled) throw new Error('Cancellation did not reject with AbortError.');
    await window.encoderLog('Cancellation returned AbortError.');
    const retry = await exportVideo({ config: { ...config, duration: 0.5 }, assets, audio, forceFallback: true });
    if (retry.blob.size < 1000) throw new Error('Retry returned an empty file.');
    await window.encoderLog('Retry succeeded after cancellation.');
  }, { full: process.env.FULL_ENCODER_TEST === '1', native1080 });
  for (const name of native1080 ? ['auto.mp4', 'main-thread.mp4'] : ['auto.mp4', 'fallback.mp4', 'soundtrack.mp3']) {
    const metadata = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,nb_frames,duration', '-of', 'json', `${outputDirectory}/${name}`], { encoding: 'utf8' });
    console.log(name, metadata);
    const streams = JSON.parse(metadata).streams;
    if (name.endsWith('.mp4')) {
      const video = streams.find(stream => stream.codec_type === 'video');
      const audio = streams.find(stream => stream.codec_type === 'audio');
      const resolution = native1080 ? 1080 : 720;
      if (video?.codec_name !== 'h264' || video.width !== resolution || video.height !== resolution || Number(video.nb_frames) !== (process.env.FULL_ENCODER_TEST === '1' ? 560 : 60)) throw new Error(`Invalid video metadata: ${metadata}`);
      if (audio?.codec_name !== 'aac') throw new Error(`Missing AAC audio: ${metadata}`);
    } else if (streams[0]?.codec_name !== 'mp3') throw new Error(`Invalid MP3 metadata: ${metadata}`);
  }
  console.log(`Encoder verification passed. Outputs: ${outputDirectory}`);
} finally { await browser.close(); }
