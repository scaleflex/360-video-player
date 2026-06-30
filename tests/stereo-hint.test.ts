import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Make the metadata probe deterministic: "no Spherical metadata found".
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

/** Stamp dimensions onto the mounted <video> and fire `loadedmetadata`. */
function loadWithDims(container: HTMLElement, w: number, h: number): void {
  const video = container.querySelector('video') as HTMLVideoElement;
  Object.defineProperty(video, 'videoWidth', { value: w, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: h, configurable: true });
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
  video.dispatchEvent(new Event('loadedmetadata'));
}

function hintCalls(spy: ReturnType<typeof vi.spyOn>): unknown[][] {
  return spy.mock.calls.filter(
    (args) => typeof args[0] === 'string' && args[0].includes('could be stereoscopic'),
  );
}

describe('ambiguous-stereo dev hint', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('warns once on a 1:1 frame with no metadata (auto → mono), naming top-bottom', async () => {
    const container = makeContainer();
    const p = new CI360Video(container, { src: 'old.mp4' });
    await flushAsync();
    loadWithDims(container, 4096, 4096);
    await flushAsync();

    const calls = hintCalls(warn);
    expect(calls.length).toBe(1);
    expect(String(calls[0][0])).toContain('top-bottom');
    p.destroy();
  });

  it('does NOT warn on a normal 2:1 panorama', async () => {
    const container = makeContainer();
    const p = new CI360Video(container, { src: 'pano.mp4' });
    await flushAsync();
    loadWithDims(container, 4096, 2048);
    await flushAsync();

    expect(hintCalls(warn).length).toBe(0);
    p.destroy();
  });

  it('does NOT warn when an explicit stereo layout is set (choice already made)', async () => {
    const container = makeContainer();
    const p = new CI360Video(container, { src: 'old.mp4', stereo: 'mono' });
    await flushAsync();
    loadWithDims(container, 4096, 4096);
    await flushAsync();

    expect(hintCalls(warn).length).toBe(0);
    p.destroy();
  });

  it('names side-by-side for a 4:1 frame', async () => {
    const container = makeContainer();
    const p = new CI360Video(container, { src: 'old.mp4' });
    await flushAsync();
    loadWithDims(container, 8192, 2048);
    await flushAsync();

    const calls = hintCalls(warn);
    expect(calls.length).toBe(1);
    expect(String(calls[0][0])).toContain('side-by-side');
    p.destroy();
  });

  it("stereoMenu:'auto' reveals the picker on an ambiguous source, stays hidden on a normal one", async () => {
    const ambiguous = makeContainer();
    const pa = new CI360Video(ambiguous, { src: 'old.mp4' });
    await flushAsync();
    loadWithDims(ambiguous, 4096, 4096); // 1:1 → relevant
    await flushAsync();
    const wrapperA = ambiguous.querySelector<HTMLElement>('.ci-360-video-controls-stereo')!;
    expect(wrapperA).not.toBeNull();
    expect(wrapperA.style.display).not.toBe('none');
    pa.destroy();

    const normal = makeContainer();
    const pn = new CI360Video(normal, { src: 'pano.mp4' });
    await flushAsync();
    loadWithDims(normal, 4096, 2048); // 2:1 → not relevant
    await flushAsync();
    const wrapperN = normal.querySelector<HTMLElement>('.ci-360-video-controls-stereo')!;
    expect(wrapperN.style.display).toBe('none');
    pn.destroy();
  });

  it('a manual format pick switches the player to that explicit layout (and stops nagging)', async () => {
    const container = makeContainer();
    const p = new CI360Video(container, { src: 'old.mp4' });
    await flushAsync();
    loadWithDims(container, 4096, 4096);
    await flushAsync();

    const btn = container.querySelector<HTMLButtonElement>('.ci-360-video-controls-stereo-btn')!;
    btn.click();
    const dropdown = container.querySelector('.ci-360-video-controls-stereo .ci-360-video-dropdown')!;
    dropdown.querySelector<HTMLButtonElement>('[data-id="top-bottom"]')!.click();

    // The viewer's choice becomes the explicit config layout.
    expect((p as unknown as { config: { stereo: string } }).config.stereo).toBe('top-bottom');
    p.destroy();
  });
});
