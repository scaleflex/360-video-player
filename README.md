<p align="center">
  <a href="https://www.scaleflex.com/en/home">
    <img width="350" src="https://scaleflex.cloudimg.io/v7/plugins/scaleflex/logo.png?vh=b0a502&radius=25&w=700" alt="Cloudimage logo">
  </a>
</p>

<h1 align="center">Cloudimage 360 Video</h1>

<p align="center">
  <strong>An interactive 360° video player on Three.js — equirectangular &amp; fisheye projections, HLS / DASH streaming, stereo, gyroscope and a React wrapper</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@cloudimage/360-video">
    <img src="https://img.shields.io/npm/v/@cloudimage/360-video.svg" alt="Release">
  </a>
  <a href="https://bundlejs.com/?q=@cloudimage/360-video">
    <img src="https://img.shields.io/bundlejs/size/@cloudimage/360-video" alt="Minified + gzipped size">
  </a>
  <a href="https://www.npmjs.com/package/@cloudimage/360-video">
    <img src="https://img.shields.io/npm/dm/@cloudimage/360-video.svg" alt="Downloads">
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
  <a href="https://www.cloudimage.io/en/home">
    <img src="https://img.shields.io/badge/Powered%20by-Cloudimage-blue" alt="Cloudimage">
  </a>
</p>

<p align="center">
  <a href="https://scaleflex.github.io/cloudimage-360-video/">View Demo</a> ·
  <a href="https://codesandbox.io/p/sandbox/github/scaleflex/cloudimage-360-video/tree/main/codesandbox/react">React Sandbox</a> ·
  <a href="https://codesandbox.io/p/sandbox/github/scaleflex/cloudimage-360-video/tree/main/codesandbox/vanilla">Vanilla Sandbox</a> ·
  <a href="https://github.com/scaleflex/cloudimage-360-video/issues">Report Bug</a>
</p>

## Table of Contents

