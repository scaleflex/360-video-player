import { Mesh, Scene, PerspectiveCamera, Vector2 } from 'three';

import type {
  CI360VideoConfig,
  CI360VideoInstance,
  ScreenPoint,
  StereoLayout,
  ThreeObjects,
  ViewState,
} from './types';
import { mergeConfig, normalizeConfig, parseDataAttributes, validateConfig } from './config';
import { createRenderer, handleResize, type RendererHandle, type ResizeHandle } from './renderer';
import { createScene, createCamera } from './scene';
import { createRenderLoop, type RenderLoopHandle } from './render-loop';

import { getProjection } from '../projection/projection';
// Side-effect import: registers the equirectangular projection so it can be
// looked up by name. Adding a new projection later is a sibling import.
import '../projection/equirectangular';
// Side-effect import: registers `fisheye` and `dual-fisheye` projections.
import '../projection/fisheye';

import { createVideoTexture, type VideoTextureHandle } from '../texture/video-texture';
import { mapUVForEye } from '../texture/eye-mapping';
import { detectStereoLayout } from '../player/spherical-metadata';
import { classifyStereoAmbiguity, type StereoAmbiguity } from '../player/stereo-heuristic';

import { SPHERE_RADIUS, ViewStateManager } from '../controls/view-state';
import { createOrbitControls360, type OrbitControls360Handle } from '../controls/orbit-controls-360';
import { createGyroControls, type GyroControlsHandle } from '../controls/gyro-controls';

import type { VideoPlayerAdapter } from '../player/adapter';
import { PlayerFactory } from '../player/player-factory';

import { createToolbar, type ToolbarHandle } from '../ui/toolbar';
import { createLoadingOverlay, type LoadingOverlay } from '../ui/loading';
import { createErrorOverlay, type ErrorOverlay } from '../ui/error';
import { createActivateOverlay, type ActivateOverlay } from '../ui/activate-overlay';
import { createFullscreenController, type FullscreenController } from '../ui/fullscreen';

import { createOverlayLayer, type OverlayLayerHandle } from '../overlays/overlay-layer';
import { createXRController, type XRController } from '../xr/webxr';

import { setContainerAria, setCanvasAria, clearContainerAria } from '../a11y/aria';
import { setupFocusManagement } from '../a11y/focus';
import { setupKeyboard, type KeyboardHandler } from '../a11y/keyboard';

import { getElement, addClass, removeClass, injectStyles, removeStyles, type StyleRoot } from '../utils/dom';
import { disposeObject3D } from '../utils/dispose';
import { EventEmitter, addListener, throttle, type ThrottledFunction } from '../utils/events';
import { checkVideoFitsGpu, getMaxTextureSize } from '../utils/capabilities';

import CSS from '../styles/index.css?inline';

const STYLE_ID = 'ci-360-video-styles';

/**
 * Main 360 video player class.
 *
 * Orchestrates the building blocks (renderer / scene / projection / texture /
 * controls / adapter / UI / a11y) into a single lifecycle. Inherits from
 * `EventEmitter` so consumers can subscribe via `player.on('view-change', …)`
 * in addition to the callback fields in the config.
 *
 * Convention (mirrored from other Cloudimage plugins):
 *   - One instance per container element. Re-using a container destroys the
 *     previous instance — preventing WebGL context leaks, which most browsers
 *     cap at ~16 per page.
 *   - Construction is synchronous; the asynchronous parts (adapter creation,
 *     metadata loading) happen in `init()` which runs without blocking.
 */
export class CI360Video extends EventEmitter implements CI360VideoInstance {
  private static instances = new Map<HTMLElement, CI360Video>();

  // Static `autoInit` is a convenience for the UMD `<script>` workflow —
  // host pages with `data-ci-360-video-src="…"` get auto-attached players.
  static autoInit(root: ParentNode = document): CI360Video[] {
    const out: CI360Video[] = [];
    root.querySelectorAll<HTMLElement>('[data-ci-360-video-src]').forEach((el) => {
      out.push(new CI360Video(el, {}));
    });
    return out;
  }

  private container: HTMLElement;
  // Where our stylesheet is mounted: the document, or a ShadowRoot when the
  // container lives inside a custom element (<ci-360-video>).
  private styleRoot: StyleRoot;
  private config: CI360VideoConfig;
  private destroyed = false;

  // Lazy-initialized Three.js / sub-systems
  private rendererHandle: RendererHandle | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private mesh: Mesh | null = null;
  private videoTexture: VideoTextureHandle | null = null;
  private resize: ResizeHandle | null = null;
  private loop: RenderLoopHandle | null = null;

  private viewState!: ViewStateManager;
  private controls: OrbitControls360Handle | null = null;
  private gyro: GyroControlsHandle | null = null;
  private adapter: VideoPlayerAdapter | null = null;
  private toolbar: ToolbarHandle | null = null;
  private loadingOverlay: LoadingOverlay | null = null;
  private errorOverlay: ErrorOverlay | null = null;
  private activateOverlay: ActivateOverlay | null = null;
  private fullscreen!: FullscreenController;
  private overlayLayer: OverlayLayerHandle | null = null;
  private xr!: XRController;
  private keyboard: KeyboardHandler | null = null;

  private throttledViewChange: ThrottledFunction<(v: ViewState) => void> | null = null;
  private adapterCleanups: Array<() => void> = [];
  private idleListenerCleanups: Array<() => void> = [];
  /** Index into `config.sources` of the currently active variant, or `-1`. */
  private currentSourceIndex = -1;
  /** Removes the pending one-shot `loadedmetadata` listener from a quality
   *  source-swap. Replaced on each swap and run on destroy so a teardown
   *  mid-swap can't later fire `currentTime`/`play()` on a detached element. */
  private pendingMetaCleanup: (() => void) | null = null;

