import { addClass, createElement, removeClass } from '../utils/dom';
import { addListener } from '../utils/events';
import { formatTime } from '../utils/time';
import type { QualityId, QualityLevel, StereoLayout, StereoMenuOption } from '../core/types';
import { createProgressBar, type ProgressBar } from './progress-bar';
import { createDropdown, type DropdownHandle } from './dropdown';

// ---- Lucide-style SVG icons (copied verbatim from @cloudimage/video-hotspot for 1:1 visual) ----
const PLAY_SVG =
  // Triangle nudged right of geometric centre for optical balance (a wide-based,
  // pointy play glyph reads as off-centre-left when bbox-centred).
  '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="7,3 21,12 7,21"/></svg>';
const PAUSE_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
const VOLUME_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const VOLUME_MUTE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
const FULLSCREEN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>';
const FULLSCREEN_EXIT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/></svg>';
const REPEAT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
// VR + warning icons — not in video-hotspot's set, kept local for our use.
const VR_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 8 h20 a1 1 0 0 1 1 1 v6 a1 1 0 0 1 -1 1 h-6 l-3 -3 h-2 l-3 3 H2 a1 1 0 0 1 -1 -1 v-6 a1 1 0 0 1 1 -1 z"/></svg>';
const WARNING_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
// "Layers" glyph — reads as stacked eye-images, i.e. the source format.
const STEREO_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Manual format-picker entries. Ids are the concrete {@link StereoLayout}
 *  values so a selection maps straight onto `stereo`. */
const STEREO_ITEMS: ReadonlyArray<{ id: StereoLayout; label: string }> = [
  { id: 'mono', label: 'Mono' },
  { id: 'top-bottom', label: 'Top-Bottom' },
  { id: 'side-by-side', label: 'Side-by-Side' },
];


export interface ToolbarOptions {
  /** Show the fullscreen button. */
  fullscreenButton?: boolean;
  /** Show the VR button. Toggles the on-screen split-screen ("cardboard")
   *  stereo view via `onEnterVR`. */
  vrButton?: boolean;
  /** Show the playback-speed pill button + dropdown. */
  speedButton?: boolean;
  /** Show the quality pill button (auto-hidden when no levels available). */
  qualityButton?: boolean;
  /** Manual stereo-format picker visibility: `false` never builds it, `true`
   *  always shows it, `'auto'` builds it hidden until the player deems it
   *  relevant via `setStereoMenuVisible()`. */
  stereoMenu?: StereoMenuOption;

  // ---- interaction callbacks ----
  onPlayPause: () => void;
  onMuteToggle: () => void;
  onVolumeChange: (v: number) => void;
  onSeek: (time: number) => void;
  onSpeedChange: (rate: number) => void;
  onQualityChange?: (id: QualityId) => void;
  onStereoChange?: (layout: StereoLayout) => void;
  onLoopToggle?: () => void;
  onFullscreen?: () => void;
  onEnterVR?: () => void;
}

export class Toolbar {
  readonly element: HTMLElement;
  readonly progressBar: ProgressBar;

  private readonly opts: ToolbarOptions;
  private readonly playBtn: HTMLButtonElement;
  private readonly volumeBtn: HTMLButtonElement;
  private readonly volumeSlider: HTMLInputElement;
  private readonly timeDisplay: HTMLElement;
  private readonly gpuWarning: HTMLElement;
  private readonly loopBtn: HTMLButtonElement | null;
  private readonly speedBtn: HTMLButtonElement | null;
  private readonly speedDropdown: DropdownHandle | null;
  private readonly qualityBtn: HTMLButtonElement | null;
  private readonly qualityDropdown: DropdownHandle | null;
  private readonly stereoBtn: HTMLButtonElement | null;
  private readonly stereoDropdown: DropdownHandle | null;
  private readonly stereoWrapper: HTMLElement | null;
  private readonly fsBtn: HTMLButtonElement | null;
  private readonly vrBtn: HTMLButtonElement | null;

