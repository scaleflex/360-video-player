import type { CI360VideoConfig } from './types';

/**
 * Defaults are the source of truth — every config option mentioned in the
 * public types is given a concrete default here. Anything missing means it's
 * a required field (currently only `src`).
 */
export const DEFAULT_CONFIG: CI360VideoConfig = {
  src: '',

  projection: 'equirectangular',
  // 'auto' probes Spherical Video V2 (`st3d`) metadata on MP4 sources and
  // resolves to the declared layout; mono content (and non-MP4) stays mono.
  stereo: 'auto',
  // Manual format picker is shown only when relevant (ambiguous frame with no
  // metadata, or a stereo layout already active). See StereoMenuOption.
  stereoMenu: 'auto',
  lensFovDeg: 180,

  // playback
  autoplay: false,
  loop: false,
  muted: false,
  crossOrigin: 'anonymous',
  playerType: 'auto',

  // initial view + limits (degrees)
  initialLon: 0,
  initialLat: 0,
  fov: 75,
  fovMin: 30,
  fovMax: 100,
  latMin: -85,
  latMax: 85,

  // controls
  controls: true,
  dragToRotate: true,
  invertDrag: false,
  // 1.0 = pixel-perfect drag: cursor and texture move 1:1. Lower = slower / film-like;
  // higher = punchier. Most consumer 360 viewers sit in 0.8–1.5.
  rotateSpeed: 1.0,
  scrollToZoom: true,
  gyroscope: false,
  damping: true,
  dampingFactor: 0.1,
  autoRotate: false,
  // Degrees per second. Positive = clockwise (look right); negative = anti-clockwise.
  // 10 deg/s ≈ a full revolution every 36 seconds — perceptible but not dizzying.
  autoRotateSpeed: 10,
  // Idle wait before auto-rotate resumes after user input. 0 = drift immediately.
  autoRotateIdleDelay: 2000,

  // UI
  theme: 'dark',
  fullscreenButton: true,
  speedButton: true,
  qualityButton: true,
  vrButton: false, // extension point — disabled by default

  // perf
  sphereSegments: 64,
  pixelRatio: 2,
  antialias: true,
  autoLoad: true,

  // a11y
  alt: '360° video',
};

// ---- data-attribute coercion helpers ----

export function toBool(v: string): boolean {
  // Case-insensitive so author variants ('True', 'YES', 'On') aren't misread as
  // false. Empty string = a valueless boolean attribute (e.g. `muted`).
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on' || s === '';
}