  /** Layout `stereo: 'auto'` resolved to from the source's `st3d` metadata.
   *  Starts at `'mono'` (the safe default) and is corrected once detection
   *  completes. Ignored when `config.stereo` is an explicit layout. */
  private resolvedStereo: StereoLayout = 'mono';
  /** Aborts an in-flight `stereo: 'auto'` probe on destroy / source swap. */
  private stereoAbort: AbortController | null = null;
  /** Frame-aspect suspicion, set once dimensions are known. Drives the dev hint
   *  and the manual format menu's `'auto'` visibility — never the render. */
  private stereoAmbiguity: StereoAmbiguity = 'mono';
  /** `true` once the `'auto'` probe has settled (or there's nothing to probe),
   *  so we know "resolved to mono" means "no metadata found", not "not yet". */
  private stereoProbeDone = false;
  /** One-shot guard so the "looks stereo but playing mono" dev hint warns once
   *  per source, not on every metadata/probe re-evaluation. */
  private stereoHintShown = false;

  /** Cardboard split-screen mode: render the scene twice (left/right) into two
   *  side-by-side viewports for phone-in-a-holder VR. */
  private cardboard = false;
  /** `true` only when *we* turned the gyroscope on for cardboard, so exiting
   *  cardboard tears down our gyro but leaves a user-configured one alone. */
  private gyroFromCardboard = false;
  /** Reused scratch vector for `renderer.getSize` — avoids per-frame allocs. */
  private readonly rendererSize = new Vector2();

  constructor(element: HTMLElement | string, config: Partial<CI360VideoConfig> = {}) {
    super();
    this.container = getElement(element);

    // Single-instance-per-container — replace any prior instance.
    const prev = CI360Video.instances.get(this.container);
    if (prev) prev.destroy();
    CI360Video.instances.set(this.container, this);

    // Defaults < data attrs < JS config. JS wins last.
    const fromAttrs = parseDataAttributes(this.container);
    this.config = mergeConfig({ ...fromAttrs, ...config });

    const errors = validateConfig(this.config);
    errors.forEach((e) => console.warn(`CI360Video config: ${e}`));
    // Repair inverted view bounds so a bad fovMin/fovMax (or lat) can't pin the
    // view via a malformed clamp. validateConfig has already warned about them.
    normalizeConfig(this.config);

    // Stereo cropping is only applied for the equirectangular path; fisheye
    // shaders ignore it. Warn so an explicit stereo layout on a fisheye source
    // doesn't silently render the doubled-up frame.
    if (
      (this.config.projection === 'fisheye' || this.config.projection === 'dual-fisheye') &&
      (this.config.stereo === 'top-bottom' || this.config.stereo === 'side-by-side')
    ) {
      console.warn(
        `CI360Video: stereo "${this.config.stereo}" is ignored for projection "${this.config.projection}" — only equirectangular crops stereo sources.`,
      );
    }

    addClass(this.container, 'ci-360-video');
    this.container.setAttribute('data-theme', this.config.theme ?? 'dark');
    // Resolve the style root once: a ShadowRoot if mounted inside a custom
    // element, otherwise the document. Keeps styles scoped under Shadow DOM.
    const root = this.container.getRootNode();
    this.styleRoot = root instanceof ShadowRoot ? root : document;
    injectStyles(CSS, STYLE_ID, this.styleRoot);

    setContainerAria(this.container, this.config.alt);
    setupFocusManagement(this.container);

    // Fullscreen needs the container reference but no Three.js — bring it up
    // immediately so callers can request fullscreen even before init() finishes.
    this.fullscreen = createFullscreenController({
      target: this.container,
      onChange: (isFs) => {
        this.toolbar?.setFullscreen(isFs);
        this.config.onFullscreenChange?.(isFs);
        this.emit('fullscreen-change', isFs);
      },
    });

    // View-state is the public coordinate contract — also non-WebGL, also
    // brought up immediately so `getView()` works pre-render.
    this.viewState = new ViewStateManager({
      initialLon: this.config.initialLon!,
      initialLat: this.config.initialLat!,
      initialFov: this.config.fov!,
      fovMin: this.config.fovMin!,
      fovMax: this.config.fovMax!,
      latMin: this.config.latMin!,
      latMax: this.config.latMax!,
      damping: this.config.damping!,
      dampingFactor: this.config.dampingFactor!,
    });

    // Throttle outward `view-change` to 30 Hz — 60 Hz spams consumers and
    // is rarely needed for analytics/hotspots; raise if a future overlay
    // module needs frame-tight sync.
    this.throttledViewChange = throttle((v: ViewState) => {
      this.config.onViewChange?.(v);
      this.emit('view-change', v);
    }, 1000 / 30);

    // Click-to-load gate: when `autoLoad=false` we draw a play button instead
    // of immediately spinning up WebGL + downloading the video. The user's
    // click also satisfies the autoplay-with-audio gesture requirement, so we
    // call `play()` after init regardless of the configured `autoplay` flag.
    if (this.config.autoLoad === false) {
      this.activateOverlay = createActivateOverlay({
        poster: this.config.poster,
        label: this.config.alt,
      });
      this.activateOverlay.onActivate(() => {
        this.activateOverlay?.destroy();
        this.activateOverlay = null;
        void this.init().then(() => {
          void this.play().catch(() => { /* ignore — user can press play */ });
        });
      });
      this.container.appendChild(this.activateOverlay.element);
    } else {
      void this.init();
    }
  }

  // ---------------- private: bootstrap ----------------

