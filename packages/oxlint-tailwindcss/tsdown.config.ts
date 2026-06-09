import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // Disable the declaration-map too (rolldown-plugin-dts emits *.d.*.map and an
  // index.mjs.map otherwise), so the published tarball carries no sourcemaps.
  dts: { sourcemap: false },
  clean: true,
  // No sourcemaps in the published tarball — they'd add a multi-hundred-KB
  // *.map per format with no value to consumers of a linter plugin.
  sourcemap: false,
})
