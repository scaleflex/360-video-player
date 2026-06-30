import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression context: a customer's older clips are top-bottom stereo but were
// re-encoded WITHOUT Spherical metadata, so `stereo: 'auto'` can't detect them
// and they play doubled-up. Force the probe to "no metadata found" to reproduce
// exactly that situation, then verify the two fixes crop to a single eye.
vi.mock('../src/player/spherical-metadata', () => ({
  detectStereoLayout: vi.fn(async () => null),
  parseStereoModeFromMoov: vi.fn(() => null),
}));

import { CI360Video } from '../src/core/ci-360-video';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(el);
  return el;
}

async function flushAsync(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

function loadWithDims(container: HTMLElement, w: number, h: number): void {
  const video = container.querySelector('video') as HTMLVideoElement;
  Object.defineProperty(video, 'videoWidth', { value: w, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: h, configurable: true });
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
  video.dispatchEvent(new Event('loadedmetadata'));
}

/** The UV sampling window of the live video texture on the sphere material. */
function uv(p: CI360Video): { ox: number; oy: number; rx: number; ry: number } {
  const mat = p.getThreeObjects()!.mesh!.material as unknown as {
    map: { offset: { x: number; y: number }; repeat: { x: number; y: number } };
  };
  return { ox: mat.map.offset.x, oy: mat.map.offset.y, rx: mat.map.repeat.x, ry: mat.map.repeat.y };
}

describe('stereo regression — metadata-less top-bottom source', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('baseline: with no metadata and no override it plays mono (the reported bug) — full frame', async () => {
    const container = makeContainer();
    const p = new CI360Video(container, { src: 'old-tb.mp4' });
    await flushAsync();
    loadWithDims(container, 4096, 4096);
    await flushAsync();
    // Un-cropped full frame = the doubled-up image the customer saw.
    expect(uv(p)).toEqual({ ox: 0, oy: 0, rx: 1, ry: 1 });
    p.destroy();
  });

  it('explicit stereo:"top-bottom" crops to the top (left-eye) half despite missing metadata', async () => {
    const container = makeContainer();
    const p = new CI360Video(container, { src: 'old-tb.mp4', stereo: 'top-bottom' });
    await flushAsync();
    loadWithDims(container, 4096, 4096);
    await flushAsync();
    // Top half: offset.y = 0.5, repeat.y = 0.5 — a single correct image.
    const { oy, ry } = uv(p);
    expect(oy).toBe(0.5);
    expect(ry).toBe(0.5);
    p.destroy();
  });

  it('a viewer picking Top-Bottom in the format menu fixes a metadata-less source live', async () => {
    const container = makeContainer();
    const p = new CI360Video(container, { src: 'old-tb.mp4' });
    await flushAsync();
    loadWithDims(container, 4096, 4096);
    await flushAsync();

    // Starts doubled-up (mono)…
    expect(uv(p).ry).toBe(1);

    // …viewer opens the toolbar format picker and chooses Top-Bottom.
    container.querySelector<HTMLButtonElement>('.ci-360-video-controls-stereo-btn')!.click();
    container
      .querySelector<HTMLButtonElement>(
        '.ci-360-video-controls-stereo .ci-360-video-dropdown [data-id="top-bottom"]',
      )!
      .click();

    const { oy, ry } = uv(p);
    expect(oy).toBe(0.5);
    expect(ry).toBe(0.5);
    p.destroy();
  });
});