  private async init(): Promise<void> {
    if (this.destroyed) return;

    try {
      const rendererHandle = createRenderer({
        antialias: this.config.antialias,
        pixelRatio: this.config.pixelRatio,
      });
      this.rendererHandle = rendererHandle;
      this.container.appendChild(rendererHandle.canvas);
      setCanvasAria(rendererHandle.canvas, this.config.alt);

      this.scene = createScene();
      const aspect = this.container.clientWidth / Math.max(this.container.clientHeight, 1);
      this.camera = createCamera(aspect, this.viewState.getView().fov);

      this.resize = handleResize(this.container, rendererHandle.renderer, this.camera);

      this.loadingOverlay = createLoadingOverlay();
      this.container.appendChild(this.loadingOverlay.element);
      this.loadingOverlay.show();

      this.errorOverlay = createErrorOverlay();
      this.container.appendChild(this.errorOverlay.element);

      this.overlayLayer = createOverlayLayer(this.container, this.camera, this.viewState);
      this.xr = createXRController({ renderer: rendererHandle.renderer });

      // Pick the initial source URL. If `sources` is provided, prefer it (with
      // the `default` flag, falling back to the first entry); otherwise use the
      // single `src` field.
      const initialSourceIndex = this.pickDefaultSourceIndex();
      const initialSrc =
        initialSourceIndex >= 0
          ? this.config.sources![initialSourceIndex].src
          : this.config.src;
      this.currentSourceIndex = initialSourceIndex;

      // ---- video adapter ----
      this.adapter = await PlayerFactory.create({
        src: initialSrc,
        autoplay: this.config.autoplay,
        loop: this.config.loop,
        muted: this.config.muted,
        poster: this.config.poster,
        crossOrigin: this.config.crossOrigin ?? null,
        playerType: this.config.playerType,
      });
      if (this.destroyed) {
        this.adapter.destroy();
        return;
      }
      this.adapter.mount(this.container);

      const video = this.adapter.getVideoElement();

      // Build the textured sphere as soon as we know the source can be decoded.
      // We don't strictly need width/height for equirectangular (the projection
      // doesn't read them) but waiting on `loadedmetadata` is the earliest
      // moment the texture has a valid first frame.
      const checkGpu = (): void => {
        if (this.destroyed || !this.toolbar) return;
        const max = getMaxTextureSize();
        const r = checkVideoFitsGpu(video, max);
        if (r.fits || r.max === 0 || r.videoW === 0) {
          this.toolbar.setGpuWarning(null);
          return;
        }
        this.toolbar.setGpuWarning(
          `Video resolution ${r.videoW}×${r.videoH} exceeds GPU limit ${r.max}×${r.max}. ` +
            `The driver will downscale; the panorama may look blurry.`,
        );
      };

      const buildMesh = (): void => {
        if (this.destroyed || !this.scene || this.mesh) return;
        // Anisotropic filtering keeps the poles / wide-view periphery sharp
        // instead of smearing ("stretching") at grazing sampling angles.
        const maxAnisotropy =
          this.rendererHandle?.renderer.capabilities.getMaxAnisotropy() ?? 0;
        this.videoTexture = createVideoTexture(video, maxAnisotropy);
        const projection = getProjection(this.config.projection ?? 'equirectangular');
        const geometry = projection.createGeometry({
          segments: this.config.sphereSegments!,
          radius: SPHERE_RADIUS,
        });
        const layout = this.effectiveStereo();
        const material = projection.createMaterial(this.videoTexture.texture, {
          // For stereo sources we render the left eye in mono (non-VR view).
          eye: layout === 'mono' ? 'mono' : 'left',
          layout,
          lensFovDeg: this.config.lensFovDeg,
        });
        this.mesh = new Mesh(geometry, material);
        this.scene.add(this.mesh);
        this.loadingOverlay?.hide();
      };

      // Run immediately if metadata already loaded (cached video).
      if (video.readyState >= /* HAVE_METADATA */ 1) {
        buildMesh();
        checkGpu();
        this.updateStereoAmbiguity();
      }
      this.adapterCleanups.push(
        this.subscribeAdapter('loadedmetadata', () => {
          buildMesh();
          checkGpu();
          this.refreshQualities();
          this.updateStereoAmbiguity();
        }),
      );

      // `stereo: 'auto'` — probe the source's Spherical Video V2 metadata in the
      // background. The mesh builds immediately as mono (no flash for mono
      // content); if the probe finds a stereo layout we re-crop the texture.
      this.startStereoAutoDetect(initialSrc);

      // Wire adapter events → public callbacks + EventEmitter.
      this.adapterCleanups.push(
        this.subscribeAdapter('play', () => {
          this.toolbar?.setPlaying(true);
          this.config.onPlay?.();
          this.emit('play');
        }),
        this.subscribeAdapter('pause', () => {
          this.toolbar?.setPlaying(false);
          this.config.onPause?.();
          this.emit('pause');
        }),
        this.subscribeAdapter('timeupdate', () => {
          const t = this.adapter!.getCurrentTime();
          const d = this.adapter!.getDuration();
          this.toolbar?.setTime(t, d);
          this.toolbar?.setBuffered(this.adapter!.getBufferedEnd());
          this.config.onTimeUpdate?.(t);
          this.emit('timeupdate', t);
        }),
        this.subscribeAdapter('durationchange', () => {
          const d = this.adapter!.getDuration();
          this.config.onDurationChange?.(d);
          this.emit('durationchange', d);
        }),
        this.subscribeAdapter('ended', () => {
          this.config.onEnded?.();
          this.emit('ended');
        }),
        this.subscribeAdapter('waiting', () => this.loadingOverlay?.show()),
        this.subscribeAdapter('playing', () => {
          this.loadingOverlay?.hide();
          this.refreshQualities();
        }),
        this.subscribeAdapter('progress', () => {
          this.toolbar?.setBuffered(this.adapter!.getBufferedEnd());
        }),
        this.subscribeAdapter('volumechange', () => {
          this.toolbar?.setMuted(this.adapter!.isMuted());
          this.toolbar?.setVolume(this.adapter!.getVolume());
        }),
        this.subscribeAdapter('error', (...args: unknown[]) => {
          const err = args[0];
          const msg = err instanceof Error ? err.message : 'Video playback error';
          this.errorOverlay?.show(msg);
          this.config.onError?.(err);
          this.emit('error', err);
        }),
        this.subscribeAdapter('qualitylevelsupdated', (...args: unknown[]) => {
          const levels = (args[0] ?? []) as import('./types').QualityLevel[];
          this.refreshQualities();
          this.emit('qualitylevelsupdated', levels);
        }),
        this.subscribeAdapter('qualitychange', (...args: unknown[]) => {
          const id = (args[0] ?? 'auto') as import('./types').QualityId;
          this.toolbar?.setCurrentQuality(id);
          this.emit('qualitychange', id);
        }),
        this.subscribeAdapter('ratechange', () => {
          if (!this.adapter || !this.toolbar) return;
          this.toolbar.setSpeed(this.adapter.getPlaybackRate());
        }),
      );

      // ---- controls ----
      this.controls = createOrbitControls360(this.container, this.camera, this.viewState, {
        enabled: this.config.controls,
        dragToRotate: this.config.dragToRotate,
        invertDrag: this.config.invertDrag,
        rotateSpeed: this.config.rotateSpeed,
        scrollToZoom: this.config.scrollToZoom,
        autoRotate: this.config.autoRotate,
        autoRotateSpeed: this.config.autoRotateSpeed,
        autoRotateIdleDelay: this.config.autoRotateIdleDelay,
      });

      // `!this.gyro` guard: a `setVRView(true)` call before init() finished may
      // have already created a cardboard gyro — don't orphan its listener.
      if (this.config.gyroscope && !this.gyro) {
        this.gyro = createGyroControls(this.viewState);
        // Best-effort: works on Android without a gesture; iOS 13+ requires
        // a user-gesture-bound call, which host apps can do by exposing a
        // button that invokes `getThreeObjects()` patterns or a future API.
        void this.gyro.enable();
      }

      // ---- keyboard ----
      this.keyboard = setupKeyboard({
        container: this.container,
        view: this.viewState,
        onPlayPause: () => (this.adapter?.isPaused() ? void this.play() : this.pause()),
        onToggleMute: () => this.setMuted(!this.isMuted()),
        onToggleFullscreen: () => this.fullscreen.toggle(),
        onResetView: () =>
          this.setView(
            {
              lon: this.config.initialLon!,
              lat: this.config.initialLat!,
              fov: this.config.fov!,
            },
            true, // animate smoothly back to the initial view (setView: animate=true)
          ),
      });

      // ---- toolbar ----
      if (this.config.controls) {
        this.toolbar = createToolbar({
          fullscreenButton: this.config.fullscreenButton,
          vrButton: this.config.vrButton,
          speedButton: this.config.speedButton,
          qualityButton: this.config.qualityButton,
          stereoMenu: this.config.stereoMenu,
          onPlayPause: () => (this.adapter?.isPaused() ? void this.play() : this.pause()),
          onMuteToggle: () => this.setMuted(!this.isMuted()),
          onVolumeChange: (v) => this.setVolume(v),
          onSeek: (t) => this.seek(t),
          onSpeedChange: (rate) => this.adapter?.setPlaybackRate(rate),
          onQualityChange: (id) => this.handleQualitySelection(id),
          // A manual pick is a deliberate, explicit layout — route it through the
          // same runtime path as `update({ stereo })` so it re-crops live and
          // stops the source's `'auto'` probe from overriding the viewer.
          onStereoChange: (layout) => this.update({ stereo: layout }),
          onLoopToggle: () => {
            if (!this.adapter) return;
            const v = this.adapter.getVideoElement();
            v.loop = !v.loop;
            this.toolbar?.setLoop(v.loop);
          },
          onFullscreen: () => this.fullscreen.toggle(),
          onEnterVR: () => this.toggleCardboard(),
        });
        this.container.appendChild(this.toolbar.element);
        this.toolbar.setMuted(this.adapter.isMuted());
        this.toolbar.setVolume(this.adapter.getVolume());
        this.toolbar.setPlaying(!this.adapter.isPaused());
        this.toolbar.setSpeed(this.adapter.getPlaybackRate());
        this.toolbar.setLoop(this.adapter.getVideoElement().loop);
        // Reflect the quality control for the current source (adapter levels →
        // sources → the playing video's resolution). Refreshed again on
        // loadedmetadata / playing / qualitylevelsupdated.
        this.refreshQualities();
        // Reflect any stereo state already known (cached metadata / a resolved
        // 'auto' probe) into the format picker the moment the toolbar exists.
        this.updateStereoMenuVisibility();

        // Idle auto-hide: any pointer activity inside the container resets the
        // 3s timer. Throttled to 100 ms so we don't reset the timer 60×/sec
        // during a drag.
        const resetIdle = throttle(() => {
          this.toolbar?.show();
          this.toolbar?.startIdleTimer(3000);
        }, 100);
        this.idleListenerCleanups.push(
          addListener(this.container, 'pointermove', resetIdle as EventListener),
          addListener(this.container, 'pointerdown', resetIdle as EventListener),
          addListener(this.container, 'pointerleave', () => {
            this.toolbar?.startIdleTimer(800); // hide quicker once the pointer leaves
          }),
          () => resetIdle.cancel(),
        );
        this.toolbar.startIdleTimer(3000);

        // ---- click / tap on the panorama toggles play / pause ----
        // Only fire on a genuine tap: a single pointer that barely moved and
        // didn't land on the toolbar/overlays. A drag-to-rotate (moved past the
        // threshold) or a pinch (a second pointer) must NOT toggle playback.
        const TAP_MOVE_PX = 6;
        let tapId: number | null = null;
        let tapX = 0;
        let tapY = 0;
        let tapDisqualified = false; // moved too far, or became multi-pointer
        const overUI = (target: EventTarget | null): boolean =>
          target instanceof Element &&
          !!target.closest(
            '.ci-360-video-controls, .ci-360-video-loading, .ci-360-video-error, .ci-360-video-activate, .ci-360-video-overlays',
          );
        const onTapDown = (e: PointerEvent): void => {
          if (overUI(e.target)) { tapId = null; return; }
          if (tapId !== null) { tapDisqualified = true; return; } // 2nd pointer = pinch
          tapId = e.pointerId;
          tapX = e.clientX;
          tapY = e.clientY;
          tapDisqualified = false;
        };
        const onTapMove = (e: PointerEvent): void => {
          if (e.pointerId !== tapId) return;
          if (Math.hypot(e.clientX - tapX, e.clientY - tapY) > TAP_MOVE_PX) {
            tapDisqualified = true;
          }
        };
        const onTapUp = (e: PointerEvent): void => {
          if (e.pointerId !== tapId) return;
          const isTap = !tapDisqualified;
          tapId = null;
          if (isTap) this.togglePlay();
        };
        this.idleListenerCleanups.push(
          addListener(this.container, 'pointerdown', onTapDown as EventListener),
          addListener(this.container, 'pointermove', onTapMove as EventListener),
          addListener(this.container, 'pointerup', onTapUp as EventListener),
        );

        // Check GPU fit in case metadata already loaded before the toolbar existed.
        if (video.readyState >= 1) checkGpu();
      }

      // ---- render loop ----
      // setAnimationLoop (not rAF) is required for future WebXR support.
      this.loop = createRenderLoop(rendererHandle.renderer, (dt) => this.tick(dt));
      this.loop.start();

      this.config.onReady?.();
      this.emit('ready');
    } catch (err) {
      console.error('CI360Video: init failed:', err);
      this.errorOverlay?.show(
        err instanceof Error ? err.message : 'Failed to initialize 360° video player',
      );
      this.config.onError?.(err);
      this.emit('error', err);
    }
  }