export function toNumber(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

/** Coerce a tri-state attribute that accepts `true` / `false` / `'auto'`. */
export function toBoolOrAuto(v: string): boolean | 'auto' {
  return v.trim().toLowerCase() === 'auto' ? 'auto' : toBool(v);
}

/**
 * kebab-suffix ↔ camelCase config key map plus a coercion function. Shared by
 * the legacy `data-ci-360-video-*` reader and the `<ci-360-video>` custom
 * element (which reads the bare suffix as its attribute name). Adding a new
 * config option means adding a line here and a default above.
 */
export const ATTR_MAP: Record<string, { key: keyof CI360VideoConfig; coerce: (v: string) => unknown }> = {
  src:                    { key: 'src',                 coerce: String },
  projection:             { key: 'projection',          coerce: String },
  stereo:                 { key: 'stereo',              coerce: String },
  'stereo-menu':          { key: 'stereoMenu',          coerce: toBoolOrAuto },
  'lens-fov-deg':         { key: 'lensFovDeg',          coerce: toNumber },

  autoplay:               { key: 'autoplay',            coerce: toBool },
  loop:                   { key: 'loop',                coerce: toBool },
  muted:                  { key: 'muted',               coerce: toBool },
  poster:                 { key: 'poster',              coerce: String },
  'cross-origin':         { key: 'crossOrigin',         coerce: String },
  'player-type':          { key: 'playerType',          coerce: String },

  'initial-lon':          { key: 'initialLon',          coerce: toNumber },
  'initial-lat':          { key: 'initialLat',          coerce: toNumber },
  fov:                    { key: 'fov',                 coerce: toNumber },
  'fov-min':              { key: 'fovMin',              coerce: toNumber },
  'fov-max':              { key: 'fovMax',              coerce: toNumber },
  'lat-min':              { key: 'latMin',              coerce: toNumber },
  'lat-max':              { key: 'latMax',              coerce: toNumber },

  controls:               { key: 'controls',            coerce: toBool },
  'drag-to-rotate':       { key: 'dragToRotate',        coerce: toBool },
  'invert-drag':          { key: 'invertDrag',          coerce: toBool },
  'rotate-speed':         { key: 'rotateSpeed',         coerce: toNumber },
  'scroll-to-zoom':       { key: 'scrollToZoom',        coerce: toBool },
  gyroscope:              { key: 'gyroscope',           coerce: toBool },
  damping:                { key: 'damping',             coerce: toBool },
  'damping-factor':       { key: 'dampingFactor',       coerce: toNumber },
  'auto-rotate':          { key: 'autoRotate',          coerce: toBool },
  'auto-rotate-speed':    { key: 'autoRotateSpeed',     coerce: toNumber },

  theme:                  { key: 'theme',               coerce: String },
  'fullscreen-button':    { key: 'fullscreenButton',    coerce: toBool },
  'speed-button':         { key: 'speedButton',         coerce: toBool },
  'quality-button':       { key: 'qualityButton',       coerce: toBool },
  'vr-button':            { key: 'vrButton',            coerce: toBool },

  'sphere-segments':      { key: 'sphereSegments',      coerce: toNumber },
  'pixel-ratio':          { key: 'pixelRatio',          coerce: toNumber },
  antialias:              { key: 'antialias',           coerce: toBool },
  'auto-load':            { key: 'autoLoad',            coerce: toBool },

  alt:                    { key: 'alt',                 coerce: String },
};

/**
 * The kebab attribute names (suffixes) the custom element observes — i.e. every
 * key of {@link ATTR_MAP}. Used for `static get observedAttributes()`.
 */
export const OBSERVED_ATTRIBUTES = Object.keys(ATTR_MAP);

/** Coerce a single attribute value to its config `{ key, value }`, or null. */
export function coerceAttribute(
  suffix: string,
  value: string | null,
): { key: keyof CI360VideoConfig; value: unknown } | null {
  const mapping = ATTR_MAP[suffix];
  if (!mapping || value === null) return null;
  try {
    const coerced = mapping.coerce(value);
    if (coerced === undefined) return null;
    return { key: mapping.key, value: coerced };
  } catch (e) {
    console.warn(`CI360Video: failed to parse attribute "${suffix}":`, e);
    return null;
  }
}

/**
 * Parse attributes off an element into a partial config. `prefix` is prepended
 * to each kebab suffix: `''` for the bare `<ci-360-video>` element attributes,
 * `'data-ci-360-video-'` for the legacy `data-*` autoInit path. Unknown
 * attributes are ignored; malformed values warn and skip rather than throw.
 */
export function parseAttributes(element: HTMLElement, prefix = ''): Partial<CI360VideoConfig> {
  const config: Record<string, unknown> = {};

  for (const suffix of Object.keys(ATTR_MAP)) {
    const value = element.getAttribute(`${prefix}${suffix}`);
    const parsed = coerceAttribute(suffix, value);
    if (parsed) config[parsed.key] = parsed.value;
  }

  return config as Partial<CI360VideoConfig>;
}

/** Legacy `data-ci-360-video-*` reader (back-compat for `autoInit`). */
export function parseDataAttributes(element: HTMLElement): Partial<CI360VideoConfig> {
  return parseAttributes(element, 'data-ci-360-video-');
}

/**
 * Shallow merge: `userConfig` wins over defaults. `undefined` values are
 * skipped so callers can spread partial configs without overwriting defaults
 * with `undefined`.
 */
export function mergeConfig(userConfig: Partial<CI360VideoConfig>): CI360VideoConfig {
  const merged: CI360VideoConfig = { ...DEFAULT_CONFIG };
  for (const [key, value] of Object.entries(userConfig)) {
    if (value !== undefined) {
      (merged as any)[key] = value;
    }
  }
  return merged;
}

/**
 * Repair config values that would otherwise silently break the view rather
 * than just being "invalid". `validateConfig` only *reports*; the player
 * continues regardless, so a misconfigured `fovMin > fovMax` (or the latitude
 * equivalent) would feed `clamp(x, hi, lo)` and pin the view to a single value.
 * Here we swap inverted bounds so the clamp stays well-formed. Mutates and
 * returns the same object.
 */
export function normalizeConfig(config: CI360VideoConfig): CI360VideoConfig {
  if (
    config.fovMin !== undefined &&
    config.fovMax !== undefined &&
    config.fovMin > config.fovMax
  ) {
    [config.fovMin, config.fovMax] = [config.fovMax, config.fovMin];
  }
  if (
    config.latMin !== undefined &&
    config.latMax !== undefined &&
    config.latMin > config.latMax
  ) {
    [config.latMin, config.latMax] = [config.latMax, config.latMin];
  }
  return config;
}

/**
 * Returns an array of error strings — empty means "valid". Caller decides
 * whether to throw or log; the main class logs each error and continues so
 * a single bad option doesn't crash the player.
 */
export function validateConfig(config: CI360VideoConfig): string[] {
  const errors: string[] = [];

  // A source can come from either `src` or a non-empty `sources` array; only
  // complain when neither is present (and we're not deferring load).
  const hasSource = !!config.src || (config.sources?.length ?? 0) > 0;
  if (!hasSource && config.autoLoad !== false) {
    errors.push('config.src is required');
  }

  if (
    config.projection &&
    !['equirectangular', 'fisheye', 'dual-fisheye'].includes(config.projection)
  ) {
    errors.push(
      `Invalid projection: "${config.projection}". Must be one of: equirectangular, fisheye, dual-fisheye.`,
    );
  }
  if (config.lensFovDeg !== undefined && (config.lensFovDeg <= 0 || config.lensFovDeg > 360)) {
    errors.push(`lensFovDeg must be in (0, 360], got ${config.lensFovDeg}.`);
  }
  if (
    config.stereo &&
    !['auto', 'mono', 'top-bottom', 'side-by-side'].includes(config.stereo)
  ) {
    errors.push(
      `Invalid stereo: "${config.stereo}". Must be one of: auto, mono, top-bottom, side-by-side.`,
    );
  }
  if (
    config.stereoMenu !== undefined &&
    config.stereoMenu !== true &&
    config.stereoMenu !== false &&
    config.stereoMenu !== 'auto'
  ) {
    errors.push(`Invalid stereoMenu: "${config.stereoMenu}". Must be true, false, or "auto".`);
  }
  if (config.theme && !['light', 'dark'].includes(config.theme)) {
    errors.push(`Invalid theme: "${config.theme}". Must be "light" or "dark".`);
  }
  if (
    config.playerType &&
    !['auto', 'html5', 'hls', 'dash'].includes(config.playerType)
  ) {
    errors.push(`Invalid playerType: "${config.playerType}".`);
  }

  // FOV bounds: 0 < fov < 180.
  for (const field of ['fov', 'fovMin', 'fovMax'] as const) {
    const v = config[field];
    if (v !== undefined && (v <= 0 || v >= 180)) {
      errors.push(`${field} must be in (0, 180), got ${v}.`);
    }
  }
  if (
    config.fovMin !== undefined &&
    config.fovMax !== undefined &&
    config.fovMin > config.fovMax
  ) {
    errors.push(`fovMin (${config.fovMin}) must be ≤ fovMax (${config.fovMax}).`);
  }

  // Latitude bounds: -90 ≤ lat ≤ 90.
  for (const field of ['latMin', 'latMax', 'initialLat'] as const) {
    const v = config[field];
    if (v !== undefined && (v < -90 || v > 90)) {
      errors.push(`${field} must be in [-90, 90], got ${v}.`);
    }
  }
  if (
    config.latMin !== undefined &&
    config.latMax !== undefined &&
    config.latMin > config.latMax
  ) {
    errors.push(`latMin (${config.latMin}) must be ≤ latMax (${config.latMax}).`);
  }

  if (config.sphereSegments !== undefined && config.sphereSegments < 8) {
    errors.push(`sphereSegments must be ≥ 8, got ${config.sphereSegments}.`);
  }
  if (config.pixelRatio !== undefined && config.pixelRatio <= 0) {
    errors.push(`pixelRatio must be positive, got ${config.pixelRatio}.`);
  }
  if (config.rotateSpeed !== undefined && config.rotateSpeed < 0) {
    errors.push(`rotateSpeed must be non-negative, got ${config.rotateSpeed}.`);
  }
  if (
    config.dampingFactor !== undefined &&
    (config.dampingFactor <= 0 || config.dampingFactor > 1)
  ) {
    errors.push(`dampingFactor must be in (0, 1], got ${config.dampingFactor}.`);
  }

  return errors;
}