  private cleanups: Array<() => void> = [];
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Display-side speed kept until adapter reflects the change in `setSpeed()`. */
  private pendingSpeed: number | null = null;
  private currentQualityId: QualityId = 'auto';
  private qualities: QualityLevel[] = [];
  /** True only when ≥2 renditions exist — i.e. switching is actually possible.
   *  When false the quality pill is shown disabled (1 rendition) or hidden (0). */
  private qualitySelectable = false;

  constructor(options: ToolbarOptions) {
    this.opts = options;
    this.element = createElement('div', 'ci-360-video-controls');

    // Progress bar
    // onScrub === onSeek so the video follows the handle live while dragging,
    // not only on release.
    this.progressBar = createProgressBar({ onSeek: options.onSeek, onScrub: options.onSeek });
    this.element.appendChild(this.progressBar.element);

    // Row container
    const row = createElement('div', 'ci-360-video-controls-row');
    const left = createElement('div', 'ci-360-video-controls-left');
    const right = createElement('div', 'ci-360-video-controls-right');

    // --- Left group: play / volume / time ---
    this.playBtn = createElement('button', 'ci-360-video-controls-play-btn', {
      type: 'button',
      'aria-label': 'Play',
    });
    this.playBtn.innerHTML = PLAY_SVG;
    left.appendChild(this.playBtn);

    const volumeGroup = createElement('div', 'ci-360-video-controls-volume');
    this.volumeBtn = createElement('button', 'ci-360-video-controls-volume-btn', {
      type: 'button',
      'aria-label': 'Mute',
    });
    this.volumeBtn.innerHTML = VOLUME_SVG;
    this.volumeSlider = document.createElement('input');
    this.volumeSlider.type = 'range';
    this.volumeSlider.className = 'ci-360-video-controls-volume-slider';
    this.volumeSlider.min = '0';
    this.volumeSlider.max = '1';
    this.volumeSlider.step = '0.05';
    this.volumeSlider.value = '1';
    this.volumeSlider.setAttribute('aria-label', 'Volume');
    volumeGroup.appendChild(this.volumeBtn);
    volumeGroup.appendChild(this.volumeSlider);
    left.appendChild(volumeGroup);

    this.timeDisplay = createElement('span', 'ci-360-video-controls-time');
    this.timeDisplay.textContent = '0:00 / 0:00';
    left.appendChild(this.timeDisplay);

    // --- Right group: warning, speed, quality, loop, vr, fullscreen ---
    this.gpuWarning = createElement('span', 'ci-360-video-controls-gpu-warning', {
      'aria-label': '',
      'aria-hidden': 'true',
      title: '',
    });
    this.gpuWarning.innerHTML = WARNING_SVG;
    right.appendChild(this.gpuWarning);

    if (options.speedButton !== false) {
      const speedWrapper = createElement('div', 'ci-360-video-controls-speed');
      this.speedBtn = createElement('button', 'ci-360-video-controls-speed-btn ci-360-video-pill-btn', {
        type: 'button',
        'aria-label': 'Playback speed',
        'aria-expanded': 'false',
      });
      this.speedBtn.textContent = '1x';
      this.speedDropdown = createDropdown({
        items: SPEEDS.map((s) => ({ id: s, label: `${s}x` })),
        activeId: 1,
        onSelect: (id) => this.handleSpeedSelect(Number(id)),
      });
      speedWrapper.appendChild(this.speedBtn);
      speedWrapper.appendChild(this.speedDropdown.element);
      right.appendChild(speedWrapper);
    } else {
      this.speedBtn = null;
      this.speedDropdown = null;
    }

    if (options.qualityButton !== false && options.onQualityChange) {
      const qualityWrapper = createElement('div', 'ci-360-video-controls-quality');
      this.qualityBtn = createElement(
        'button',
        'ci-360-video-controls-quality-btn ci-360-video-pill-btn',
        { type: 'button', 'aria-label': 'Quality', 'aria-expanded': 'false' },
      );
      this.qualityBtn.textContent = 'Auto';
      this.qualityDropdown = createDropdown({
        items: [],
        activeId: 'auto',
        onSelect: (id) =>
          this.handleQualitySelect(typeof id === 'number' ? id : (id as QualityId)),
      });
      qualityWrapper.appendChild(this.qualityBtn);
      qualityWrapper.appendChild(this.qualityDropdown.element);
      // Hidden until `setQualities()` learns what's actually available. The
      // control only appears (and is only interactive) when there's a real
      // choice — see `setQualities()`.
      qualityWrapper.style.display = 'none';
      right.appendChild(qualityWrapper);
    } else {
      this.qualityBtn = null;
      this.qualityDropdown = null;
    }

    if (options.stereoMenu) {
      this.stereoWrapper = createElement('div', 'ci-360-video-controls-stereo');
      this.stereoBtn = createElement('button', 'ci-360-video-controls-stereo-btn', {
        type: 'button',
        'aria-label': 'Video format',
        'aria-expanded': 'false',
        title: 'Video format (mono / 3D)',
      });
      this.stereoBtn.innerHTML = STEREO_SVG;
      this.stereoDropdown = createDropdown({
        items: STEREO_ITEMS.map((s) => ({ id: s.id, label: s.label })),
        activeId: 'mono',
        vertical: true, // long labels (Top-Bottom / Side-by-Side) stack cleanly
        onSelect: (id) => this.handleStereoSelect(id as StereoLayout),
      });
      this.stereoWrapper.appendChild(this.stereoBtn);
      this.stereoWrapper.appendChild(this.stereoDropdown.element);
      // `'auto'` starts hidden — the player reveals it via setStereoMenuVisible()
      // only when a source is ambiguous or already stereo. `true` shows always.
      if (options.stereoMenu === 'auto') this.stereoWrapper.style.display = 'none';
      right.appendChild(this.stereoWrapper);
    } else {
      this.stereoBtn = null;
      this.stereoDropdown = null;
      this.stereoWrapper = null;
    }

    if (options.onLoopToggle) {
      this.loopBtn = createElement('button', 'ci-360-video-controls-loop-btn', {
        type: 'button',
        'aria-label': 'Toggle loop',
        'aria-pressed': 'false',
      });
      this.loopBtn.innerHTML = REPEAT_SVG;
      right.appendChild(this.loopBtn);
    } else {
      this.loopBtn = null;
    }

    if (options.vrButton) {
      this.vrBtn = createElement('button', 'ci-360-video-controls-vr-btn', {
        type: 'button',
        'aria-label': 'Enter VR view',
        'aria-pressed': 'false',
      });
      this.vrBtn.innerHTML = VR_SVG;
      right.appendChild(this.vrBtn);
    } else {
      this.vrBtn = null;
    }

    if (options.fullscreenButton !== false) {
      this.fsBtn = createElement('button', 'ci-360-video-controls-fullscreen-btn', {
        type: 'button',
        'aria-label': 'Enter fullscreen',
      });
      this.fsBtn.innerHTML = FULLSCREEN_SVG;
      right.appendChild(this.fsBtn);
    } else {
      this.fsBtn = null;
    }

    row.appendChild(left);
    row.appendChild(right);
    this.element.appendChild(row);

    this.bindEvents();
  }

