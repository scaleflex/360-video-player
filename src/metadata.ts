/**
 * Public entry point for `@cloudimage/360-video/metadata`.
 *
 * Standalone, dependency-free helpers to read a source's Spherical Video
 * metadata (is it 360°, is it stereo, and how is it laid out) without booting
 * the WebGL player. The player uses the same code internally for its
 * `stereo: 'auto'` path, so an authoring UI that detects up front and the
 * viewer that renders can never disagree.
 *
 *   import { detectSphericalMetadata } from '@cloudimage/360-video/metadata';
 *   const meta = await detectSphericalMetadata(url, { maxMoovBytes: 512 * 1024 });
 *   // meta === null            → not MP4 / no range support (keep manual UI)
 *   // meta.spherical === true  → 360° source
 *   // meta.stereo === 'top-bottom' | 'side-by-side' | 'mono' | null
 *
 * Pure ES module (no Three.js), tree-shaken away for consumers who don't import
 * this subpath.
 */

export {
  detectSphericalMetadata,
  parseSphericalMetadataFromMoov,
  detectStereoLayout,
  parseStereoModeFromMoov,
} from './player/spherical-metadata';
export type { SphericalMetadata, DetectOptions } from './player/spherical-metadata';

export { classifyStereoAmbiguity } from './player/stereo-heuristic';
export type { StereoAmbiguity } from './player/stereo-heuristic';

export type { StereoLayout } from './core/types';
