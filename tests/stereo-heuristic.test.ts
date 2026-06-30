import { describe, it, expect } from 'vitest';
import { classifyStereoAmbiguity } from '../src/player/stereo-heuristic';

describe('classifyStereoAmbiguity', () => {
  it('normal 2:1 equirectangular panorama → mono (no nag)', () => {
    expect(classifyStereoAmbiguity(4096, 2048)).toBe('mono');
    expect(classifyStereoAmbiguity(1920, 960)).toBe('mono');
  });

  it('square 1:1 frame → top-bottom candidate', () => {
    // Two stacked 2:1 frames: 4096×4096.
    expect(classifyStereoAmbiguity(4096, 4096)).toBe('tb-candidate');
    expect(classifyStereoAmbiguity(2048, 2048)).toBe('tb-candidate');
  });

  it('4:1 frame → side-by-side candidate', () => {
    // Two horizontally-packed 2:1 frames: 8192×2048.
    expect(classifyStereoAmbiguity(8192, 2048)).toBe('sbs-candidate');
    expect(classifyStereoAmbiguity(7680, 1920)).toBe('sbs-candidate');
  });

  it('mono 180° (also ~1:1) is reported as a TB candidate — ambiguous by shape', () => {
    // We intentionally cannot distinguish mono-180 from TB-360 by aspect alone;
    // flagging it as a candidate (offer the menu) is the correct conservative move.
    expect(classifyStereoAmbiguity(2880, 2880)).toBe('tb-candidate');
  });

  it('band edges classify on the expected side', () => {
    expect(classifyStereoAmbiguity(80, 100)).toBe('tb-candidate'); // 0.8 — TB lower edge
    expect(classifyStereoAmbiguity(125, 100)).toBe('tb-candidate'); // 1.25 — TB upper edge
    expect(classifyStereoAmbiguity(150, 100)).toBe('mono'); // 1.5 — between TB and mono
    expect(classifyStereoAmbiguity(300, 100)).toBe('mono'); // 3.0 — just below SBS
    expect(classifyStereoAmbiguity(320, 100)).toBe('sbs-candidate'); // 3.2 — SBS lower edge
    expect(classifyStereoAmbiguity(480, 100)).toBe('sbs-candidate'); // 4.8 — SBS upper edge
  });

  it('very wide / very tall / portrait shapes → mono (not stereo candidates)', () => {
    expect(classifyStereoAmbiguity(10000, 1000)).toBe('mono'); // 10:1
    expect(classifyStereoAmbiguity(1080, 1920)).toBe('mono'); // portrait phone
  });

  it('unknown or degenerate dimensions → mono (never throws, never nags)', () => {
    expect(classifyStereoAmbiguity(0, 0)).toBe('mono');
    expect(classifyStereoAmbiguity(1920, 0)).toBe('mono');
    expect(classifyStereoAmbiguity(-1, -1)).toBe('mono');
    expect(classifyStereoAmbiguity(NaN, 100)).toBe('mono');
  });
});
