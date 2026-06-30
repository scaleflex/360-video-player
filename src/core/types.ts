import type { Scene, PerspectiveCamera, WebGLRenderer, Mesh } from 'three';

/**
 * Public coordinate contract.
 *
 * `lon` and `lat` are in **degrees**; `fov` is the camera vertical field of
 * view in degrees. This is the stable contract that everything depending on
 * "where the viewer is looking" hangs off of: initial view, hotspots/overlays,
 * camera animation, deep linking, analytics.
 *
 * Convention:
 *   - `lon = 0` faces the centre of the equirectangular frame.
 *   - `lat > 0` looks up; `lat < 0` looks down.
 *   - `lat` is clamped to `[latMin, latMax]` (default ±85°) to avoid gimbal flip.
 */
export interface ViewState {
  lon: number;
  lat: number;
  fov: number;
}

/** Source-side projection. `'equirectangular'` is the default; `'fisheye'`
 *  (single 180° lens) and `'dual-fisheye'` (back-to-back 180° lenses, the raw
 *  output of most 360° cameras) are also supported. */
export type ProjectionType = 'equirectangular' | 'fisheye' | 'dual-fisheye';

/** Stereo source layout. For stereo sources the player renders the **left**
 *  eye onto the sphere (non-VR mono view); when WebXR is added, both eyes
 *  will be rendered via the same `mapUVForEye` seam. */
export type StereoLayout = 'mono' | 'top-bottom' | 'side-by-side';

/** Config-level stereo selector. The concrete {@link StereoLayout} values plus
 *  `'auto'`, which probes the source's Spherical Video V2 (`st3d`) metadata for
 *  progressive MP4 sources and resolves to the declared layout. When metadata
 *  is absent or unreadable (HLS/DASH, no range support, non-MP4) `'auto'`
 *  resolves to `'mono'`. */
export type StereoOption = StereoLayout | 'auto';

/** Manual stereo-format menu visibility. `'auto'` (default) surfaces the picker
 *  only when it's relevant — an ambiguous (square / 4:1) frame with no metadata,
 *  or a stereo layout already active; `true` always shows it; `false` hides it. */
export type StereoMenuOption = boolean | 'auto';

/** Source-adapter selector. `'auto'` falls back to URL detection (`.m3u8` → hls, `.mpd` → dash). */
export type PlayerType = 'auto' | 'html5' | 'hls' | 'dash';

/**
 * Quality (a.k.a. rendition / level) selector identifier.
 *
 * `'auto'` lets the streaming engine pick the level via ABR. A **number** is a
 * concrete index into the array returned by `getAvailableQualities()` — used by
 * HLS/DASH adapters where levels are enumerated. A **string** (e.g. `'1080p'`)
 * is a preset shown in the default common-resolutions menu on plain MP4
 * sources; the adapter doesn't act on it, but consumers can listen on the
 * `qualitychange` event to re-source via their own CDN URL transforms.
 */
export type QualityId = number | string;

/** A single rendition level reported by the source adapter (HLS / DASH). */
export interface QualityLevel {
  id: number;
  /** Human-readable label, typically `"<height>p"` e.g. `"720p"`. */
  label: string;
  width?: number;
  height?: number;
  /** Bitrate in bits per second, if known. */
  bitrate?: number;
}

/**
 * One pre-encoded variant of the same video at a specific quality.
 *
 * When the consumer supplies `sources: VideoSource[]` in the config, the
 * quality dropdown lists those entries instead of the cosmetic preset, and
 * picking one swaps the underlying `<video src>` — `currentTime` and the
 * play/pause state are preserved across the switch.
 *
 * This is the standard "manual ABR" pattern (Plyr, Video.js); use it when
 * you serve the same panorama at multiple resolutions from your CDN.
 */
export interface VideoSource {
  src: string;
  /** Display label, e.g. `"1080p"` or `"4K"`. */
  label: string;
  /** Optional metadata; not used by the player itself. */
  height?: number;
  width?: number;
  /** If `true`, this entry is the initially loaded variant. Falls back to the
   *  first item when nothing is marked. */
  default?: boolean;
}

export type Theme = 'light' | 'dark';

export interface CI360VideoConfig {
  /** Required. Video URL (MP4 in v1; .m3u8 routed to the HLS adapter seam).
   *  Ignored when `sources` is provided. */
  src: string;

  /** Optional list of pre-encoded variants at different qualities. When set,
   *  the toolbar's quality dropdown lists these, and selecting one swaps the
   *  underlying `<video src>` while preserving playback state. */
  sources?: VideoSource[];