  // ---------------- private ----------------

  private bindEvents(): void {
    this.cleanups.push(
      addListener(this.playBtn, 'click', (e) => {
        e.stopPropagation();
        this.opts.onPlayPause();
      }),
      addListener(this.volumeBtn, 'click', (e) => {
        e.stopPropagation();
        this.opts.onMuteToggle();
      }),
      addListener(this.volumeSlider, 'input', () => {
        const v = parseFloat(this.volumeSlider.value);
        this.updateVolumeFill(v);
        this.opts.onVolumeChange(v);
      }),
    );

    if (this.speedBtn && this.speedDropdown) {
      this.cleanups.push(
        addListener(this.speedBtn, 'click', (e) => {
          e.stopPropagation();
          const wasOpen = this.speedDropdown!.isOpen();
          this.closeAllDropdowns();
          if (!wasOpen) {
            this.speedDropdown!.open();
            this.speedBtn!.setAttribute('aria-expanded', 'true');
          }
        }),
      );
    }

    if (this.qualityBtn && this.qualityDropdown) {
      this.cleanups.push(
        addListener(this.qualityBtn, 'click', (e) => {
          e.stopPropagation();
          const wasOpen = this.qualityDropdown!.isOpen();
          this.closeAllDropdowns();
          if (!wasOpen) {
            this.qualityDropdown!.open();
            this.qualityBtn!.setAttribute('aria-expanded', 'true');
          }
        }),
      );
    }

    if (this.stereoBtn && this.stereoDropdown) {
      this.cleanups.push(
        addListener(this.stereoBtn, 'click', (e) => {
          e.stopPropagation();
          const wasOpen = this.stereoDropdown!.isOpen();
          this.closeAllDropdowns();
          if (!wasOpen) {
            this.stereoDropdown!.open();
            this.stereoBtn!.setAttribute('aria-expanded', 'true');
          }
        }),
      );
    }

    if (this.loopBtn) {
      this.cleanups.push(
        addListener(this.loopBtn, 'click', (e) => {
          e.stopPropagation();
          this.opts.onLoopToggle!();
        }),
      );
    }
    if (this.vrBtn) {
      this.cleanups.push(
        addListener(this.vrBtn, 'click', (e) => {
          e.stopPropagation();
          this.opts.onEnterVR?.();
        }),
      );
    }
    if (this.fsBtn) {
      this.cleanups.push(
        addListener(this.fsBtn, 'click', (e) => {
          e.stopPropagation();
          this.opts.onFullscreen?.();
        }),
      );
    }

    // Click outside closes all dropdowns. Single document listener — cheaper
    // than per-dropdown installations.
    const onDocClick = (): void => this.closeAllDropdowns();
    document.addEventListener('click', onDocClick);
    this.cleanups.push(() => document.removeEventListener('click', onDocClick));
  }