  /**
   * Pick the initial source from `config.sources` — first entry with
   * `default: true`, or `0` if any source is configured, else `-1`.
   */
  private pickDefaultSourceIndex(): number {
    const list = this.config.sources;
    if (!list || list.length === 0) return -1;
    const explicit = list.findIndex((s) => s.default);
    return explicit >= 0 ? explicit : 0;
  }

  /** URL of the currently active source (the selected `sources` variant, or
   *  the single `src`). */
  private currentSrc(): string {
    const i = this.currentSourceIndex;
    return i >= 0 && this.config.sources ? this.config.sources[i].src : this.config.src;
  }

  /**
   * Quality-dropdown selection handler.
   *
   * If the adapter exposes real levels (HLS / DASH) we forward through; if the
   * user supplied `sources`, we swap the `<video src>` in place while
   * preserving `currentTime` and the play/pause state. For the cosmetic preset
   * case the selection is a no-op aside from the label update done by the
   * toolbar.
   */
  private handleQualitySelection(id: import('./types').QualityId): void {
    if (!this.adapter) return;
    if (this.adapter.getAvailableQualities().length > 0) {
      this.adapter.setQuality(id);
      return;
    }
    const list = this.config.sources;
    if (!list || list.length === 0) return; // cosmetic preset — host can listen to `qualitychange`
    if (typeof id !== 'number') return;
    const next = list[id];
    if (!next || id === this.currentSourceIndex) return;

    const video = this.adapter.getVideoElement();
    const currentTime = video.currentTime;
    const wasPaused = video.paused;
    // Drop any still-pending listener from a previous rapid swap so they don't
    // stack (each restores currentTime + play state).
    this.pendingMetaCleanup?.();
    const onMeta = (): void => {
      video.removeEventListener('loadedmetadata', onMeta);
      this.pendingMetaCleanup = null;
      try {
        video.currentTime = currentTime;
      } catch {
        /* seeking may fail if the new source isn't seekable yet — best-effort */
      }
      if (!wasPaused) {
        void video.play().catch(() => {});
      }
    };
    this.pendingMetaCleanup = () => video.removeEventListener('loadedmetadata', onMeta);
    video.addEventListener('loadedmetadata', onMeta);
    video.src = next.src;
    video.load();
    this.currentSourceIndex = id;
    // The new variant may carry different stereo metadata — re-probe in 'auto'
    // mode (this also aborts the previous source's in-flight probe).
    if (this.config.stereo === 'auto') {
      this.resolvedStereo = 'mono';
      this.applyStereoToTexture();
      this.startStereoAutoDetect(next.src);
    }
  }