  // ---- projection / stereo ----
  projection?: ProjectionType;
  /** Stereo layout, or `'auto'` (default) to detect it from the MP4's Spherical
   *  Video V2 `st3d` metadata. See {@link StereoOption}. */
  stereo?: StereoOption;
  /** Whether the toolbar shows a manual format picker (Mono / Top-Bottom /
   *  Side-by-Side) so a viewer can correct a stereo source that carries no
   *  metadata. Default `'auto'` — shown only when relevant. See
   *  {@link StereoMenuOption}. */
  stereoMenu?: StereoMenuOption;
  /** Per-lens field of view in degrees, used only by fisheye projections.
   *  Default 180 — adjust if a specific 360° camera under- or over-shoots. */
  lensFovDeg?: number;

  // ---- playback ----
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  poster?: string;
  /** `<video crossorigin>` attribute. Defaults to `'anonymous'` so the frame
   *  can be uploaded to a WebGL texture without tainting the canvas. */
  crossOrigin?: string;
  playerType?: PlayerType;

  // ---- initial view + limits (degrees) ----
  initialLon?: number;
  initialLat?: number;
  fov?: number;
  fovMin?: number;
  fovMax?: number;
  latMin?: number;
  latMax?: number;

  // ---- controls ----
  controls?: boolean;
  dragToRotate?: boolean;
  invertDrag?: boolean;
  rotateSpeed?: number;
  scrollToZoom?: boolean;
  gyroscope?: boolean;
  damping?: boolean;
  dampingFactor?: number;
  autoRotate?: boolean;
  /** Degrees per second applied to `lon` while idle. */
  autoRotateSpeed?: number;
  /** Milliseconds of input inactivity before auto-rotate resumes. Default
   *  `2000` — set `0` to drift immediately with no idle wait. */
  autoRotateIdleDelay?: number;

  // ---- UI ----
  theme?: Theme;
  fullscreenButton?: boolean;
  /** Show the VR button. Extension point — `enterVR()` is a no-op + warn in v1. */
  vrButton?: boolean;
  /** Show the playback-speed pill button (0.5×–2×). Default `true`. */
  speedButton?: boolean;
  /** Show the quality pill button for streaming sources. Auto-hidden when the
   *  adapter reports no levels. Default `true`. */
  qualityButton?: boolean;

  // ---- perf ----
  sphereSegments?: number;
  /** Max device-pixel-ratio passed to the renderer. Default `2`. */
  pixelRatio?: number;
  antialias?: boolean;
  /** When `false`, the player shows a click-to-load overlay instead of booting WebGL immediately. */
  autoLoad?: boolean;

  // ---- accessibility ----
  alt?: string;

  // ---- callbacks ----
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  onEnded?: () => void;
  onViewChange?: (view: ViewState) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  onError?: (error: unknown) => void;
}

/** Result of `latLonToScreen()` — used by the overlay/hotspot layer hook. */
export interface ScreenPoint {
  /** CSS pixels relative to the container's top-left. */
  x: number;
  y: number;
  /** `false` when the point is behind the camera or off-screen. */
  visible: boolean;
}

/** Handle for the underlying Three.js objects. Returned by `getThreeObjects()`
 *  so advanced integrators (e.g. hotspot layer) can extend the scene. */
export interface ThreeObjects {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  mesh: Mesh | null;
}

export interface CI360VideoInstance {
  // ---- playback ----
  play(): Promise<void>;
  pause(): void;
  seek(time: number): void;
  isPaused(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  getVolume(): number;

  // ---- view ----
  getView(): ViewState;
  setView(view: Partial<ViewState>, animate?: boolean): void;
  /** Project a point on the sphere `(lon, lat)` to container-pixel coordinates.
   *  This is the foundation for the future hotspot layer. */
  latLonToScreen(lon: number, lat: number): ScreenPoint;

  // ---- fullscreen ----
  enterFullscreen(): void;
  exitFullscreen(): void;
  isFullscreen(): boolean;

  // ---- VR ----
  /** Real WebXR immersive session (extension point; needs a VR device). */
  enterVR?(): Promise<void>;
  /** Toggle, or explicitly set, the on-screen split-screen "cardboard" stereo
   *  view for phone VR (no headset). Stereo sources get per-eye images; mono
   *  sources show the same image in both eyes. */
  setVRView(on?: boolean): void;
  /** Whether the cardboard split-screen view is currently active. */
  isVRView(): boolean;

  // ---- lifecycle ----
  update(config: Partial<CI360VideoConfig>): void;
  destroy(): void;
  getThreeObjects(): ThreeObjects | null;
}
