import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

/**
 * Build for the `/metadata` subpath — standalone Spherical Video metadata
 * helpers (`detectSphericalMetadata`, `classifyStereoAmbiguity`, …).
 *
 *   import { detectSphericalMetadata } from '@cloudimage/360-video/metadata';
 *
 * A pure ES module: it pulls in only `src/player/spherical-metadata.ts` +
 * `src/player/stereo-heuristic.ts` (which import types only), so nothing from
 * `three` / the render layer ends up in the bundle. Types are rolled up into a
 * single flat `dist/metadata.d.ts` (they are not part of the main `index.d.ts`).
 *
 * `emptyOutDir: false` — appends to `dist` produced by the first `build:bundle`.
 */
export default defineConfig({
  plugins: [
    // Non-rollup dts (like the /filerobot build): `rollupTypes` always rolls the
    // package's main entry (src/index.ts), so it can't emit a secondary entry's
    // declarations. We instead emit per-file `.d.ts` for just the metadata graph
    // — `dist/metadata.d.ts` plus its `player/*` + `core/types` dependencies.
    dts({
      include: [
        'src/metadata.ts',
        'src/player/spherical-metadata.ts',
        'src/player/stereo-heuristic.ts',
        'src/core/types.ts',
      ],
      tsconfigPath: resolve(__dirname, '../tsconfig.build.json'),
      outDir: resolve(__dirname, '../dist'),
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, '../src/metadata.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'metadata.js' : 'metadata.cjs'),
    },
    rollupOptions: {
      external: ['three', /^three\/.*/, 'hls.js', 'dashjs'],
      output: { inlineDynamicImports: true, exports: 'named' },
    },
    sourcemap: true,
    outDir: resolve(__dirname, '../dist'),
    emptyOutDir: false,
  },
  resolve: {
    alias: { '@': resolve(__dirname, '../src') },
  },
});