  /**
   * Reconcile the quality control with the current source. A guaranteed path
   * that doesn't depend on catching the one-shot `qualitylevelsupdated` event:
   * streaming engines populate their levels around `loadedmetadata` / `playing`,
   * so polling here is reliable even if a cached manifest fired the parse event
   * before we subscribed.
   *
   * Precedence:
   *   1. Adapter levels (HLS/DASH) → interactive switcher.
   *   2. `sources` array → manual switcher.
   *   3. Neither → show the video's actual resolution as a single, **disabled**
   *      entry (e.g. plain MP4 / native HLS) so the user sees the quality
   *      they're watching, with the control visibly inert.
   */
  private refreshQualities(): void {
    if (!this.adapter || !this.toolbar) return;

    const adapterLevels = this.adapter.getAvailableQualities();
    if (adapterLevels.length > 0) {
      this.toolbar.setQualities(adapterLevels);
      this.toolbar.setCurrentQuality(this.adapter.getCurrentQuality());
      return;
    }

    const sources = this.config.sources ?? [];
    if (sources.length > 0) {
      this.toolbar.setQualities(
        sources.map((s, i) => ({ id: i, label: s.label, height: s.height, width: s.width })),
      );
      this.toolbar.setCurrentQuality(this.currentSourceIndex >= 0 ? this.currentSourceIndex : 0);
      return;
    }

    // No enumerable levels — surface the resolution of the actual frame, dimmed.
    const h = this.adapter.getVideoElement().videoHeight;
    if (h > 0) {
      this.toolbar.setQualities([{ id: 0, label: `${h}p`, height: h }]);
      this.toolbar.setCurrentQuality(0);
    } else {
      this.toolbar.setQualities([]); // unknown until metadata loads → hide for now
    }
  }

