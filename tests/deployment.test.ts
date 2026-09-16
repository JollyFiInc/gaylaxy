import { describe, expect, it } from 'vitest';
import { deploymentBase } from '../scripts/deployment-base';

describe('GitHub Pages deployment base', () => {
  it.each([undefined, '', ' ', '/', '///'])('uses the root for %j', (value) => {
    expect(deploymentBase(value)).toBe('/');
  });

  it.each(['gaylaxy-maker', '/gaylaxy-maker', 'gaylaxy-maker/', '/gaylaxy-maker/'])('normalizes project path %j', (value) => {
    const base = deploymentBase(value);
    expect(base).toBe('/gaylaxy-maker/');
    // A worker in /assets/ must still request the site's public encoder and font files.
    const workerUrl = 'https://example.github.io/gaylaxy-maker/assets/encoder-worker.js';
    expect(new URL(`${base}encoder/ffmpeg-core.wasm`, workerUrl).href)
      .toBe('https://example.github.io/gaylaxy-maker/encoder/ffmpeg-core.wasm');
    expect(new URL(`${base}fonts/ComicNeue-Bold.ttf`, workerUrl).pathname)
      .toBe('/gaylaxy-maker/fonts/ComicNeue-Bold.ttf');
  });

  it('supports a root custom domain and nested static hosting', () => {
    expect(new URL(`${deploymentBase('')}flags/sapphic.svg`, 'https://example.com/assets/worker.js').href)
      .toBe('https://example.com/flags/sapphic.svg');
    expect(deploymentBase('/projects//gaylaxy/')).toBe('/projects/gaylaxy/');
  });

  it.each(['https://example.com/', '//example.com/path', './', '/repo/../', '/repo?x=1', '/repo#x', '/repo\\path', '/my repo/'])('rejects a misleading or non-path base %j', (value) => {
    expect(() => deploymentBase(value)).toThrow(/VITE_BASE_PATH/);
  });
});
