import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // Bundle `@oxlint/plugins` into the dist instead of leaving it external.
  // We only consume `definePlugin`/`defineRule` (identity no-ops) and the
  // `ESTree` types — nothing with runtime state or coupling to the host
  // oxlint version. Bundling them makes the published package self-contained:
  // `pnpm add -D oxlint-tailwindcss` works with no peer/runtime dep to install
  // (issue #50). The real runtime deps (@tailwindcss/node, tailwindcss) stay
  // external — they're heavy and shareable.
  // `onlyBundle` states the other half of the invariant: this is the ONLY
  // dependency that may end up inside the tarball. Without it tsdown warns on
  // every build that something was bundled and asks whether it was intended —
  // and a future dependency would be silently inlined instead of caught here.
  deps: { alwaysBundle: ['@oxlint/plugins'], onlyBundle: ['@oxlint/plugins'] },
  // Disable the declaration-map too (rolldown-plugin-dts emits *.d.*.map and an
  // index.mjs.map otherwise), so the published tarball carries no sourcemaps.
  dts: { sourcemap: false },
  clean: true,
  // No sourcemaps in the published tarball — they'd add a multi-hundred-KB
  // *.map per format with no value to consumers of a linter plugin.
  sourcemap: false,
})
