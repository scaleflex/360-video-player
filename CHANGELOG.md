# Changelog

All notable changes to `@cloudimage/360-video`.

## [Unreleased]

### Fixed

- **HLS / DASH quality menu broken in the CDN / UMD bundle.** The standalone `360-video.min.js` externalises `hls.js` / `dashjs` to the `Hls` / `dashjs` globals, but the adapters' bundled `await import('hls.js')` couldn't be resolved by the browser there — it threw, so playback silently fell back to **native HLS**, which hides the rendition list. The quality pill ended up stuck on a single, disabled level (e.g. `144p`) even while ABR was actually streaming 4K. The adapters now prefer a global `Hls` / `dashjs` when present (CDN path) and only dynamic-import the peer dependency otherwise (bundler/npm path). npm consumers were unaffected.

### Added

- **`<ci-360-video>` Web Component** — the player now ships as a framework-agnostic custom element, matching the Cloudimage plugin family. New side-effect entry `@cloudimage/360-video/define` registers it (the CDN `<script>` auto-registers too). Bare kebab attributes map to config via the shared attribute table; complex config (`sources`, `on*`) and the imperative API are JS properties/methods; engine events surface as composed, bubbling `ci-360-video-*` CustomEvents. Renders inside an **open Shadow DOM** with encapsulated styles — theme via `--ci-360-video-*` set on the host element. The React wrapper now drives this element internally (same public API). New `src/web-component/ci-360-video.ts`, `src/define.ts`, `config/vite.define.config.ts`; `injectStyles` is now Shadow-DOM-aware (`src/utils/dom.ts`). The `CI360Video` class and `data-*` `autoInit` remain exported for back-compat.
- **Automatic stereo-layout detection** — `stereo` now accepts `'auto'` (the new default). On MP4 sources the player reads the embedded Spherical Video metadata over an HTTP range request on just the `moov` box and resolves the layout:
  - **V2** `st3d` box (`stereo_mode` byte), and
  - **V1** `GSpherical` RDF/XML (`<GSpherical:StereoMode>`, used by ExoPlayer-style files such as `congo.mp4`).
  - Best-effort: HLS/DASH, non-MP4, no-range and CORS failures fall back to `'mono'` without throwing. New module `src/player/spherical-metadata.ts`; new exported type `StereoOption = StereoLayout | 'auto'`.