  private closeAllDropdowns(): void {
    if (this.speedDropdown?.isOpen()) {
      this.speedDropdown.close();
      this.speedBtn?.setAttribute('aria-expanded', 'false');
    }
    if (this.qualityDropdown?.isOpen()) {
      this.qualityDropdown.close();
      this.qualityBtn?.setAttribute('aria-expanded', 'false');
    }
    if (this.stereoDropdown?.isOpen()) {
      this.stereoDropdown.close();
      this.stereoBtn?.setAttribute('aria-expanded', 'false');
    }
  }

  private handleStereoSelect(layout: StereoLayout): void {
    this.stereoDropdown?.setActiveId(layout);
    this.opts.onStereoChange?.(layout);
    this.closeAllDropdowns();
  }

  private handleSpeedSelect(rate: number): void {
    this.pendingSpeed = rate;
    if (this.speedBtn) this.speedBtn.textContent = `${rate}x`;
    this.speedDropdown?.setActiveId(rate);
    this.opts.onSpeedChange(rate);
    this.closeAllDropdowns();
  }

  private handleQualitySelect(id: QualityId): void {
    this.currentQualityId = id;
    this.opts.onQualityChange?.(id);
    this.updateQualityLabel();
    this.qualityDropdown?.setActiveId(id);
    this.closeAllDropdowns();
  }

  private updateQualityLabel(): void {
    if (!this.qualityBtn) return;
    // Single/disabled or hidden states own their label via `setQualities()`.
    if (!this.qualitySelectable) return;
    if (this.currentQualityId === 'auto') {
      this.qualityBtn.textContent = 'Auto';
      return;
    }
    const match = this.qualities.find((q) => q.id === this.currentQualityId);
    this.qualityBtn.textContent = match?.label ?? String(this.currentQualityId);
  }

