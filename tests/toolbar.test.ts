import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Toolbar } from '../src/ui/toolbar';

function makeToolbar(overrides: Partial<ConstructorParameters<typeof Toolbar>[0]> = {}) {
  const onPlayPause = vi.fn();
  const onMuteToggle = vi.fn();
  const onVolumeChange = vi.fn();
  const onSeek = vi.fn();
  const onSpeedChange = vi.fn();
  const onQualityChange = vi.fn();
  const onLoopToggle = vi.fn();
  const onFullscreen = vi.fn();
  const toolbar = new Toolbar({
    fullscreenButton: true,
    speedButton: true,
    qualityButton: true,
    onPlayPause,
    onMuteToggle,
    onVolumeChange,
    onSeek,
    onSpeedChange,
    onQualityChange,
    onLoopToggle,
    onFullscreen,
    ...overrides,
  });
  document.body.appendChild(toolbar.element);
  return { toolbar, onPlayPause, onSpeedChange, onQualityChange, onLoopToggle };
}

describe('Toolbar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the expected button tree', () => {
    const { toolbar } = makeToolbar();
    expect(toolbar.element.querySelector('.ci-360-video-controls-play-btn')).not.toBeNull();
    expect(toolbar.element.querySelector('.ci-360-video-controls-volume-btn')).not.toBeNull();
    expect(toolbar.element.querySelector('.ci-360-video-controls-volume-slider')).not.toBeNull();
    expect(toolbar.element.querySelector('.ci-360-video-controls-speed-btn')).not.toBeNull();
    expect(toolbar.element.querySelector('.ci-360-video-controls-quality-btn')).not.toBeNull();
    expect(toolbar.element.querySelector('.ci-360-video-controls-loop-btn')).not.toBeNull();
    expect(toolbar.element.querySelector('.ci-360-video-controls-fullscreen-btn')).not.toBeNull();
  });

  it('speed dropdown opens on button click and fires onSpeedChange with the picked rate', () => {
    const { toolbar, onSpeedChange } = makeToolbar();
    const btn = toolbar.element.querySelector<HTMLButtonElement>(
      '.ci-360-video-controls-speed-btn',
    )!;
    btn.click();
    // Dropdown is the sibling of the button inside the wrapper.
    const dropdown = toolbar.element.querySelector('.ci-360-video-dropdown')!;
    expect(dropdown.classList.contains('ci-360-video-dropdown--open')).toBe(true);

    const item150 = dropdown.querySelector<HTMLButtonElement>('[data-id="1.5"]')!;
    expect(item150).not.toBeNull();
    item150.click();
    expect(onSpeedChange).toHaveBeenCalledWith(1.5);
    expect(btn.textContent).toBe('1.5x'); // ASCII 'x', matching @cloudimage/video-hotspot
    expect(dropdown.classList.contains('ci-360-video-dropdown--open')).toBe(false);
  });

  it('setBuffered repaints the buffered underlay between timeupdate events', () => {
    // Regression: setBuffered only stored the value and waited for the next
    // setTime() to repaint, so the buffered bar lagged while paused/buffering
    // (progress events fire independently of timeupdate).
    const { toolbar } = makeToolbar();
    toolbar.setTime(10, 100); // establishes duration; buffered still 0
    toolbar.setBuffered(50);
    const buffered = toolbar.element.querySelector<HTMLElement>(
      '.ci-360-video-progress-buffered',
    )!;
    expect(buffered.style.width).toBe('50%');
  });

  it('quality pill is hidden until real levels arrive (no fake preset)', () => {
    const { toolbar } = makeToolbar();
    const wrapper = toolbar.element.querySelector<HTMLElement>(
      '.ci-360-video-controls-quality',
    )!;
    // Nothing known yet → no misleading switcher.
    expect(wrapper.style.display).toBe('none');
  });

  it('adapter-reported levels populate the dropdown', () => {
    const { toolbar } = makeToolbar();
    toolbar.setQualities([
      { id: 0, label: '1080p', height: 1080 },
      { id: 1, label: '720p', height: 720 },
    ]);
    const items = toolbar.element.querySelectorAll<HTMLElement>(
      '.ci-360-video-controls-quality .ci-360-video-dropdown-item',
    );
    const ids = Array.from(items).map((i) => i.dataset.id);
    // Adapter list is exactly Auto + the two reported levels — no presets.
    expect(ids).toEqual(['auto', '0', '1']);
  });

  it('orders adapter levels highest-quality first, preserving ids', () => {
    const { toolbar } = makeToolbar();
    // Feed ascending (the order hls.js reports) — menu must come out descending.
    toolbar.setQualities([
      { id: 0, label: '240p', height: 240 },
      { id: 1, label: '720p', height: 720 },
      { id: 2, label: '1080p', height: 1080 },
    ]);
    const rows = Array.from(
      toolbar.element.querySelectorAll<HTMLElement>(
        '.ci-360-video-controls-quality .ci-360-video-dropdown-item',
      ),
    ).map((i) => [i.dataset.id, i.textContent]);
    expect(rows).toEqual([
      ['auto', 'Auto'],
      ['2', '1080p'],
      ['1', '720p'],
      ['0', '240p'],
    ]);
  });

  it('a single rendition shows a disabled pill (no switching possible)', () => {
    const { toolbar } = makeToolbar();
    toolbar.setQualities([{ id: 0, label: '1080p', height: 1080 }]);
    const wrapper = toolbar.element.querySelector<HTMLElement>(
      '.ci-360-video-controls-quality',
    )!;
    const btn = toolbar.element.querySelector<HTMLButtonElement>(
      '.ci-360-video-controls-quality-btn',
    )!;
    expect(wrapper.style.display).not.toBe('none'); // shown...
    expect(btn.disabled).toBe(true); // ...but inert
    expect(btn.classList.contains('ci-360-video-pill-btn--disabled')).toBe(true);
    expect(btn.textContent).toBe('1080p'); // shows the single quality
  });

  it('clearing levels hides the pill entirely', () => {
    const { toolbar } = makeToolbar();
    toolbar.setQualities([
      { id: 0, label: '1080p', height: 1080 },
      { id: 1, label: '720p', height: 720 },
    ]);
    toolbar.setQualities([]); // adapter now reports nothing
    const wrapper = toolbar.element.querySelector<HTMLElement>(
      '.ci-360-video-controls-quality',
    )!;
    expect(wrapper.style.display).toBe('none');
  });

  it('quality dropdown emits the selected id; "auto" is preserved as string', () => {
    const { toolbar, onQualityChange } = makeToolbar();
    toolbar.setQualities([
      { id: 0, label: '1080p', height: 1080 },
      { id: 1, label: '720p', height: 720 },
    ]);
    const btn = toolbar.element.querySelector<HTMLButtonElement>(
      '.ci-360-video-controls-quality-btn',
    )!;
    btn.click();
    const dropdown = toolbar.element.querySelectorAll('.ci-360-video-dropdown')[1]!;
    dropdown.querySelector<HTMLButtonElement>('[data-id="0"]')!.click();
    expect(onQualityChange).toHaveBeenCalledWith(0);
    expect(btn.textContent).toBe('1080p');
    // Reopen and pick "Auto"
    btn.click();
    dropdown.querySelector<HTMLButtonElement>('[data-id="auto"]')!.click();
    expect(onQualityChange).toHaveBeenLastCalledWith('auto');
    expect(btn.textContent).toBe('Auto');
  });

  it('opening one dropdown closes the other', () => {
    const { toolbar } = makeToolbar();
    // ≥2 levels so the quality pill is interactive.
    toolbar.setQualities([
      { id: 0, label: '1080p', height: 1080 },
      { id: 1, label: '720p', height: 720 },
    ]);
    const speedBtn = toolbar.element.querySelector<HTMLButtonElement>(
      '.ci-360-video-controls-speed-btn',
    )!;
    const qualityBtn = toolbar.element.querySelector<HTMLButtonElement>(
      '.ci-360-video-controls-quality-btn',
    )!;
    const [speedDd, qualityDd] = toolbar.element.querySelectorAll(
      '.ci-360-video-dropdown',
    );
    speedBtn.click();
    expect(speedDd.classList.contains('ci-360-video-dropdown--open')).toBe(true);
    qualityBtn.click();
    expect(speedDd.classList.contains('ci-360-video-dropdown--open')).toBe(false);
    expect(qualityDd.classList.contains('ci-360-video-dropdown--open')).toBe(true);
  });

  it('setGpuWarning(msg) shows the warning chip with the message', () => {
    const { toolbar } = makeToolbar();
    const chip = toolbar.element.querySelector<HTMLElement>(
      '.ci-360-video-controls-gpu-warning',
    )!;
    expect(chip.classList.contains('ci-360-video-controls-gpu-warning--visible')).toBe(false);
    toolbar.setGpuWarning('Resolution too high');
    expect(chip.classList.contains('ci-360-video-controls-gpu-warning--visible')).toBe(true);
    expect(chip.getAttribute('aria-label')).toBe('Resolution too high');
    toolbar.setGpuWarning(null);
    expect(chip.classList.contains('ci-360-video-controls-gpu-warning--visible')).toBe(false);
  });

  it('setLoop toggles the active class and aria-pressed on the loop button', () => {
    const { toolbar } = makeToolbar();
    const loopBtn = toolbar.element.querySelector<HTMLElement>(
      '.ci-360-video-controls-loop-btn',
    )!;
    toolbar.setLoop(true);
    expect(loopBtn.classList.contains('ci-360-video-controls-loop-btn--active')).toBe(true);
    expect(loopBtn.getAttribute('aria-pressed')).toBe('true');
    toolbar.setLoop(false);
    expect(loopBtn.classList.contains('ci-360-video-controls-loop-btn--active')).toBe(false);
  });

  it('show()/hide() flip the --hidden class', () => {
    const { toolbar } = makeToolbar();
    toolbar.hide();
    expect(toolbar.element.classList.contains('ci-360-video-controls--hidden')).toBe(true);
    toolbar.show();
    expect(toolbar.element.classList.contains('ci-360-video-controls--hidden')).toBe(false);
  });

  it('startIdleTimer schedules a hide after the delay', async () => {
    vi.useFakeTimers();
    const { toolbar } = makeToolbar();
    toolbar.show();
    toolbar.startIdleTimer(100);
    expect(toolbar.element.classList.contains('ci-360-video-controls--hidden')).toBe(false);
    vi.advanceTimersByTime(101);
    expect(toolbar.element.classList.contains('ci-360-video-controls--hidden')).toBe(true);
    vi.useRealTimers();
    toolbar.destroy();
  });

  it('destroy removes the element and cancels the idle timer', () => {
    vi.useFakeTimers();
    const { toolbar } = makeToolbar();
    document.body.appendChild(toolbar.element);
    toolbar.startIdleTimer(100);
    toolbar.destroy();
    expect(document.body.contains(toolbar.element)).toBe(false);
    // Advance timers — should not crash because the timer was cleared.
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    vi.useRealTimers();
  });

  // ---- manual stereo-format picker ----

  it('no stereo menu is built when stereoMenu is falsy (the default)', () => {
    const { toolbar } = makeToolbar();
    expect(toolbar.element.querySelector('.ci-360-video-controls-stereo')).toBeNull();
  });

  it('stereoMenu:true builds the picker with Mono / Top-Bottom / Side-by-Side', () => {
    const { toolbar } = makeToolbar({ stereoMenu: true });
    const items = toolbar.element.querySelectorAll<HTMLElement>(
      '.ci-360-video-controls-stereo .ci-360-video-dropdown-item',
    );
    expect(Array.from(items).map((i) => i.dataset.id)).toEqual([
      'mono',
      'top-bottom',
      'side-by-side',
    ]);
  });

  it('picking a format fires onStereoChange with the concrete layout', () => {
    const onStereoChange = vi.fn();
    const { toolbar } = makeToolbar({ stereoMenu: true, onStereoChange });
    const btn = toolbar.element.querySelector<HTMLButtonElement>(
      '.ci-360-video-controls-stereo-btn',
    )!;
    btn.click();
    const dropdown = toolbar.element.querySelector('.ci-360-video-controls-stereo .ci-360-video-dropdown')!;
    expect(dropdown.classList.contains('ci-360-video-dropdown--open')).toBe(true);
    dropdown.querySelector<HTMLButtonElement>('[data-id="top-bottom"]')!.click();
    expect(onStereoChange).toHaveBeenCalledWith('top-bottom');
    expect(dropdown.classList.contains('ci-360-video-dropdown--open')).toBe(false);
  });

  it("stereoMenu:'auto' starts hidden and is revealed by setStereoMenuVisible(true)", () => {
    const { toolbar } = makeToolbar({ stereoMenu: 'auto' });
    const wrapper = toolbar.element.querySelector<HTMLElement>(
      '.ci-360-video-controls-stereo',
    )!;
    expect(wrapper.style.display).toBe('none');
    toolbar.setStereoMenuVisible(true);
    expect(wrapper.style.display).not.toBe('none');
    toolbar.setStereoMenuVisible(false);
    expect(wrapper.style.display).toBe('none');
  });

  it('setStereoLayout highlights the matching row', () => {
    const { toolbar } = makeToolbar({ stereoMenu: true });
    toolbar.setStereoLayout('side-by-side');
    const active = toolbar.element.querySelector<HTMLElement>(
      '.ci-360-video-controls-stereo .ci-360-video-dropdown-item--active',
    )!;
    expect(active.dataset.id).toBe('side-by-side');
  });
});
