import type { CropConfig, LoadedAssets, RasterAsset, VideoColors, VideoConfig } from '../types';
import { DEFAULT_COLORS } from '../config';
import { clamp, getCaption, getPfpPose, getTimeline, mix, smoothstep, type CaptionState, type PfpPose } from './timeline';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = HTMLCanvasElement | OffscreenCanvas;
const TAU = Math.PI * 2;
const SIZE = 1080;
const mod = (value: number, limit: number): number => ((value % limit) + limit) % limit;

interface Star { x: number; y: number; radius: number; width: number; alpha: number; speed: number; phase: number; glint: boolean }
interface GalaxyCache {
  nebula: Surface; stars: Surface; fastStars: Star[];
  basePixels: Uint8ClampedArray; tintWeights: Float32Array; paletteKey: string;
}
let galaxy: GalaxyCache | undefined;
let flagRasters = new WeakMap<object, RasterAsset>();

function makeSurface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
function getContext(canvas: Surface): Context {
  const ctx = canvas.getContext('2d') as Context | null;
  if (!ctx) throw new Error('This browser could not create a canvas. Close other tabs and try again.');
  return ctx;
}
function mulberry32(seed: number): () => number {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(x: number, y: number): number {
  let a = Math.imul(x, 374761393) + Math.imul(y, 668265263) + 91713;
  a ^= a >>> 13;
  return ((Math.imul(a, 1274126177) ^ a >>> 16) >>> 0) / 4294967296;
}
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smoothstep(x - ix), fy = smoothstep(y - iy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x: number, y: number): number {
  let value = 0, amplitude = 0.53;
  for (let i = 0; i < 6; i++) {
    value += amplitude * noise(x, y);
    x = x * 2.03 + 7.2;
    y = y * 2.03 - 2.7;
    amplitude *= 0.49;
  }
  return value;
}

type RGB = readonly [number, number, number];
const rgb = (hex: string): RGB => [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
const defaultPalette = DEFAULT_COLORS.galaxy.map(rgb);
function colorDelta(palette: VideoColors['galaxy']): RGB[] {
  return palette.map((hex, index) => {
    const channels = rgb(hex), original = defaultPalette[index];
    return [channels[0] - original[0], channels[1] - original[1], channels[2] - original[2]];
  });
}
function tintedBase(hex: string, palette: VideoColors['galaxy'], strength: number): string {
  const channels = rgb(hex), delta = colorDelta(palette)[0];
  return `#${channels.map((channel, index) => Math.round(clamp(channel + delta[index] * strength, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function recolorGalaxy(palette: VideoColors['galaxy']): void {
  if (!galaxy) return;
  const key = palette.join(',');
  if (key === galaxy.paletteKey) return;
  const delta = colorDelta(palette), ctx = getContext(galaxy.nebula);
  const pixels = ctx.createImageData(galaxy.nebula.width, galaxy.nebula.height);
  // Noise remains cached. Only three weighted RGB colour adjustments are needed
  // after a palette edit, and no per-pixel work is repeated on ordinary frames.
  for (let pixel = 0; pixel < galaxy.basePixels.length / 4; pixel++) {
    const index = pixel * 4, weight = pixel * 3;
    for (let channel = 0; channel < 3; channel++) {
      pixels.data[index + channel] = galaxy.basePixels[index + channel]
        + delta[0][channel] * galaxy.tintWeights[weight]
        + delta[1][channel] * galaxy.tintWeights[weight + 1]
        + delta[2][channel] * galaxy.tintWeights[weight + 2];
    }
    pixels.data[index + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  galaxy.paletteKey = key;
}

/** Called once per rendering realm; palette changes reuse the expensive noise. */
export function warmRenderer(palette?: VideoColors['galaxy']): void {
  if (galaxy) { if (palette) recolorGalaxy(palette); return; }
  const width = 768, height = 432;
  const nebula = makeSurface(width, height), ctx = getContext(nebula);
  const pixels = ctx.createImageData(width, height);
  const tintWeights = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / 142.5, v = y / 111.3;
      const warpX = fbm(u * 0.8 + 8, v * 0.8), warpY = fbm(u * 0.8, v * 0.8 + 6);
      const n = fbm(u + warpX * 2.7, v + warpY * 2.7);
      const ridge = Math.max(0, 1 - Math.abs(n - 0.48) * 4) ** 3.4;
      const cloud = Math.max(0, (n - 0.24) * 1.35);
      const pink = Math.max(0, (fbm(u * 0.9 + 21, v * 0.8 + 15) - 0.39) * 3.2);
      const cyan = Math.max(0, (fbm(u * 1.25 + 41, v * 1.25 + 12) - 0.45) * 3);
      const hot = Math.max(0, (n - 0.48) * 3.8) ** 1.2;
      const filament = ridge * 0.34, i = (y * width + x) * 4;
      pixels.data[i] = 9 + cloud * 42 + filament * 65 + pink * cloud * 142 + hot * 105;
      pixels.data[i + 1] = 5 + cloud * 13 + filament * 17 + cyan * cloud * 108 + hot * 39;
      pixels.data[i + 2] = 31 + cloud * 115 + filament * 68 + cyan * 57 + hot * 86;
      pixels.data[i + 3] = 255;
      const weight = (y * width + x) * 3;
      tintWeights[weight] = cloud * 0.8 + filament;
      tintWeights[weight + 1] = pink * cloud * 0.65 + hot * 0.45;
      tintWeights[weight + 2] = cyan * 0.55;
    }
  }
  // Blend a short overlap into the right edge to make horizontal tiling seamless.
  const overlap = 100;
  for (let y = 0; y < height; y++) for (let x = 0; x < overlap; x++) {
    const weight = smoothstep(x / (overlap - 1));
    const dest = (y * width + width - overlap + x) * 4;
    const source = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) pixels.data[dest + channel] = mix(pixels.data[dest + channel], pixels.data[source + channel], weight);
    const targetWeight = (y * width + width - overlap + x) * 3, sourceWeight = (y * width + x) * 3;
    for (let channel = 0; channel < 3; channel++) tintWeights[targetWeight + channel] = mix(tintWeights[targetWeight + channel], tintWeights[sourceWeight + channel], weight);
  }
  ctx.putImageData(pixels, 0, 0);

  const stars = makeSurface(2200, 1200), sc = getContext(stars), random = mulberry32(7927);
  for (let i = 0; i < 1600; i++) {
    const x = random() * 2200, y = random() * 1200;
    const radius = 0.4 + random() ** 3 * 2, alpha = 0.18 + random() * 0.7;
    sc.fillStyle = `rgba(${210 + Math.floor(random() * 45)},${210 + Math.floor(random() * 45)},255,${alpha})`;
    sc.beginPath();
    sc.ellipse(x, y, radius * (1 + random() * 1.4), radius, 0, 0, TAU);
    sc.fill();
  }
  const fastStars = Array.from({ length: 76 }, (_, i): Star => {
    const radius = 0.8 + random() * 2;
    return { x: random() * 1440, y: random() * SIZE, radius, width: radius * (2 + random() * 9), alpha: 0.22 + random() * 0.61, speed: 140 + random() * 420, phase: random() * TAU, glint: i % 11 === 0 };
  });
  galaxy = { nebula, stars, fastStars, basePixels: pixels.data, tintWeights, paletteKey: DEFAULT_COLORS.galaxy.join(',') };
  if (palette) recolorGalaxy(palette);
}

export function clearRendererCache(): void { galaxy = undefined; flagRasters = new WeakMap(); }

function rasterFlag(asset: RasterAsset): RasterAsset {
  const existing = flagRasters.get(asset.image);
  if (existing) return existing;
  // Repainting an SVG for every cloth slice is expensive. Rasterize it once at
  // enough resolution for 1080p, then reuse that surface in preview and export.
  const scale = Math.min(1, 1200 / Math.max(asset.width, asset.height));
  const width = Math.max(1, Math.round(asset.width * scale));
  const height = Math.max(1, Math.round(asset.height * scale));
  const image = makeSurface(width, height);
  getContext(image).drawImage(asset.image, 0, 0, width, height);
  const raster = { image, width, height };
  flagRasters.set(asset.image, raster);
  return raster;
}

function drawGalaxy(ctx: Context, time: number, config: VideoConfig): void {
  const palette = config.colors.galaxy;
  warmRenderer(palette);
  if (!galaxy) return;
  const speedTime = time * config.flightSpeed;
  const background = tintedBase('#09051f', palette, 0.16);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.globalAlpha = clamp(0.88 * config.brightness, 0, 1);
  const textureWidth = 2400;
  const offset = mod(speedTime * 91, textureWidth);
  // The cropped overlap matches the first sample exactly across repeated tiles.
  const effectiveWidth = galaxy.nebula.width - 100;
  for (let i = 0; i < 2; i++) ctx.drawImage(galaxy.nebula, 100, 0, effectiveWidth, galaxy.nebula.height, -offset + i * textureWidth, -130 + Math.sin(time * 0.15) * 26, textureWidth, 1350);
  ctx.globalCompositeOperation = 'screen';
  const haze = ctx.createRadialGradient(220 - Math.sin(time * 0.15) * 90, 250, 0, 300, 300, 760);
  haze.addColorStop(0, `${palette[0]}4a`); haze.addColorStop(1, `${tintedBase('#3e1954', palette, 0.5)}00`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const pinkHaze = ctx.createRadialGradient(890, 870, 0, 850, 850, 550);
  pinkHaze.addColorStop(0, `${palette[1]}35`); pinkHaze.addColorStop(1, `${palette[1]}00`);
  ctx.fillStyle = pinkHaze;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.globalCompositeOperation = 'source-over';
  const starOffset = mod(speedTime * 185, 2200);
  ctx.globalAlpha = clamp(config.brightness, 0.15, 1);
  ctx.drawImage(galaxy.stars, -starOffset, -50);
  ctx.drawImage(galaxy.stars, 2200 - starOffset, -50);
  for (const star of galaxy.fastStars) {
    const x = mod(star.x - speedTime * star.speed, 1440) - 180;
    const twinkle = 0.82 + 0.18 * Math.sin(time * 1.3 + star.phase);
    ctx.globalAlpha = star.alpha * twinkle * clamp(config.brightness, 0.2, 1.25);
    ctx.fillStyle = '#fff4ff';
    if (star.glint) {
      ctx.fillRect(x - 11, star.y - 0.7, 22, 1.4);
      ctx.fillRect(x - 0.7, star.y - 10, 1.4, 20);
      const glow = ctx.createRadialGradient(x, star.y, 0, x, star.y, 13);
      glow.addColorStop(0, '#ffffffaa'); glow.addColorStop(1, '#dfcaff00');
      ctx.fillStyle = glow; ctx.fillRect(x - 13, star.y - 13, 26, 26);
    } else {
      ctx.beginPath(); ctx.ellipse(x, star.y, star.width / 2, star.radius / 2, 0, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  if (config.brightness > 1) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const glow = rgb(tintedBase('#643296', palette, 0.65));
    ctx.fillStyle = `rgba(${glow.join(',')},${clamp((config.brightness - 1) * 0.19, 0, 0.45)})`;
    ctx.fillRect(0, 0, SIZE, SIZE); ctx.restore();
  }
  const vignette = ctx.createRadialGradient(590, 480, 240, 540, 540, 790);
  vignette.addColorStop(0, `${background}00`); vignette.addColorStop(1, `${background}87`);
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, SIZE, SIZE);
}

function sparkle(ctx: Context, x: number, y: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - size); ctx.quadraticCurveTo(x + size * 0.2, y - size * 0.2, x + size, y);
  ctx.quadraticCurveTo(x + size * 0.2, y + size * 0.2, x, y + size);
  ctx.quadraticCurveTo(x - size * 0.2, y + size * 0.2, x - size, y);
  ctx.quadraticCurveTo(x - size * 0.2, y - size * 0.2, x, y - size); ctx.stroke();
}
function drawIntro(ctx: Context, time: number, colors: VideoColors): void {
  ctx.fillStyle = colors.introBackground; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.save(); ctx.strokeStyle = '#fd8ba854'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  sparkle(ctx, 958, 421, 35 + Math.sin(time * 1.8) * 3);
  sparkle(ctx, 92, 838, 26);
  sparkle(ctx, 113, 410, 12);
  ctx.beginPath(); ctx.moveTo(87, 375); ctx.quadraticCurveTo(45, 389, 49, 420); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(972, 855); ctx.quadraticCurveTo(1014, 868, 1006, 903); ctx.stroke();
  ctx.restore();
}

function roundedRect(ctx: Context, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}

function drawPicture(ctx: Context, asset: RasterAsset, crop: CropConfig, pose: PfpPose, frame = true): void {
  if (pose.opacity <= 0 || asset.width <= 0 || asset.height <= 0) return;
  const size = pose.size;
  const contain = crop.framing === 'contain';
  const fitScale = (contain ? Math.min : Math.max)(size / asset.width, size / asset.height);
  const width = contain ? asset.width * fitScale : size;
  const height = contain ? asset.height * fitScale : size;
  const padding = frame ? Math.max(6, size * 0.02) : 0;
  ctx.save();
  ctx.translate(pose.x, pose.y); ctx.rotate(pose.rotation * Math.PI / 180);
  ctx.globalAlpha *= pose.opacity;
  if (frame) {
    ctx.shadowColor = '#10042352'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#fffafd';
    if (crop.framing === 'circle') { ctx.beginPath(); ctx.arc(0, 0, size / 2 + padding, 0, TAU); }
    else roundedRect(ctx, -width / 2 - padding, -height / 2 - padding, width + padding * 2, height + padding * 2, size * 0.035);
    ctx.fill(); ctx.shadowColor = 'transparent';
  }
  if (crop.framing === 'circle') { ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, TAU); }
  else roundedRect(ctx, -width / 2, -height / 2, width, height, frame ? size * 0.02 : 0);
  ctx.clip();
  const drawWidth = asset.width * fitScale * crop.zoom, drawHeight = asset.height * fitScale * crop.zoom;
  // x/y range -1…1 traverses exactly the available cropped image area.
  const offsetX = crop.x * Math.max(0, drawWidth - width) / 2;
  const offsetY = crop.y * Math.max(0, drawHeight - height) / 2;
  ctx.drawImage(asset.image, -drawWidth / 2 + offsetX, -drawHeight / 2 + offsetY, drawWidth, drawHeight);
  ctx.restore();
}

function drawFlag(ctx: Context, flag: RasterAsset, time: number, config: VideoConfig, lead: PfpPose): void {
  if (!flag.width || !flag.height) return;
  flag = rasterFlag(flag);
  const entrance = smoothstep(time / 0.25);
  const left = 26;
  const right = lead.x - lead.size * 0.22;
  const width = Math.max(140, right - left);
  const height = Math.min(285, 184 * config.flagScale, width * flag.height / flag.width);
  const centerY = lead.y + 10;
  const phaseTime = time * TAU / 1.1 * config.flightSpeed;
  const naturalWidth = Math.min(width, height * flag.width / flag.height);
  const step = 4;
  ctx.save();
  ctx.globalAlpha = entrance;
  // Preserve the complete source's aspect ratio. Extend its fly edge to make a
  // long banner; symbols and chevrons are never repeated, mirrored or stretched.
  for (let x = 0; x < width; x += step) {
    const sliceWidth = Math.min(step, width - x);
    const free = 1 - x / width, phase = x / width * Math.PI * 3.6;
    const amplitude = (5 + free * 24) * config.bobAmount;
    const wave = Math.sin(phaseTime + phase) * amplitude + Math.sin(phaseTime * 2 + phase * 0.7) * amplitude * 0.12;
    const stretch = 1 + Math.cos(phaseTime + phase) * 0.035;
    const sx = Math.min(flag.width - 1, x / naturalWidth * flag.width);
    const sw = Math.max(0.5, Math.min(flag.width - sx, sliceWidth / naturalWidth * flag.width));
    const dy = centerY - height * stretch / 2 + wave;
    ctx.drawImage(flag.image, sx, 0, sw, flag.height, left + x, dy, sliceWidth + 0.65, height * stretch);
    // Soft cloth shading follows the same wave as the source image slices.
    const shade = Math.sin(phaseTime + phase + 0.6);
    ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade * 0.09})` : `rgba(24,5,55,${-shade * 0.13})`;
    ctx.fillRect(left + x, dy, sliceWidth + 0.4, height * stretch);
  }
  ctx.restore();
}

interface CaptionLine { words: string[]; start: number }
function captionLines(ctx: Context, caption: CaptionState, size: number, maxWidth: number): CaptionLine[] {
  const words = caption.fullText.trim().split(/\s+/u).filter(Boolean);
  const normalized = caption.fullText.toLowerCase().replace(/[’']/gu, '');
  const prescribed = caption.key === 'intro' && normalized === 'but we made it out somehow' ? [2, 3, 1]
    : caption.key === 'together' && normalized === 'take a look at us right now' ? [3, 2, 2]
      : caption.key === 'ending' && normalized === 'theres nowhere where id rather be' ? [2, 4] : null;
  if (prescribed) {
    let start = 0;
    return prescribed.map((length) => { const line = { words: words.slice(start, start + length), start }; start += length; return line; });
  }
  ctx.font = `700 ${size}px "Comic Neue", "Comic Sans MS", cursive`;
  const lines: CaptionLine[] = [];
  let line: string[] = [], start = 0;
  for (let i = 0; i < words.length; i++) {
    if (line.length && ctx.measureText([...line, words[i]].join(' ')).width > maxWidth) {
      lines.push({ words: line, start }); start = i; line = [];
    }
    line.push(words[i]);
  }
  if (line.length) lines.push({ words: line, start });
  return lines;
}

function drawCaptions(ctx: Context, caption: CaptionState, config: VideoConfig): void {
  if (!caption.fullText.trim()) return;
  ctx.save();
  let fontSize = (caption.intro ? 102 : caption.fullText.length < 23 ? 76 : 68) * config.captionScale;
  let lines = captionLines(ctx, caption, fontSize, 945);
  // Fit long custom captions into a safe title region without losing words.
  while (lines.length > (caption.intro ? 3 : 2) && fontSize > 25) { fontSize *= 0.93; lines = captionLines(ctx, caption, fontSize, 945); }
  for (const line of lines) {
    ctx.font = `700 ${fontSize}px "Comic Neue", "Comic Sans MS", cursive`;
    const measured = ctx.measureText(line.words.join(' ')).width;
    if (measured > 950) fontSize *= 950 / measured;
  }
  const lineHeight = fontSize * (caption.intro ? 1.04 : 1.07);
  const firstY = caption.intro ? 136 : (lines.length > 1 ? 902 - Math.max(0, lines.length - 2) * lineHeight : 935);
  const pop = 1 + 0.023 * Math.exp(-caption.sinceReveal * 17);
  ctx.translate(SIZE / 2, firstY); ctx.scale(pop, pop);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], visible = line.words.slice(0, Math.max(0, caption.wordCount - line.start));
    if (!visible.length) continue;
    ctx.font = `700 ${fontSize}px "Comic Neue", "Comic Sans MS", cursive`;
    const y = i * lineHeight;
    ctx.lineWidth = caption.intro ? 2 : 7;
    ctx.strokeStyle = caption.intro ? config.colors.introBackground : config.colors.captionOutline;
    ctx.fillStyle = caption.intro ? (i === 2 ? config.colors.introCaptionAccent : config.colors.introCaptionFill) : config.colors.captionFill;
    if (!caption.intro) { ctx.shadowColor = '#10062477'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3; }
    ctx.strokeText(visible.join(' '), 0, y);
    ctx.shadowColor = 'transparent'; ctx.fillText(visible.join(' '), 0, y);
  }
  ctx.restore();
}

/** Shared by the scrubber, audio-clock preview, and exact-frame export workers. */
export function renderFrame(ctx: Context, timeSeconds: number, config: VideoConfig, assets: LoadedAssets): void {
  const timeline = getTimeline(timeSeconds, config);
  const { time, launchTime, echoTime, duration } = timeline;
  ctx.save();
  ctx.setTransform(ctx.canvas.width / SIZE, 0, 0, ctx.canvas.height / SIZE, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (time < launchTime) drawIntro(ctx, time, config.colors);
  else drawGalaxy(ctx, timeline.flightTime, config);

  if (time >= echoTime && config.showEchoes) {
    const progress = clamp((time - echoTime) / Math.max(0.2, duration - echoTime));
    const fade = smoothstep((time - echoTime) / 0.7);
    for (const index of [0, 1] as const) {
      drawPicture(ctx, assets.pfps[index], config.crops[index], {
        x: index === 0 ? mix(265, 320, progress) : mix(825, 745, progress),
        y: mix(540, 450, progress), size: mix(570, 880, smoothstep(progress)),
        rotation: index === 0 ? mix(-15, 5, progress) : mix(12, -4, progress),
        opacity: fade * mix(0.20, 0.25, progress),
      }, false);
    }
  }
  const first = getPfpPose(0, time, config), second = getPfpPose(1, time, config);
  if (time >= launchTime) drawFlag(ctx, assets.flag, timeline.flightTime, config, first);
  drawPicture(ctx, assets.pfps[0], config.crops[0], first);
  drawPicture(ctx, assets.pfps[1], config.crops[1], second);
  drawCaptions(ctx, getCaption(time, config), config);

  const flash = time < launchTime ? clamp((time - launchTime + 0.10) / 0.10) : 1 - clamp((time - launchTime) / 0.16);
  if (flash > 0) { ctx.fillStyle = `rgba(251,242,255,${flash * 0.84})`; ctx.fillRect(0, 0, SIZE, SIZE); }
  ctx.restore();
}
