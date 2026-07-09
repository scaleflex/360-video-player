import { describe, it, expect } from 'vitest';
import * as metadata from '../src/metadata';

// The `/metadata` subpath is the public surface authoring UIs import. Guard that
// every helper stays exported (a rename here is a breaking change for consumers).
describe('@cloudimage/360-video/metadata entry', () => {
  it('exposes the detection helpers', () => {
    expect(typeof metadata.detectSphericalMetadata).toBe('function');
    expect(typeof metadata.parseSphericalMetadataFromMoov).toBe('function');
    expect(typeof metadata.detectStereoLayout).toBe('function');
    expect(typeof metadata.parseStereoModeFromMoov).toBe('function');
    expect(typeof metadata.classifyStereoAmbiguity).toBe('function');
  });

  it('re-exports the pure heuristic that classifies frame shape', () => {
    expect(metadata.classifyStereoAmbiguity(1000, 1000)).toBe('tb-candidate');
    expect(metadata.classifyStereoAmbiguity(4000, 1000)).toBe('sbs-candidate');
    expect(metadata.classifyStereoAmbiguity(2000, 1000)).toBe('mono');
  });
});