  // ---------------- public state setters ----------------

  setPlaying(playing: boolean): void {
    this.playBtn.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
    this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  setMuted(muted: boolean): void {
    this.volumeBtn.innerHTML = muted ? VOLUME_MUTE_SVG : VOLUME_SVG;
    this.volumeBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  }
  setVolume(v: number): void {
    // Clamp + finite-guard so a stray NaN/out-of-range value can't desync the
    // range thumb from the real volume.
    const safe = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    this.volumeSlider.value = String(safe);
    this.updateVolumeFill(safe);
  }

  /** Paint the slider's left (filled) portion up to the current volume. */
  private updateVolumeFill(v: number): void {
    const pct = Math.max(0, Math.min(1, v)) * 100;
    this.volumeSlider.style.setProperty('--ci-360-video-volume-pct', `${pct}%`);
  }
  setTime(currentTime: number, duration: number): void {
    this.lastTime = currentTime;
    this.lastDuration = duration;
    this.timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    this.progressBar.update(currentTime, duration, this.lastBuffered);
  }
  setBuffered(bufferedEnd: number): void {
    this.lastBuffered = bufferedEnd;
    // Repaint the buffered underlay immediately — `progress` events fire
    // independently of `timeupdate` (e.g. while paused or buffering), so we
    // can't wait for the next setTime() to reflect newly-buffered data.
    this.progressBar.update(this.lastTime, this.lastDuration, this.lastBuffered);
  }
  setSpeed(rate: number): void {
    if (this.speedBtn) this.speedBtn.textContent = `${rate}x`;
    this.speedDropdown?.setActiveId(rate);
    if (this.pendingSpeed !== null && Math.abs(rate - this.pendingSpeed) < 0.001) {
      this.pendingSpeed = null;
    }
  }
  setFullscreen(active: boolean): void {
    if (!this.fsBtn) return;
    this.fsBtn.innerHTML = active ? FULLSCREEN_EXIT_SVG : FULLSCREEN_SVG;
    this.fsBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  }
  setLoop(active: boolean): void {
    if (!this.loopBtn) return;
    if (active) addClass(this.loopBtn, 'ci-360-video-controls-loop-btn--active');
    else removeClass(this.loopBtn, 'ci-360-video-controls-loop-btn--active');
    this.loopBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  /** Reflect whether the split-screen ("cardboard") VR view is active. */
  setVrActive(active: boolean): void {
    if (!this.vrBtn) return;
    if (active) addClass(this.vrBtn, 'ci-360-video-controls-vr-btn--active');
    else removeClass(this.vrBtn, 'ci-360-video-controls-vr-btn--active');
    this.vrBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    this.vrBtn.setAttribute('aria-label', active ? 'Exit VR view' : 'Enter VR view');
  }
  /**
   * Push the level list from the source adapter / sources config and reflect
   * whether switching is actually possible:
   *
   *   - **≥2 renditions** → interactive pill, dropdown `Auto + <levels>`
   *     (highest first; `id` preserved so selection maps to the right level).
   *   - **1 rendition**   → pill shown but **disabled** (greyed, not clickable)
   *     displaying that single quality — there's nothing to switch to.
   *   - **0 renditions**  → pill hidden (the source carries no quality info).
   */
  setQualities(qualities: QualityLevel[]): void {
    this.qualities = qualities.slice();
    if (!this.qualityBtn || !this.qualityDropdown) return;
    const wrapper = this.qualityBtn.parentElement;
    if (!wrapper) return;

    // hls.js reports levels ascending by bitrate/resolution — sort descending
    // (by height, then bitrate) so the highest quality is first.
    const ordered = [...qualities].sort(
      (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bitrate ?? 0) - (a.bitrate ?? 0),
    );

    if (ordered.length === 0) {
      // Nothing to show — don't fake a switcher on plain MP4 / native HLS.
      this.qualitySelectable = false;
      this.qualityDropdown.close();
      wrapper.style.display = 'none';
      return;
    }

    wrapper.style.display = '';

    if (ordered.length === 1) {
      // Single rendition — visible but inert, so it's obvious there's no choice.
      this.qualitySelectable = false;
      this.qualityDropdown.close();
      this.qualityDropdown.setItems([{ id: ordered[0].id, label: ordered[0].label }]);
      this.qualityBtn.disabled = true;
      addClass(this.qualityBtn, 'ci-360-video-pill-btn--disabled');
      this.qualityBtn.setAttribute('aria-disabled', 'true');
      this.qualityBtn.setAttribute('title', 'Only one quality available');
      this.qualityBtn.textContent = ordered[0].label;
      return;
    }

    // Two or more — a real choice.
    this.qualitySelectable = true;
    this.qualityBtn.disabled = false;
    removeClass(this.qualityBtn, 'ci-360-video-pill-btn--disabled');
    this.qualityBtn.removeAttribute('aria-disabled');
    this.qualityBtn.removeAttribute('title');
    this.qualityDropdown.setItems([
      { id: 'auto', label: 'Auto' },
      ...ordered.map((q) => ({ id: q.id, label: q.label })),
    ]);
    this.qualityDropdown.setActiveId(this.currentQualityId);
    this.updateQualityLabel();
  }
  setCurrentQuality(id: QualityId): void {
    this.currentQualityId = id;
    this.qualityDropdown?.setActiveId(id);
    this.updateQualityLabel();
  }
  /** Reflect the active stereo layout in the format picker (highlights the
   *  matching row). No-op when the menu wasn't built. */
  setStereoLayout(layout: StereoLayout): void {
    this.stereoDropdown?.setActiveId(layout);
  }
  /** Show or hide the manual format picker. Only meaningful in `'auto'` mode;
   *  `true`/`false` modes own their own visibility at build time. */
  setStereoMenuVisible(visible: boolean): void {
    if (!this.stereoWrapper) return;
    this.stereoWrapper.style.display = visible ? '' : 'none';
    if (!visible) {
      this.stereoDropdown?.close();
      this.stereoBtn?.setAttribute('aria-expanded', 'false');
    }
  }
  setGpuWarning(message: string | null): void {
    if (message) {
      addClass(this.gpuWarning, 'ci-360-video-controls-gpu-warning--visible');
      this.gpuWarning.setAttribute('aria-label', message);
      this.gpuWarning.setAttribute('aria-hidden', 'false');
      this.gpuWarning.setAttribute('title', message);
    } else {
      removeClass(this.gpuWarning, 'ci-360-video-controls-gpu-warning--visible');
      this.gpuWarning.setAttribute('aria-label', '');
      this.gpuWarning.setAttribute('aria-hidden', 'true');
      this.gpuWarning.setAttribute('title', '');
    }
  }

  // ---------------- visibility / idle ----------------

  show(): void {
    removeClass(this.element, 'ci-360-video-controls--hidden');
  }
  hide(): void {
    addClass(this.element, 'ci-360-video-controls--hidden');
  }
  /** Schedule a hide after `delay` ms of no further `startIdleTimer()` calls. */
  startIdleTimer(delay = 3000): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => this.hide(), delay);
  }
  clearIdleTimer(): void {
    if (this.idleTimer !== undefined) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  destroy(): void {
    this.clearIdleTimer();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.speedDropdown?.destroy();
    this.qualityDropdown?.destroy();
    this.stereoDropdown?.destroy();
    this.progressBar.destroy();
    this.element.remove();
  }

  // ---------------- internals ----------------
  private lastBuffered = 0;
  private lastTime = 0;
  private lastDuration = 0;
}

/** Backwards-compatible factory matching the prior `createToolbar()` API. */
export function createToolbar(opts: ToolbarOptions): Toolbar {
  return new Toolbar(opts);
}

export type ToolbarHandle = Toolbar;