- [Why](#why)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Supported source formats](#supported-source-formats)
- [Supported projections](#supported-projections)
- [Generating test content with ffmpeg](#generating-test-content-with-ffmpeg)
- [Configuration](#configuration)
- [API](#api)
- [Toolbar features](#toolbar-features)
- [Accessibility](#accessibility)
- [Browser support](#browser-support)
- [Integrations](#integrations)
- [Extension points](#extension-points-engine-wired-uis-deferred)
- [License](#license)

## Why

Interactive **360° video player** on Three.js: equirectangular and fisheye projections, HTML5 / HLS / DASH sources, stereo TB/SBS, custom controls, gyroscope, fullscreen, accessibility, and a first-class React wrapper.

Part of the Cloudimage plugin family — sibling to [`@cloudimage/360-view`](../cloudimage-360-view), [`js-cloudimage-3d-view`](../js-cloudimage-3d-view), and [`@cloudimage/video-hotspot`](../Video%20hotspot%20plugin). Same conventions, same dual-distribution (vanilla + React), same `data-*` API.

- Renders sphere-projected 360° video on a single Three.js scene, with proper sRGB color management.
- **Custom controls** (drag → view, wheel/pinch → FOV) — never dollies the camera off the sphere centre, the way stock `OrbitControls` would.
- **Stable coordinate contract** (`{ lon, lat, fov }` in degrees) exposed via `getView()` / `setView()` / `onViewChange` — the foundation for hotspots, deep-linking, and analytics.
- **Multiple source adapters** (HTML5, HLS, DASH) and **multiple projections** (equirectangular, fisheye, dual-fisheye) — all pluggable, all lazy-loaded.
- **Visual identity 1:1 with [`@cloudimage/video-hotspot`](../Video%20hotspot%20plugin)** — same CSS variables, same toolbar metrics, same Lucide icons. Themable via CSS custom properties.
- **Full-featured toolbar**: play/pause, mute + volume, scrub progress with time tooltip, **speed selector** (0.5×–2×), **quality selector** (HLS/DASH levels), loop toggle, fullscreen, idle auto-hide, GPU-warning chip.
- **Auto stereo detection** — `stereo: 'auto'` reads the MP4's Spherical Video metadata (`st3d` / `GSpherical`) so correctly tagged top-bottom / side-by-side files render the correct eye automatically. Files without metadata get a developer hint plus an optional viewer-facing **format picker** (`stereoMenu`). The same detector ships standalone as [`/metadata`](#standalone-metadata-detection-metadata) for authoring UIs.
- **Extension seams** for **hotspot/overlay layers** — engine slots wired up — so adding them later is targeted, not a rewrite.
- **SSR-safe** React wrapper (dynamic import in `useEffect`) — works in Next.js / Remix without "ReferenceError: window is not defined".

## Installation

```bash
npm install @cloudimage/360-video three
# Optional:
npm install hls.js               # only if you'll stream .m3u8 (HLS)
npm install dashjs               # only if you'll stream .mpd (DASH)
npm install react react-dom      # only for the React wrapper
```

Or via CDN — a single **self-contained** `<script>` (three is bundled in, no
extra dependency needed for MP4/WebM):

```html
<!-- Cloudimage CDN (version-pinned): -->
<script src="https://cdn.cloudimage.io/360-video/1.4.3/360-video.min.js"></script>
<!-- or unpkg (always latest): -->
<script src="https://unpkg.com/@cloudimage/360-video"></script>
```

For **HLS/DASH streaming** also load the optional peer as a global *before* the
player script — `hls.js` (global `Hls`) and/or `dashjs` (global `dashjs`). Plain
MP4/WebM needs nothing but the script above.

The script attaches a **namespace** object at `window.CI360Video`; the player
class is `window.CI360Video.CI360Video`. Destructure it once so the rest of your
code reads the same as the npm examples:

```html
<script>
  const { CI360Video } = window.CI360Video;
  const player = new CI360Video('#player', { src: '…', autoplay: true, muted: true });
</script>
```

## Quick start

### Web Component (`<ci-360-video>`)

The framework-agnostic entry. Import `@cloudimage/360-video/define` once to register
the element, then use it like any HTML tag — config maps to plain kebab attributes:

```html
<ci-360-video
  src="https://example.com/your-360-video.mp4"
  autoplay muted loop theme="dark"
  style="display:block; width:100%; aspect-ratio:16/9"
></ci-360-video>

<script type="module">
  import '@cloudimage/360-video/define';
</script>
```

Over the **CDN** the single `<script>` registers the element for you (nothing else to import):

```html
<script src="https://cdn.cloudimage.io/360-video/1.4.3/360-video.min.js"></script>
<ci-360-video src="…mp4" autoplay muted loop style="display:block;width:100%;aspect-ratio:16/9"></ci-360-video>
```

- **Events** are emitted as composed, bubbling `CustomEvent`s named `ci-360-video-<name>`
  (`ci-360-video-ready`, `-play`, `-pause`, `-timeupdate`, `-view-change`, `-fullscreen-change`,
  `-error`, …). `detail` carries the payload (e.g. the `{lon,lat,fov}` view, the current time).
- **Complex config** (`sources`, `on*` callbacks) and the **imperative API**
  (`el.play()`, `el.getView()`, `el.setView()`, …) are available as JS properties/methods on the element.
- **Shadow DOM**: the engine renders inside the element's shadow root, so its styles are
  encapsulated. Theme by setting the `--ci-360-video-*` custom properties **on the element**
  (they inherit into the shadow tree), or flip `theme="light|dark"`.

```js
const el = document.querySelector('ci-360-video');
el.addEventListener('ci-360-video-view-change', (e) => console.log(e.detail)); // {lon,lat,fov}
el.sources = [{ src: 'panorama-4k.mp4', label: '4K', height: 2160 }]; // property for complex config
```

### Vanilla JS (class)

```js
import { CI360Video } from '@cloudimage/360-video';

const player = new CI360Video('#player', {
  src: 'https://example.com/your-360-video.mp4',  // equirectangular 2:1 MP4
  autoplay: true,
  muted: true,                                     // browsers block autoplay-with-sound
  loop: true,
  initialLon: 0,
  initialLat: 0,
  fov: 75,
  onReady: () => console.log('ready', player.getView()),
  onViewChange: (v) => console.log('view', v),
});
```

### HTML `data-*` attributes (no JS needed)

```html
<div
  data-ci-360-video-src="https://example.com/your-360-video.mp4"
  data-ci-360-video-autoplay="true"
  data-ci-360-video-muted="true"
  data-ci-360-video-loop="true"
  style="width: 100%; aspect-ratio: 16 / 9;"
></div>

<script src="https://unpkg.com/@cloudimage/360-video"></script>
<script>window.CI360Video.CI360Video.autoInit();</script>
```

### React

```tsx
import { useRef } from 'react';
import { CI360VideoViewer, type CI360VideoViewerRef } from '@cloudimage/360-video/react';

export function MyVideo() {
  const ref = useRef<CI360VideoViewerRef>(null);
  return (
    <CI360VideoViewer
      ref={ref}
      src="https://example.com/your-360-video.mp4"
      autoplay
      muted
      loop
      style={{ width: '100%', aspectRatio: '16 / 9' }}
      onReady={() => console.log('view', ref.current?.getView())}
    />
  );
}
```

The React wrapper drives the `<ci-360-video>` element under the hood and dynamically imports it, so it's safe to import from a Next.js Server Component or any other SSR boundary.

## Supported source formats

| Format | Status | Notes |
|---|---|---|
| **MP4 / WebM** (HTML5) | ✅ | Direct `<video src=…>`. Default for any URL without a streaming extension. |
| **HLS** (`.m3u8`) | ✅ | Uses `hls.js` (`npm i hls.js`) wherever MSE is supported — the adapter dynamically imports and *prefers* it so the quality menu works. Falls back to the browser's native HLS only on iOS Safari, where `hls.js` can't run. |
| **DASH** (`.mpd`) | ✅ | Requires `npm i dashjs`. Adapter dynamically imports it. |
| YouTube / Vimeo iframe | ❌ | Cross-origin sandbox blocks frame access; the WebGL sphere needs the underlying `<video>`. |
| DRM (Widevine / FairPlay / PlayReady) | ❌ | Out of scope — host responsibility (license server + packaged content). |

## Supported projections

| Projection | Status | Source layout |
|---|---|---|
| `equirectangular` | ✅ | 2:1 frame (`width = 2 × height`). Standard format for ~99% of 360° content. |
| `fisheye` | ✅ | Single hemispherical lens, default 180° FOV. Circular content in a square frame. |
| `dual-fisheye` | ✅ | Two circular hemispheres side-by-side. Raw output of most 360° cameras (Ricoh Theta, Insta360, GoPro MAX). |
| `cubemap` | ❌ | Not implemented — can be added as a new file under `src/projection/`. |
| `EAC` (YouTube's cubemap variant) | ❌ | Same — not implemented. |

### Stereoscopic sources

Leave `stereo: 'auto'` (the default) and the layout is detected from the MP4's embedded Spherical Video metadata — both the modern **V2** `st3d` box (YouTube / Google `spatialmedia`) and the older **V1** `GSpherical` XML (`<GSpherical:StereoMode>`) are read — so correctly tagged stereo files just work with no manual toggle. Detection is a small HTTP range read over the `moov` box (no media download) and falls back to `'mono'` when the metadata is absent or the source can't be probed (HLS/DASH, no range support, non-MP4). Force a layout explicitly with `stereo: 'top-bottom'` / `'side-by-side'` / `'mono'`.

For a stereo source the player renders the **left eye** on the sphere — so a top-bottom or side-by-side file is cropped to a single, correct image instead of showing the doubled-up frame. The view stays a normal flat (mono) 360° pan.

**Sources without metadata.** Older, re-encoded clips often lose their Spherical metadata, so `'auto'` can't see they're stereo and plays them doubled-up as mono. Three things cover this:

- **Explicit layout** — if your CMS/DAM knows the file is stereo, pass `stereo: 'top-bottom'` (or `'side-by-side'`) directly. Most reliable.
- **Developer hint** — when a frame *looks* stereo (square `1:1` or `4:1`) but has no metadata, the player logs a one-time console hint telling you to set the layout or re-inject metadata. The frame shape alone is never used to auto-pick a layout — it's ambiguous (a mono-180° frame is also `1:1`).
- **Viewer format picker** — `stereoMenu` adds a toolbar control (Mono / Top-Bottom / Side-by-Side) so a viewer can fix it at runtime. Default `'auto'` shows it only when relevant (an ambiguous frame, or a stereo layout already active); `true` always shows it, `false` hides it.

## Generating test content with ffmpeg

Any equirectangular MP4 can be converted to the other formats supported here. The `v360` filter has been in ffmpeg since 4.1.

```bash
# Cubemap (not supported here — for completeness)
ffmpeg -i equirect.mp4 -vf "v360=e:c3x2" -c:a copy cubemap.mp4

# Dual fisheye
ffmpeg -i equirect.mp4 -vf "v360=e:dfisheye" -c:a copy dual_fisheye.mp4

# Single fisheye (one 180° hemisphere)
ffmpeg -i equirect.mp4 -vf "v360=e:fisheye" -c:a copy fisheye.mp4

# Fake stereo Top-Bottom (for UV-mapping smoke tests)
ffmpeg -i equirect.mp4 -filter_complex "[0:v]split=2[a][b];[a][b]vstack" -c:a copy stereo_tb.mp4

# Fake stereo Side-by-Side
ffmpeg -i equirect.mp4 -filter_complex "[0:v]split=2[a][b];[a][b]hstack" -c:a copy stereo_sbs.mp4

# DASH manifest from an MP4
ffmpeg -i equirect.mp4 -c copy -f dash equirect.mpd
```

## Configuration

All fields are optional except `src`.

| Field               | Type                  | Default            | Description |
|---------------------|-----------------------|--------------------|-------------|
| `src`               | `string`              | —                  | **Required** (unless `sources` is given). MP4 / WebM / `.m3u8` / `.mpd` URL. Adapter is detected from the extension. |
| `sources`           | `VideoSource[]`       | —                  | Pre-encoded variants at different qualities. When set, the quality dropdown lists these and picking one swaps the `<video src>` (preserving time + play state); plain `src` is then ignored. See "Toolbar features". |
| `projection`        | `'equirectangular' \| 'fisheye' \| 'dual-fisheye'` | `'equirectangular'`| See "Supported projections" above. |
| `stereo`            | `'auto' \| 'mono' \| 'top-bottom' \| 'side-by-side'` | `'auto'` | Stereo source layout. `auto` reads the MP4 Spherical metadata (`st3d` / `GSpherical`); else force a layout. Left eye rendered on sphere. |
| `stereoMenu`        | `boolean \| 'auto'` | `'auto'` | Toolbar format picker (Mono / Top-Bottom / Side-by-Side) letting a viewer switch layout at runtime — e.g. to fix a stereo source with no metadata. `auto` shows it only when relevant (an ambiguous frame with no metadata, or a stereo layout already active); `true` always; `false` never. |
| `lensFovDeg`        | `number` (deg)        | `180`              | Per-lens FOV for fisheye projections. Adjust if a specific camera under-/over-shoots. |
| `autoplay`          | `boolean`             | `false`            | Implies `muted: true` (browser policy). |
| `loop`              | `boolean`             | `false`            | |
| `muted`             | `boolean`             | `false`            | |
| `poster`            | `string`              | —                  | Image shown by the activate overlay when `autoLoad: false`. |
| `crossOrigin`       | `string`              | `'anonymous'`      | `<video crossorigin>`; required for cross-domain WebGL textures. |
| `playerType`        | `'auto' \| 'html5' \| 'hls' \| 'dash'` | `'auto'` | Adapter selection. `'auto'` detects by URL (`.m3u8` → hls, `.mpd` → dash). |
| `initialLon`        | `number` (deg)        | `0`                | |
| `initialLat`        | `number` (deg)        | `0`                | |
| `fov`               | `number` (deg)        | `75`               | Initial vertical FOV. |
| `fovMin` / `fovMax` | `number`              | `30` / `100`       | Zoom bounds. |
| `latMin` / `latMax` | `number`              | `-85` / `85`       | Pitch clamp (avoid gimbal flip). |
| `controls`          | `boolean`             | `true`             | Show toolbar (play/pause, mute, progress, fullscreen). |
| `dragToRotate`      | `boolean`             | `true`             | |
| `invertDrag`        | `boolean`             | `false`            | |
| `rotateSpeed`       | `number`              | `1.0`              | Drag-sensitivity multiplier. `1.0` = pixel-perfect (cursor and texture move 1:1). Lower = film-like; higher = punchier. |
| `scrollToZoom`      | `boolean`             | `true`             | Wheel changes FOV. |
| `gyroscope`         | `boolean`             | `false`            | Use DeviceOrientation on mobile (iOS 13+ requires a gesture-bound enable). |
| `damping`           | `boolean`             | `true`             | Smooth view transitions. |
| `dampingFactor`     | `number` (0-1)        | `0.1`              | |
| `autoRotate`        | `boolean`             | `false`            | Drift the view while idle. |
| `autoRotateSpeed`   | `number` (deg/s)      | `10`               | Positive = clockwise (look right); negative = anti-clockwise. Default ≈ 36 s per full revolution. |
| `theme`             | `'light' \| 'dark'`   | `'dark'`           | Toolbar colour. |
| `fullscreenButton`  | `boolean`             | `true`             | |
| `speedButton`       | `boolean`             | `true`             | Show playback-speed pill button (0.5×–2×). |
| `qualityButton`     | `boolean`             | `true`             | Show quality pill button. Auto-hidden when the adapter reports no levels (i.e. for plain MP4). |
| `sphereSegments`    | `number`              | `64`               | Higher = smoother, more triangles. |
| `pixelRatio`        | `number`              | `2`                | Max DPR cap. |
| `antialias`         | `boolean`             | `true`             | |
| `autoLoad`          | `boolean`             | `true`             | When `false`, shows a click-to-play overlay before booting WebGL. |
| `alt`               | `string`              | `'360° video'`     | `aria-label`. |

### Callbacks

`onReady`, `onPlay`, `onPause`, `onTimeUpdate(t)`, `onDurationChange(d)`, `onEnded`, `onViewChange({lon,lat,fov})`, `onFullscreenChange(isFs)`, `onError(err)`.

The same moments are also emitted as EventEmitter events (`player.on(name, …)`). The event-name strings differ from the callback names:

| Event | Args | Callback equivalent |
|---|---|---|
| `ready` | — | `onReady` |
| `play` | — | `onPlay` |
| `pause` | — | `onPause` |
| `timeupdate` | `number` | `onTimeUpdate` |
| `durationchange` | `number` | `onDurationChange` |
| `ended` | — | `onEnded` |
| `view-change` | `ViewState` | `onViewChange` |
| `fullscreen-change` | `boolean` | `onFullscreenChange` |
| `error` | `unknown` | `onError` |

Streaming sources additionally emit:

- `qualitylevelsupdated` — args: `QualityLevel[]` — when the adapter first reports levels or the manifest reloads.
- `qualitychange` — args: `QualityId` (`number | 'auto'`) — when the active level changes (ABR or user pick).

## API

```ts
new CI360Video(elementOrSelector, config)
```

Instance methods (also available on the React imperative ref):

```ts
play(): Promise<void>
pause(): void
seek(time: number): void
isPaused(): boolean
getCurrentTime(): number
getDuration(): number
setMuted(m: boolean): void
isMuted(): boolean
setVolume(v: number): void
getVolume(): number

getView(): { lon: number; lat: number; fov: number }
setView(view: Partial<ViewState>, animate?: boolean): void
latLonToScreen(lon: number, lat: number): { x, y, visible }  // foundation for hotspots

enterFullscreen(): void
exitFullscreen(): void
isFullscreen(): boolean

update(partialConfig): void          // live-update theme, controls, view limits
destroy(): void
getThreeObjects(): { scene, camera, renderer, mesh } | null   // escape hatch
```

`CI360Video.autoInit(root?)` scans for `[data-ci-360-video-src]` and constructs players for each match.

## Toolbar features

- **Play / Pause** + **Mute + volume slider** + **time display** (m:ss or h:mm:ss).
- **Progress bar** with buffered underlay, scale-in handle, and a time tooltip that follows the cursor. Keyboard ARIA slider: ←/→ skip 5 s, Home/End jump to start/end.
- **Speed selector** (`speedButton: true`) — pill button cycles 0.5×–2× via a popup.
- **Quality selector** (`qualityButton: true`) — always visible by default.
  - **HLS / DASH** sources: items come from the adapter's real levels; selection actually switches the active rendition.
  - **`sources` config** (see below): items come from your provided list; selection swaps the underlying `<video src>` and restores `currentTime` + play state.
  - **Plain MP4** with no `sources`: a cosmetic preset (`Auto · 2160p · … · 360p`) is shown — picking an item just updates the label and emits `qualitychange`; consumers can listen and re-source via their own CDN.

  Example: serve the same panorama at three resolutions from your CDN and let the player switch between them:

  ```ts
  new CI360Video('#player', {
    src: 'panorama-1080p.mp4',          // ignored when `sources` is set
    sources: [
      { src: 'panorama-2160p.mp4', label: '4K', height: 2160 },
      { src: 'panorama-1080p.mp4', label: '1080p', height: 1080, default: true },
      { src: 'panorama-720p.mp4',  label: '720p',  height: 720 },
    ],
  });
  ```
- **Loop / repeat** toggle.
- **Fullscreen** (`fullscreenButton: true`).
- **GPU warning chip** — appears when the source resolution exceeds the device's `gl.MAX_TEXTURE_SIZE`; the driver will downscale and the panorama may look blurry.
- **Idle auto-hide** — the bar slides down after 3 s of no pointer activity; reappears on any movement.

All colors and metrics are exposed as CSS custom properties prefixed with `--ci-360-video-`. Override at the host element level to re-theme.

## Accessibility

- Container: `role="application"`, `aria-roledescription="360 video player"`, `tabindex="0"`.
- Canvas: `role="img"` + `aria-label`.
- Loading: `role="status"` + `aria-live="polite"`. Error: `role="alert"` + `aria-live="assertive"`.
- Progress bar: `role="slider"` with `aria-valuenow` / `aria-valuetext`; ←/→ skip 5 s, Home/End jump to start/end.
- Keyboard: arrows = pan view, `+`/`=` = zoom in, `-`/`_` = zoom out, space = play/pause, `m` = mute, `f` = fullscreen, `0` = reset view.

## Browser support

- Chrome / Edge / Safari / Firefox latest two stable versions.
- iOS Safari 13+ (gyroscope requires a gesture-bound enable).
- Requires WebGL2 or WebGL1.

## Integrations

### Scaleflex Filerobot

If you store your videos in [Filerobot](https://www.scaleflex.com/digital-asset-management) (Scaleflex's DAM) and have **Adaptive Streaming → HLS** enabled in the project's storage settings, you can wire the player in one line:

```ts
import { CI360Video } from '@cloudimage/360-video';
import { fromFilerobotFile } from '@cloudimage/360-video/filerobot';

new CI360Video('#player', {
  ...fromFilerobotFile(file), // file: FilerobotFileLike from your API call
  autoplay: true,
  muted: true,
});
```

`fromFilerobotFile()` resolves the source in this order:

1. **HLS playlist** (`.m3u8`) from Filerobot's transcoder — adaptive bitrate, in-stream quality switching.
2. **Compression variants** — Filerobot's **Compression** feature emits one separate file per resolution (`file.info.compressed`, e.g. `clip_720p_400K_compressed.mp4`). When there's no HLS, these become the player's `sources`, so the toolbar's quality pill switches between the individual files. The highest resolution loads first.
3. **Original CDN URL** — fallback while neither has been generated yet.

It also extracts the poster image. The result is spreadable straight into the constructor, `sources` and all.

Lower-level helpers for branching yourself:

- `pickFilerobotVideoUrl(file)` → `{ src, kind: 'hls' | 'mp4' | 'unknown' }` — the single best URL.
- `pickFilerobotVideoSources(file)` → `VideoSource[]` — per-resolution list parsed from `info.compressed` (label + height from the filename), de-duplicated and sorted highest-first.

> **HLS (adaptive) vs Compression (separate files).** Both give a working quality menu. HLS switches renditions inside one stream (better for long videos / variable networks); Compression serves a distinct URL per quality (simpler, no MSE, switch preserves `currentTime` + play state). Enable Compression resolutions in **Project Settings → Storage → Video → Compression**, then run **Recompress** on the asset.

The subpath is tree-shaken — consumers who don't import `/filerobot` ship zero bytes of integration code.

### Standalone metadata detection (`/metadata`)

The player reads a source's Spherical Video metadata to drive `stereo: 'auto'` — a small HTTP range read over the MP4's `moov` box (no media download). That detector is also exported on its own, so an **authoring / upload UI** can inspect a source *before* the player mounts and configure it up front. It's a dependency-free ES module (no Three.js), tree-shaken away unless you import `/metadata`, and shares the player's code — so what you detect and what the viewer renders can never disagree.

```ts
import { detectSphericalMetadata } from '@cloudimage/360-video/metadata';

const meta = await detectSphericalMetadata(url);
// meta === null            → not MP4 / no range support / CORS — keep a manual UI
// meta.spherical === true  → 360° source (e.g. auto-enable a "360" toggle)
// meta.stereo              → 'top-bottom' | 'side-by-side' | 'mono' | null
```

`detectSphericalMetadata(url, options?)` → `Promise<{ spherical: boolean; stereo: StereoLayout | null } | null>`. Never throws — every failure (non-MP4, no range support, network/CORS, malformed) resolves to `null`.

- `signal?: AbortSignal` — cancel an in-flight probe.
- `maxMoovBytes?: number` (default 32 MB) — cap how much of `moov` is pulled into memory. The stereo/spherical boxes sit near the front of `moov`, so a cheap probe on arbitrary sources can pass a much smaller cap, e.g. `512 * 1024`. Metadata beyond the cap is reported as absent (there's no way to tell "no metadata" from "past the cap" — set the cap accordingly).

Also exported: `detectStereoLayout(url, signal?)` (stereo layout only — what the player's `'auto'` path calls), the pure `moov`-buffer parsers `parseSphericalMetadataFromMoov` / `parseStereoModeFromMoov`, the aspect-ratio hint `classifyStereoAmbiguity(width, height)` → `'mono' | 'tb-candidate' | 'sbs-candidate'` (a *suggestion* only — never a render decision, since a mono-180° frame is also `1:1`), and the types `SphericalMetadata` / `DetectOptions` / `StereoAmbiguity` / `StereoLayout`.

> Try it live on the **Format tester** demo page — it runs `detectSphericalMetadata()` against any URL or local file and reports exactly what it reads.

## Extension points (engine wired, UIs deferred)

- **Stereo / VR rendering.** The phone-cardboard split-screen path is implemented — `setVRView(on?)` / `isVRView()` on the instance, plus an optional toolbar button behind the `vrButton` config flag (**hidden by default** in this minimal release). Immersive **WebXR** (`enterVR()`) is a stub: it warns and no-ops until a headset session is wired in (`src/xr/webxr.ts`). The render loop already uses `renderer.setAnimationLoop`, so promoting WebXR is a localized change.
- **Hotspot / overlay layer.** `src/overlays/overlay-layer.ts` exposes `register({ id, lon, lat, element })` + per-frame projection via `latLonToScreen`.
- **Cubemap / EAC projections.** `src/projection/projection.ts` registry — drop a new file implementing the `Projection` interface to add them.
- **YouTube / Vimeo.** Architecturally not possible inside our WebGL sphere — see "Supported source formats" above.

## License

[MIT](./LICENSE) © 2026 Scaleflex