- **Stereo fallback for sources without metadata** — covers older, re-encoded top-bottom / side-by-side clips that `'auto'` can't detect:
  - **Manual format picker** (`stereoMenu: boolean | 'auto'`, default `'auto'`) — a toolbar control (Mono / Top-Bottom / Side-by-Side) that re-crops live via the existing `update({ stereo })` path. `'auto'` reveals it only when relevant (an ambiguous `1:1` / `4:1` frame with no metadata, or a stereo layout already active). New exported type `StereoMenuOption`.
  - **Developer hint** — a one-time `console.warn` naming the suspected layout and how to fix it (set `stereo` explicitly, or re-inject metadata) when a frame looks stereo but plays mono. Frame shape is used only to *offer help*, never to auto-pick a layout (it's ambiguous — mono-180° is also `1:1`). New module `src/player/stereo-heuristic.ts`.

### Changed

- **Default `stereo` flipped from `'mono'` to `'auto'`** — correctly tagged stereo MP4s now play without a manual toggle. Mono content is unaffected visually; the trade-off is one small range request per MP4 load (errors swallowed).

### Fixed

- **Empty projection registry in production builds** — `"sideEffects": false` let the bundler tree-shake the bare side-effect imports that register the projections, so the minified bundle threw `unknown projection "equirectangular"` and rendered a blank player (first seen on the GitHub Pages demo). `sideEffects` is now an allowlist that preserves `src/projection/{equirectangular,fisheye}`, plus a post-build `scripts/verify-bundle.mjs` guard that fails the build if any projection is missing from the emitted bundles.
- React wrapper now forwards runtime `stereo` prop changes; `StereoOption` re-exported from `/react`.
- Quality/source swaps re-probe stereo in `'auto'` mode.

### Deferred

- Phone-cardboard VR and immersive WebXR (`vrButton` / `setVRView` / `enterVR`) are wired in the engine but **kept out of the first release** — the UI surface is hidden for the minimal version and can be re-enabled later.

## [1.3.0] - 2026-05-29

### Added

- **Scaleflex Filerobot integration** under a new subpath export `@cloudimage/360-video/filerobot`.
  - `fromFilerobotFile(file)` returns a spreadable `{ src, poster? }` object: HLS playlist if transcoding produced one, otherwise the original CDN URL. Spread directly into the `CI360Video` constructor.
  - `pickFilerobotVideoUrl(file)` lower-level helper returning `{ src, kind: 'hls' | 'mp4' | 'unknown' }` for callers that need branching.
  - Uses **structural typing** — no peer dependency on `@filerobot/core`. Any object matching the documented `FilerobotFileLike` shape is accepted.
  - Output bundle: **0.71 KB / 0.38 KB gzip** (separate file, tree-shaken away for consumers who don't import `/filerobot`).
- New build script `build:filerobot` and Vite config (`config/vite.filerobot.config.ts`); the main `build` runs it after `build:bundle` and `build:react`.

### Other

- **Quality selector — auto-rotate direction & speed** are continued from 1.2.0 polish (default speed 10 °/s, positive = look right).
- **Quality dropdown** with `sources` config: pre-encoded variants at multiple resolutions can be listed and switched at runtime with `currentTime` + play-state preservation. Detailed example in README.

## [1.2.0] - 2026-05-29

### Added

- **1:1 visual match with `@cloudimage/video-hotspot`**: same CSS-variable system (`--ci-360-video-*`), same red progress fill, same toolbar dimensions (48 px), same Lucide-style icons, same slide-up hide animation.
- **Playback-speed selector**: pill button with 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2× options in a backdrop-blurred popup.
- **Quality / bitrate selector** for streaming sources. Reads from `hls.js` (`hls.levels`) or `dashjs` (`getBitrateInfoListFor('video')`); shows `Auto + N`-levels in a popup; auto-hidden when the adapter reports no levels (HTML5 / MP4).
- **GPU texture-size warning indicator**: ⚠ chip appears in the toolbar when the loaded video's resolution exceeds the device's `gl.MAX_TEXTURE_SIZE`. Tooltip / `aria-label` explain the consequence (driver downscale → blurry image).
- **Loop / repeat button**: toggles `<video>.loop` at runtime; active state mirrors the underlying element.
- **Idle auto-hide**: toolbar slides down after 3 s of pointer inactivity over the player; reappears instantly on any pointer event.
- **Tooltip on the progress bar** with the time at cursor position.
- **Keyboard ARIA on the progress slider**: ←/→ skip 5 s, Home/End jump to start/end.
- New public events: `qualitychange`, `qualitylevelsupdated` (mirrored from adapter).
- New config flags: `speedButton`, `qualityButton` (both default `true`; quality auto-hidden when there's nothing to show).
- New shared UI primitive: `src/ui/dropdown.ts` (used by both speed and quality dropdowns).

### Changed

- `VideoPlayerAdapter` base now declares quality API: `getAvailableQualities()`, `getCurrentQuality()`, `setQuality(id)`. HTML5 keeps the default no-op behaviour; `HLSAdapter` and `DashAdapter` override with real mappings.
- Toolbar refactored from factory function to `class Toolbar` (a `createToolbar()` factory and `ToolbarHandle` type alias are kept for backwards compatibility).
- `ProgressBar` DOM now matches `video-hotspot` exactly: `.progress > .progress-bar { buffered, fill, handle } + .progress-tooltip`. Drag-state class is `ci-360-video-progress--dragging`.

### Internal

- Tests: **89 across 11 files**, all green (was 66 in v1.1). New suites: `capabilities.test.ts`, `quality.test.ts`, `toolbar.test.ts`.
- HLS / DASH adapters wire native level events (`hlsManifestParsed`, `hlsLevelSwitched`, `streamInitialized`, `qualityChangeRendered`) into the player's EventEmitter shape.

## [1.1.0] - 2026-05-28

### Added

- **DASH source adapter** (`src/player/dash-adapter.ts`). `.mpd` URLs are auto-routed via `PlayerFactory.detect`; `dashjs` is an optional peer dependency loaded via dynamic `import()` so the main bundle stays slim.
- **Stereoscopic source support** (`top-bottom` / `side-by-side`). Stereo content is rendered with the left eye on the sphere — a non-VR mono view of stereo files. Implemented via `Texture.offset` / `Texture.repeat` in `src/texture/eye-mapping.ts`; no geometry or shader changes for the existing equirectangular path.
- **Fisheye projection family** (`src/projection/fisheye.ts`). Two new projections registered:
  - `fisheye` — single hemispherical lens, default 180° FOV, half-sphere coverage.
  - `dual-fisheye` — two back-to-back hemispheres side-by-side; the raw output of most 360° cameras (Ricoh Theta, Insta360, GoPro MAX). Custom `ShaderMaterial` performs the inverse fisheye projection with a smooth seam blend around the equator.
- **`lensFovDeg`** config option for fisheye projections (default `180`; data attribute `data-ci-360-video-lens-fov-deg`).
- README sections: **Supported source formats**, **Supported projections**, **ffmpeg cookbook** for generating test content from an equirectangular MP4.
- Demo (vanilla + React) now exposes `projection` and `stereo` selects.

### Changed

- `rotateSpeed` default raised from `0.2` to `1.0` — pixel-perfect drag (cursor and texture move 1:1), matching mainstream 360° viewer feel.
- `ProjectionType` widened from `'equirectangular'` to `'equirectangular' | 'fisheye' | 'dual-fisheye'`.
- `StereoLayout` widened from `'mono'` to `'mono' | 'top-bottom' | 'side-by-side'`.
- `PlayerType` widened from `'auto' | 'html5' | 'hls'` to `'auto' | 'html5' | 'hls' | 'dash'`.

### Internal

- `mapUVForEye` signature changed to `(texture, eye, layout)` (previously `(eye, layout)`); the new texture parameter is used to set `offset` / `repeat` directly. Internal API only — no public surface impact.
- New tests: `tests/stereo.test.ts`, `tests/fisheye.test.ts`, plus extensions to `tests/adapter.test.ts` (DASH detection) and `tests/config.test.ts` (new whitelists). Suite is **66 tests across 8 files**, all green.

## [1.0.0] - 2026-05-27

### Added

- Initial release: equirectangular 360° video player on Three.js.
- Custom orbit controls for inside-sphere viewing (drag → lon/lat, wheel/pinch → FOV); never dollies the camera off centre.
- Stable public coordinate contract: `{ lon, lat, fov }` in degrees via `getView()` / `setView()` / `onViewChange`.
- `latLonToScreen(lon, lat)` projection helper — foundation for future hotspot / overlay layers.
- Source adapter abstraction (`VideoPlayerAdapter`) with the same shape as `@cloudimage/video-hotspot`. v1 implements `HTML5Adapter` (MP4 / WebM / native HLS on Safari).
- Toolbar: play/pause, mute + volume, time + scrub bar, fullscreen.
- Click-to-play activation overlay (autoplay/audio-gesture gating).
- Gyroscope mode (DeviceOrientation) for mobile.
- Keyboard control (arrows, +/-, space, M, F, 0).
- WCAG-aligned ARIA roles and labels.
- React wrapper (`CI360VideoViewer`, `useCI360Video`) with dynamic core import for SSR safety.
- Single-instance-per-container rule to prevent WebGL context accumulation.
- Vanilla + React demos under `demo/`.

### Architecture seams (engine wired, UIs deferred to v1.x / v2)

- **WebXR / VR**: render loop runs on `renderer.setAnimationLoop`; `xr/webxr.ts` exposes `isAvailable()` and a warn-stubbed `enterVR()`.
- **Stereoscopic 3D**: `texture/eye-mapping.ts` is identity for `mono`; the seam accepts `'top-bottom'` and `'side-by-side'` future layouts.
- **HLS streaming**: `player/hls-adapter.ts` dynamic-imports `hls.js` (optional peer); `.m3u8` URLs auto-route to it via `PlayerFactory.detect`.
- **Hotspot / overlay layer**: `overlays/overlay-layer.ts` accepts `(lon, lat) → DOM element` anchors and projects them each tick via `latLonToScreen`.
- **Additional projections**: `projection/projection.ts` registry — `cubemap` / `eac` / `fisheye` plug in as new files implementing the `Projection` interface.
