/**
 * Frame-aspect heuristic for *suspecting* a stereo layout when metadata is
 * absent.
 *
 * This is deliberately a "should we offer help?" signal, **not** a render
 * decision. A monoscopic equirectangular 360° frame is 2:1. The two common
 * stereo packings change that ratio in a recognisable way:
 *
 *   - **top-bottom**: two 2:1 frames stacked vertically → the file is ~**1:1**.
 *   - **side-by-side**: two 2:1 frames placed horizontally → the file is ~**4:1**.
 *
 * We never auto-pick a layout from this, because the signal is ambiguous: a
 * monoscopic **180°** equirect frame is also ~1:1, indistinguishable from a
 * top-bottom 360° one by shape alone. So the classifier only reports a
 * *candidate* — the caller uses it to surface a dev hint and/or the manual
 * format picker, and a human makes the final call.
 */

export type StereoAmbiguity = 'mono' | 'tb-candidate' | 'sbs-candidate';

// Bands around the canonical aspect ratios (1:1, 2:1, 4:1). Generous enough to
// absorb non-square pixels and light letterboxing, tight enough that a normal
// 2:1 panorama never trips a candidate. The mono band (the gap between the TB
// and SBS windows) covers the 2:1 case and anything else we shouldn't nag about.
const TB_MIN = 0.8;
const TB_MAX = 1.25;
const SBS_MIN = 3.2;
const SBS_MAX = 4.8;

/**
 * Classify a video frame's width/height into a stereo *suspicion*.
 *
 * Returns `'mono'` for the normal 2:1 panorama (and for any shape we shouldn't
 * second-guess, including unknown/zero dimensions). Returns a `*-candidate`
 * only when the frame's aspect ratio matches a stereo packing closely enough to
 * be worth offering the user a manual override.
 */
export function classifyStereoAmbiguity(width: number, height: number): StereoAmbiguity {
  // Unknown or degenerate dimensions — can't tell, don't nag.
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'mono';
  }
  const ratio = width / height;
  if (ratio >= TB_MIN && ratio <= TB_MAX) return 'tb-candidate';
  if (ratio >= SBS_MIN && ratio <= SBS_MAX) return 'sbs-candidate';
  return 'mono';
}
