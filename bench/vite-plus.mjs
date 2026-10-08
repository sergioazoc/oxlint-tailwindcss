// Check what /monorepo says about Vite+ against `vp lint`:
//
// - the plugin loads from the `lint` block of vite.config.ts (`jsPlugins`,
//   `settings.tailwindcss`, `rules`) and reports;
// - a nested `.oxlintrc.json` is NOT discovered: only the root config applies
//   (oxc#26763), so the rule it turns off still reports in that package;
// - Pattern A's `entryPoint` mapping still gives each package its own CSS:
//   a theme color is valid where its stylesheet applies and unknown elsewhere.
//
// Exits 1 on any disagreement.
//
// Usage: node vite-plus.mjs   (after `pnpm -C .. build`)
// Weekly with the latest vite-plus: .github/workflows/interop.yml.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BENCH = dirname(fileURLToPath(import.meta.url))
const REPO = join(BENCH, '..')
const VP = join(BENCH, 'node_modules/.bin', process.platform === 'win32' ? 'vp.cmd' : 'vp')
const LOCAL_DIST = join(REPO, 'packages/oxlint-tailwindcss/dist/index.cjs').replaceAll('\\', '/')

if (!existsSync(VP)) throw new Error('bench/node_modules is missing: run `npm ci` in bench/')
if (!existsSync(LOCAL_DIST)) throw new Error(`${LOCAL_DIST} is missing: run \`pnpm build\` first`)

const version = JSON.parse(
  readFileSync(join(BENCH, 'node_modules/vite-plus/package.json'), 'utf8'),
).version

// The project: a root app and one package with its own theme and nested config.
const project = join(BENCH, 'out/vite-plus')
rmSync(project, { recursive: true, force: true })
const write = (file, text) => {
  mkdirSync(dirname(join(project, file)), { recursive: true })
  writeFileSync(join(project, file), text)
}
write('package.json', JSON.stringify({ name: 'vp-interop', private: true, type: 'module' }))
write('app.css', '@import "tailwindcss";\n')
write('packages/web/styles/web.css', '@import "tailwindcss";\n@theme { --color-brand: #123456; }\n')
write(
  'vite.config.ts',
  `import { defineConfig } from 'vite-plus'

export default defineConfig({
  lint: {
    jsPlugins: [${JSON.stringify(LOCAL_DIST)}],
    settings: {
      tailwindcss: {
        entryPoint: [
          { files: 'packages/web/**', use: 'packages/web/styles/web.css' },
          { files: '**', use: 'app.css' },
        ],
      },
    },
    rules: {
      'tailwindcss/no-duplicate-classes': 'error',
      'tailwindcss/no-unknown-classes': 'error',
    },
  },
})
`,
)
write(
  'packages/web/.oxlintrc.json',
  JSON.stringify({
    jsPlugins: [LOCAL_DIST],
    rules: { 'tailwindcss/no-duplicate-classes': 'off' },
  }),
)
const module = (classes) => `export const C = () => <div className="${classes}" />\n`
write('src/root.tsx', module('flex flex'))
write('src/brand.tsx', module('bg-brand'))
write('packages/web/src/nested.tsx', module('p-4 p-4'))
write('packages/web/src/brand.tsx', module('bg-brand'))
// A repository of its own: bench/out/ is gitignored, and oxlint skips gitignored files.
execFileSync('git', ['init', '-q'], { cwd: project })

let stdout
try {
  stdout = execFileSync(VP, ['lint', '-f', 'json'], {
    cwd: project,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  if (typeof error.stdout !== 'string' || error.status !== 1) throw error
  stdout = error.stdout
}
const reports = JSON.parse(stdout).diagnostics.map(
  (d) => `${d.filename.replaceAll('\\', '/')} ${d.code}`,
)
const has = (file, rule) => reports.includes(`${file} tailwindcss(${rule})`)

const failures = [
  [has('src/root.tsx', 'no-duplicate-classes'), 'the plugin loads from vite.config.ts and reports'],
  [
    has('packages/web/src/nested.tsx', 'no-duplicate-classes'),
    'a nested .oxlintrc.json is not discovered (its "off" must not apply)',
  ],
  [has('src/brand.tsx', 'no-unknown-classes'), 'bg-brand is unknown under the root app.css'],
  [
    !has('packages/web/src/brand.tsx', 'no-unknown-classes'),
    'bg-brand is valid under the mapped packages/web/styles/web.css',
  ],
].filter(([ok]) => !ok)

console.log(`vite-plus ${version}: ${reports.length} reports`)
for (const [, claim] of failures) console.log(`  ✗ ${claim}`)
if (failures.length > 0) {
  console.log(reports.map((r) => `    ${r}`).join('\n'))
  process.exit(1)
}
console.log('  ✓ /monorepo agrees with vp lint')