  private subscribeAdapter(event: string, handler: (...args: any[]) => void): () => void {
    if (!this.adapter) return () => {};
    const a = this.adapter;
    a.on(event, handler);
    return () => a.off(event, handler);
  }

  /** Render-loop tick. Order: controls → view-state → camera → texture → overlays → render. */
  private tick(dt: number): void {
    if (this.destroyed) return;
    if (this.rendererHandle?.isContextLost()) return;

    this.controls?.update(dt);
    const changed = this.viewState.step(dt);
    if (this.camera) this.viewState.applyToCamera(this.camera);
    this.videoTexture?.update();
    this.overlayLayer?.update();

    if (this.scene && this.camera && this.rendererHandle) {
      if (this.cardboard) {
        this.renderStereoSplit();
      } else {
        this.rendererHandle.renderer.render(this.scene, this.camera);
      }
    }

    if (changed && this.throttledViewChange) {
      this.throttledViewChange(this.viewState.getView());
    }
  }

  /**
   * Cardboard render: draw the scene into a left and a right half-width
   * viewport. Each eye samples its own crop of a stereo source via
   * `mapUVForEye`; for a mono source both halves are identical (immersive view,
   * no real depth). The head orientation is shared — the parallax that creates
   * depth lives in the source's two eye images, not in a camera offset, so for
   * 360° video this is the correct model (and what makes mono unavoidably flat).
   */
  private renderStereoSplit(): void {
    const r = this.rendererHandle!.renderer;
    const scene = this.scene!;
    const camera = this.camera!;
    const tex = this.videoTexture?.texture;

    const size = r.getSize(this.rendererSize);
    const halfW = Math.floor(size.x / 2);
    const h = size.y;
    if (halfW <= 0 || h <= 0) return;

    // Each eye viewport is half-width — keep the camera aspect matched so the
    // panorama isn't horizontally squashed.
    const aspect = halfW / h;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    const layout = this.effectiveStereo();
    // Only a stereo equirect source needs a per-eye re-crop. A mono source is
    // already set to the full frame (both eyes identical), so we skip the two
    // per-frame `mapUVForEye` writes (each dirties the texture matrix).
    const perEyeCrop =
      !!tex && layout !== 'mono' &&
      (this.config.projection ?? 'equirectangular') === 'equirectangular';

    r.setScissorTest(true);

    // Left eye → left half.
    if (perEyeCrop) mapUVForEye(tex!, 'left', layout);
    r.setViewport(0, 0, halfW, h);
    r.setScissor(0, 0, halfW, h);
    r.render(scene, camera);

    // Right eye → right half.
    if (perEyeCrop) mapUVForEye(tex!, 'right', layout);
    r.setViewport(halfW, 0, halfW, h);
    r.setScissor(halfW, 0, halfW, h);
    r.render(scene, camera);

    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, h);
    // For a stereo source the texture is now cropped to the RIGHT eye; the
    // non-VR path is restored by `setCardboard(false)` → `applyStereoToTexture`.
    // (Mono leaves the full-frame crop untouched.)
  }

  /**
   * Enter/leave cardboard split-screen mode. On enter we best-effort turn on
   * the gyroscope (so turning a phone looks around) — the toolbar click is the
   * user gesture iOS requires. On exit we restore the full viewport, the
   * single-eye crop, and (if we enabled it) tear our gyro back down.
   */
  private setCardboard(on: boolean): void {
    if (on === this.cardboard || this.destroyed) return;
    this.cardboard = on;
    this.container.classList.toggle('ci-360-video--cardboard', on);
    this.toolbar?.setVrActive(on);

    if (on) {
      if (!this.gyro) {
        this.gyro = createGyroControls(this.viewState);
        this.gyroFromCardboard = true;
        void this.gyro.enable();
      }
      return;
    }

    if (this.gyroFromCardboard) {
      this.gyro?.destroy();
      this.gyro = null;
      this.gyroFromCardboard = false;
    }
    // Restore the full-frame camera aspect + renderer viewport/size through the
    // one owner of that state (`handleResize`), rather than re-deriving it here.
    this.resize?.apply();
    this.applyStereoToTexture(); // un-split: re-crop to the resolved single eye.
  }

  private toggleCardboard(): void {
    this.setCardboard(!this.cardboard);
  }

  // ---------------- public API ----------------

  async play(): Promise<void> {
    if (this.adapter) await this.adapter.play();
  }
  pause(): void { this.adapter?.pause(); }
  /** Toggle play/pause — shared by the toolbar, keyboard, and click-on-video. */
  togglePlay(): void {
    if (!this.adapter) return;
    if (this.adapter.isPaused()) void this.play();
    else this.pause();
  }
  seek(time: number): void { this.adapter?.seek(time); }
  isPaused(): boolean { return this.adapter ? this.adapter.isPaused() : true; }
  getCurrentTime(): number { return this.adapter?.getCurrentTime() ?? 0; }
  getDuration(): number { return this.adapter?.getDuration() ?? 0; }
  setMuted(muted: boolean): void { this.adapter?.setMuted(muted); }
  isMuted(): boolean { return this.adapter?.isMuted() ?? false; }
  setVolume(volume: number): void { this.adapter?.setVolume(volume); }
  getVolume(): number { return this.adapter?.getVolume() ?? 1; }

  getView(): ViewState { return this.viewState.getView(); }
  setView(view: Partial<ViewState>, animate = true): void {
    this.viewState.setView(view, !animate);
  }

  latLonToScreen(lon: number, lat: number): ScreenPoint {
    if (!this.camera) return { x: 0, y: 0, visible: false };
    return this.viewState.latLonToScreen(this.camera, this.container, lon, lat);
  }

  enterFullscreen(): void { this.fullscreen.enter(); }
  exitFullscreen(): void { this.fullscreen.exit(); }
  isFullscreen(): boolean { return this.fullscreen.isFullscreen(); }

  async enterVR(): Promise<void> { await this.xr?.enterVR(); }

  /** Toggle (or set) the on-screen split-screen "cardboard" stereo view for
   *  phone-in-a-holder VR. No headset required. For genuinely stereo sources
   *  (e.g. top-bottom) each eye gets its own image; for mono sources both eyes
   *  match (immersive, but flat). */
  setVRView(on?: boolean): void { this.setCardboard(on ?? !this.cardboard); }
  isVRView(): boolean { return this.cardboard; }

  /** The concrete layout to render: the resolved `st3d` value when `'auto'`,
   *  otherwise the explicit config value. */
  private effectiveStereo(): StereoLayout {
    const s = this.config.stereo;
    if (s === 'auto') return this.resolvedStereo;
    return (s as StereoLayout | undefined) ?? 'mono';
  }

  /** Rebuild the projection mesh in place from the current config, reusing the
   *  live video texture. Lets `update()` apply a runtime change to `projection`,
   *  `sphereSegments`, or `lensFovDeg` (the mesh is built once in `init`). The
   *  video texture is kept out of disposal — it outlives the mesh. */
  private rebuildProjectionMesh(): void {
    if (!this.scene || !this.videoTexture || !this.mesh) return;
    this.scene.remove(this.mesh);
    disposeObject3D(this.mesh, new Set([this.videoTexture.texture]));
    this.mesh = null;

    const projection = getProjection(this.config.projection ?? 'equirectangular');
    const geometry = projection.createGeometry({
      segments: this.config.sphereSegments!,
      radius: SPHERE_RADIUS,
    });
    const layout = this.effectiveStereo();
    const material = projection.createMaterial(this.videoTexture.texture, {
      eye: layout === 'mono' ? 'mono' : 'left',
      layout,
      lensFovDeg: this.config.lensFovDeg,
    });
    this.mesh = new Mesh(geometry, material);
    this.scene.add(this.mesh);
    this.applyStereoToTexture();
  }

  /** Re-crop the live video texture to the effective stereo layout. Only
   *  equirectangular honours stereo (fisheye shaders ignore it), so this is a
   *  no-op for other projections. Cheap enough to call on any layout change. */
  private applyStereoToTexture(): void {
    if (!this.videoTexture) return;
    if ((this.config.projection ?? 'equirectangular') !== 'equirectangular') return;
    const layout = this.effectiveStereo();
    mapUVForEye(this.videoTexture.texture, layout === 'mono' ? 'mono' : 'left', layout);
  }

  /** Kick off a best-effort `st3d` metadata probe for an `'auto'` source.
   *  Resolves silently to nothing for non-MP4 / no-range sources. */
  private startStereoAutoDetect(src: string): void {
    // Fresh probe = fresh hint cycle for this source.
    this.stereoProbeDone = false;
    this.stereoHintShown = false;
    if (this.config.stereo !== 'auto' || !src) {
      // Nothing to probe — an explicit layout is already the final answer.
      this.stereoProbeDone = true;
      return;
    }
    this.stereoAbort?.abort();
    const ac = new AbortController();
    this.stereoAbort = ac;
    void detectStereoLayout(src, ac.signal).then((layout) => {
      if (this.destroyed || ac.signal.aborted) return;
      if (layout && layout !== this.resolvedStereo) {
        this.resolvedStereo = layout;
        this.applyStereoToTexture();
      }
      // The probe has settled: a falsy `layout` means "no metadata found", so a
      // still-mono result can now legitimately trigger the ambiguity hint/menu.
      this.stereoProbeDone = true;
      this.updateStereoMenuVisibility();
      this.maybeHintAmbiguousStereo();
    });
  }

  /**
   * Reconcile the toolbar's manual format picker with the current state.
   * Always highlights the active layout; for `stereoMenu: 'auto'` it reveals the
   * picker only when it's actually useful — the frame is an ambiguous stereo
   * candidate, or a stereo layout is already active — and only on the
   * equirectangular path (the only one that crops stereo). `true`/`false` own
   * their visibility at build time, so `'auto'` is the only mode we drive here.
   */
  private updateStereoMenuVisibility(): void {
    if (!this.toolbar) return;
    this.toolbar.setStereoLayout(this.effectiveStereo());
    if (this.config.stereoMenu !== 'auto') return;
    const equirect = (this.config.projection ?? 'equirectangular') === 'equirectangular';
    const relevant =
      equirect && (this.stereoAmbiguity !== 'mono' || this.effectiveStereo() !== 'mono');
    this.toolbar.setStereoMenuVisible(relevant);
  }

  /** Recompute the frame-aspect suspicion from the current video dimensions and
   *  reconcile the dependent UI/hint. Called once dimensions are known. */
  private updateStereoAmbiguity(): void {
    if (!this.adapter) return;
    const v = this.adapter.getVideoElement();
    this.stereoAmbiguity = classifyStereoAmbiguity(v.videoWidth, v.videoHeight);
    this.updateStereoMenuVisibility();
    this.maybeHintAmbiguousStereo();
  }

  /**
   * Emit a one-time developer hint when a source *looks* stereoscopic (square
   * 1:1 or 4:1 frame) yet carries no Spherical metadata, so it is playing as
   * mono. We never auto-correct — the shape is ambiguous (mono-180° is also
   * 1:1) — but a console pointer tells the integrator exactly how to fix it.
   * Only fires for `stereo: 'auto'` (an explicit layout means a choice was
   * already made) on the equirectangular path.
   */
  private maybeHintAmbiguousStereo(): void {
    if (this.stereoHintShown) return;
    if (this.config.stereo !== 'auto') return;
    if (!this.stereoProbeDone) return; // wait until "no metadata found" is certain
    if (this.effectiveStereo() !== 'mono') return; // probe found a layout → all good
    if ((this.config.projection ?? 'equirectangular') !== 'equirectangular') return;
    if (this.stereoAmbiguity === 'mono') return; // frame shape is unremarkable
    this.stereoHintShown = true;
    const kind = this.stereoAmbiguity === 'tb-candidate' ? 'top-bottom' : 'side-by-side';
    console.warn(
      `CI360Video: this source's frame looks like it could be stereoscopic ` +
        `"${kind}", but no Spherical Video metadata was found — it is playing as ` +
        `mono. If it is stereo, set stereo:"${kind}" explicitly, re-inject ` +
        `metadata (e.g. Google's spatialmedia tool), or let the viewer choose ` +
        `via the format menu (stereoMenu).`,
    );
  }

  update(config: Partial<CI360VideoConfig>): void {
    const prevStereo = this.config.stereo;
    const prevProjection = this.config.projection;
    const prevSegments = this.config.sphereSegments;
    const prevLensFov = this.config.lensFovDeg;
    const prevGyro = this.config.gyroscope;
    Object.assign(this.config, config);
    // Stereo can change at runtime. An explicit layout applies immediately; a
    // switch to 'auto' re-probes the current source.
    if (config.stereo !== undefined && config.stereo !== prevStereo) {
      if (config.stereo === 'auto') {
        this.resolvedStereo = 'mono';
        this.applyStereoToTexture();
        this.startStereoAutoDetect(this.currentSrc());
      } else {
        this.applyStereoToTexture();
      }
      this.updateStereoMenuVisibility();
    }

    // Projection / geometry / lens FOV need a mesh rebuild (built once in init).
    if (
      (config.projection !== undefined && config.projection !== prevProjection) ||
      (config.sphereSegments !== undefined && config.sphereSegments !== prevSegments) ||
      (config.lensFovDeg !== undefined && config.lensFovDeg !== prevLensFov)
    ) {
      this.rebuildProjectionMesh();
    }

    // Playback flags that map straight onto the <video> element.
    if (config.loop !== undefined) {
      const v = this.adapter?.getVideoElement();
      if (v) v.loop = config.loop;
      this.toolbar?.setLoop(config.loop);
    }
    if (config.muted !== undefined) this.setMuted(config.muted);

    // Gyroscope can be toggled at runtime. Create the handle lazily the first
    // time it's enabled; enabling is best-effort (iOS needs a user gesture).
    if (config.gyroscope !== undefined && config.gyroscope !== prevGyro) {
      if (config.gyroscope) {
        if (!this.gyro) this.gyro = createGyroControls(this.viewState);
        void this.gyro.enable();
      } else {
        this.gyro?.disable();
      }
    }
    this.controls?.setOptions({
      enabled: this.config.controls,
      dragToRotate: this.config.dragToRotate,
      invertDrag: this.config.invertDrag,
      rotateSpeed: this.config.rotateSpeed,
      scrollToZoom: this.config.scrollToZoom,
      autoRotate: this.config.autoRotate,
      autoRotateSpeed: this.config.autoRotateSpeed,
      autoRotateIdleDelay: this.config.autoRotateIdleDelay,
    });
    this.viewState.updateOptions({
      fovMin: this.config.fovMin!,
      fovMax: this.config.fovMax!,
      latMin: this.config.latMin!,
      latMax: this.config.latMax!,
      damping: this.config.damping!,
      dampingFactor: this.config.dampingFactor!,
    });
    // Live FOV: the React wrapper lists `fov` as an update-effect dependency,
    // so a changed `fov` prop must actually move the view. Animate toward it
    // (snap=false) rather than jumping. `setView` clamps to the new fov limits.
    if (config.fov !== undefined) this.viewState.setView({ fov: config.fov });
    if (config.theme) this.container.setAttribute('data-theme', config.theme);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    CI360Video.instances.delete(this.container);

    this.stereoAbort?.abort();
    this.stereoAbort = null;
    this.pendingMetaCleanup?.();
    this.pendingMetaCleanup = null;
    this.loop?.stop();
    this.loop = null;
    this.controls?.destroy();
    this.controls = null;
    this.gyro?.destroy();
    this.gyro = null;
    this.keyboard?.destroy();
    this.keyboard = null;
    this.toolbar?.destroy();
    this.toolbar = null;
    this.loadingOverlay?.destroy();
    this.loadingOverlay = null;
    this.errorOverlay?.destroy();
    this.errorOverlay = null;
    this.activateOverlay?.destroy();
    this.activateOverlay = null;
    this.overlayLayer?.destroy();
    this.overlayLayer = null;
    this.fullscreen?.destroy();

    this.adapterCleanups.forEach((fn) => fn());
    this.adapterCleanups = [];
    this.idleListenerCleanups.forEach((fn) => fn());
    this.idleListenerCleanups = [];
    this.adapter?.destroy();
    this.adapter = null;

    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
      // Keep the video texture out of the material-scan disposal — it's owned
      // by the VideoTextureHandle below, whose destroy() also cancels the
      // frame callback. Disposing it here too would be a redundant double-free.
      const keep = this.videoTexture ? new Set([this.videoTexture.texture]) : undefined;
      disposeObject3D(this.mesh, keep);
    }
    this.mesh = null;
    this.scene = null;

    this.videoTexture?.destroy();
    this.videoTexture = null;
    this.resize?.destroy();
    this.resize = null;
    this.rendererHandle?.canvas.remove();
    this.rendererHandle?.destroy();
    this.rendererHandle = null;

    this.throttledViewChange?.cancel();
    this.throttledViewChange = null;

    clearContainerAria(this.container);
    removeClass(this.container, 'ci-360-video');
    removeClass(this.container, 'ci-360-video--cardboard');
    this.container.removeAttribute('data-theme');
    removeStyles(STYLE_ID, this.styleRoot);
    this.removeAllListeners();
  }

  getThreeObjects(): ThreeObjects | null {
    if (!this.scene || !this.camera || !this.rendererHandle) return null;
    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.rendererHandle.renderer,
      mesh: this.mesh,
    };
  }
}
