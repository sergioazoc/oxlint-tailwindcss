/**
 * Synchronous design system loader using execFileSync.
 *
 * The problem: __unstable__loadDesignSystem is async, but oxlint's createOnce is sync.
 * The solution: spawn a child process that loads the design system, pre-computes all
 * data we need, and returns it as JSON via stdout. This runs ONCE at plugin init time.
 *
 * For arbitrary values (bg-[#123]) that aren't in the class list, we use heuristics.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { DesignSystemLoadError } from '../utils/fatal'
import { TAILWIND_NODE_PATH, TAILWIND_NODE_VERSION } from './tailwind-node'

export interface PrecomputedData {
  /** All valid class names (candidatesToCss returned non-null) */
  validClasses: string[]
  /** className → canonical form (only entries where canonical differs) */
  canonical: Record<string, string>
  /** className → sort order as string (BigInt serialized) */
  order: Record<string, string>
  /** className → CSS property names affected */
  cssProps: Record<string, string[]>
  /** variant name → sort index from the design system */
  variantOrder: Record<string, number>
  /** Classes from @layer components and modifier classes referenced via [class~="..."] */
  componentClasses: string[]
  /** arbitraryForm → namedClass for unnecessary arbitrary value detection */
  arbitraryEquivalents: Record<string, string>
}

const PRECOMPUTE_SCRIPT = `
// Resolve @tailwindcss/node via an absolute path passed in by the parent
// process — bare-specifier lookup from this child's cwd fails under pnpm
// strict workspaces (the module lives under node_modules/.pnpm/... which
// is not on the resolution path from the consumer's project root).
const { __unstable__loadDesignSystem } = require(process.env.TAILWIND_NODE_PATH);
const { readFileSync } = require('fs');
const { dirname, resolve } = require('path');

function resolveImport(specifier, baseDir) {
  // Relative import: ./file.css, ../file.css
  if (specifier.startsWith('.')) return resolve(baseDir, specifier);
  // Package import: tw-animate-css, @scope/pkg
  const { join } = require('path');
  const { existsSync } = require('fs');
  // Walk up to find node_modules (monorepo support)
  let dir = baseDir;
  while (true) {
    const pkgDir = join(dir, 'node_modules', specifier);
    if (existsSync(pkgDir)) {
      // Read package.json to find CSS entry (main, style, exports.style)
      try {
        const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
        const entry = pkg.style || pkg.main || '';
        if (entry.endsWith('.css')) return resolve(pkgDir, entry);
        // Check exports["."].style
        const exp = pkg.exports && pkg.exports['.'];
        const styleEntry = typeof exp === 'object' && exp !== null ? exp.style : null;
        if (styleEntry) return resolve(pkgDir, styleEntry);
      } catch {}
      // Fallback: try common CSS filenames
      const fallbacks = ['index.css', 'dist/index.css', 'style.css', 'styles.css'];
      for (const f of fallbacks) {
        const p = join(pkgDir, f);
        if (existsSync(p)) return p;
      }
      return null;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function extractComponentClasses(cssPath, baseDir) {
  let css;
  try { css = readFileSync(cssPath, 'utf-8'); } catch { return []; }
  const files = [css];
  const importRe = /@import\\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(css)) !== null) {
    const resolved = resolveImport(m[1], baseDir);
    if (resolved) {
      try { files.push(readFileSync(resolved, 'utf-8')); } catch {}
    }
  }
  const result = [];
  for (const content of files) {
    // Scan both @layer components AND @layer utilities
    const layerRe = /@layer\\s+(?:components|utilities)\\s*\\{/g;
    let lm;
    while ((lm = layerRe.exec(content)) !== null) {
      let depth = 1, i = lm.index + lm[0].length;
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++;
        if (content[i] === '}') depth--;
        i++;
      }
      const block = content.slice(lm.index + lm[0].length, i - 1);
      const selRe = /\\.([\\w-]+)/g;
      let sm;
      while ((sm = selRe.exec(block)) !== null) result.push(sm[1]);
    }
    // Scan all class selectors anywhere in the file (.class-name)
    const classSelRe = /\\.([a-zA-Z_][\\w-]*)/g;
    let cs;
    while ((cs = classSelRe.exec(content)) !== null) result.push(cs[1]);
  }
  return [...new Set(result)];
}

async function main() {
  const cssPath = process.env.TAILWIND_CSS_PATH;
  const css = readFileSync(cssPath, 'utf-8');
  const base = dirname(cssPath);
  const ds = await __unstable__loadDesignSystem(css, { base });

  const entries = ds.getClassList();
  const classNames = entries.map(e => e[0]);

  // Index for O(1) lookups by class name (avoids O(N) indexOf/includes in later phases)
  const classNameIndex = new Map();
  for (let i = 0; i < classNames.length; i++) classNameIndex.set(classNames[i], i);

  // Validity: which classes produce CSS
  const cssResults = ds.candidatesToCss(classNames);
  const validClasses = classNames.filter((_, i) => cssResults[i] != null);

  // Expand: validate extra candidates not in getClassList() but valid in v4
  const validSet = new Set(validClasses);
  const knownPrefixes = new Set();
  for (const cls of validClasses) {
    const dash = cls.lastIndexOf('-');
    if (dash > 0) knownPrefixes.add(cls.slice(0, dash));
  }
  const extraCandidates = [];
  const breakpoints = ['sm', 'md', 'lg', 'xl', '2xl'];
  for (const prefix of knownPrefixes) {
    // Bare utilities: rounded, shadow, blur, etc.
    if (!validSet.has(prefix)) extraCandidates.push(prefix);
    // Screen breakpoint variants: max-w-screen-lg, etc.
    for (const bp of breakpoints) {
      const candidate = prefix + '-screen-' + bp;
      if (!validSet.has(candidate)) extraCandidates.push(candidate);
    }
  }
  if (extraCandidates.length > 0) {
    const extraResults = ds.candidatesToCss(extraCandidates);
    for (let i = 0; i < extraCandidates.length; i++) {
      if (extraResults[i] != null) {
        validClasses.push(extraCandidates[i]);
        validSet.add(extraCandidates[i]);
      }
    }
  }

  // Marker classes: group/peer don't produce CSS but enable group-hover:/peer-checked: variants
  const allVariants = ds.getVariants();
  for (const v of allVariants) {
    if (v.name === 'group' || v.name.startsWith('group-')) {
      validClasses.push('group'); validSet.add('group'); break;
    }
  }
  for (const v of allVariants) {
    if (v.name === 'peer' || v.name.startsWith('peer-')) {
      validClasses.push('peer'); validSet.add('peer'); break;
    }
  }

  // Named groups/peers: group/name, peer/name — the /name part is user-defined
  // These are validated by the variant system, not by candidatesToCss

  // Canonical forms (only store diffs)
  // NOTE: canonicalizeCandidates deduplicates, so we must call it one class at a time
  const canonical = {};
  for (const cls of classNames) {
    const result = ds.canonicalizeCandidates([cls]);
    if (result[0] && result[0] !== cls) {
      canonical[cls] = result[0];
    }
  }

  // Legacy v3 classes that produce valid CSS in v4 but are not enumerated by
  // getClassList(). Tailwind's canonicalizeCandidates() still rewrites them to
  // their v4 equivalent, so we feed them in explicitly. Without this pass,
  // classes like \`break-words\` would be invisible to enforce-canonical
  // (issue #16).
  // - Fixed renames mirror the internal v3->v4 map in tailwindcss/canonicalize.
  // - Pattern renames (start-* -> inset-s-*, end-* -> inset-e-*) are derived
  //   from the inset-{s,e}-* utilities present in validClasses so we cover
  //   every numeric/named value the design system exposes.
  const legacyCandidates = [
    'order-none',
    'break-words',
    'overflow-ellipsis',
    'flex-grow', 'flex-grow-0', 'flex-grow-1',
    'flex-shrink', 'flex-shrink-0', 'flex-shrink-1',
    'decoration-clone', 'decoration-slice',
    'bg-gradient-to-t', 'bg-gradient-to-tr', 'bg-gradient-to-r', 'bg-gradient-to-br',
    'bg-gradient-to-b', 'bg-gradient-to-bl', 'bg-gradient-to-l', 'bg-gradient-to-tl',
  ];
  for (const cls of validClasses) {
    if (cls.startsWith('inset-s-')) legacyCandidates.push('start-' + cls.slice(8));
    else if (cls.startsWith('-inset-s-')) legacyCandidates.push('-start-' + cls.slice(9));
    else if (cls.startsWith('inset-e-')) legacyCandidates.push('end-' + cls.slice(8));
    else if (cls.startsWith('-inset-e-')) legacyCandidates.push('-end-' + cls.slice(9));
  }
  const legacyToProcess = legacyCandidates.filter(cls => !validSet.has(cls));
  if (legacyToProcess.length > 0) {
    const legacyCssResults = ds.candidatesToCss(legacyToProcess);
    for (let i = 0; i < legacyToProcess.length; i++) {
      if (legacyCssResults[i] == null) continue;
      const cls = legacyToProcess[i];
      const result = ds.canonicalizeCandidates([cls]);
      if (result[0] && result[0] !== cls) {
        canonical[cls] = result[0];
      }
      // Mark as valid so no-unknown-classes doesn't flag legacy spellings.
      validClasses.push(cls);
      validSet.add(cls);
    }
  }

  // Sort order — include extra candidates so bare utilities (rounded, blur, etc.) get order
  const allForOrder = [...classNames];
  for (const cls of validClasses) {
    if (!classNameIndex.has(cls)) allForOrder.push(cls);
  }
  const order = {};
  const orderResults = ds.getClassOrder(allForOrder);
  for (const [name, val] of orderResults) {
    if (val !== null) order[name] = val.toString();
  }

  // CSS properties per class — extract only from the ROOT selector, not descendant selectors.
  // Plugin classes like "prose" generate CSS for both the root element (.prose { color: ...; })
  // and descendant selectors (:where(.prose pre) { overflow-x: auto; }).
  // Only root-level properties should be used for conflict detection.
  const cssProps = {};
  const atPropertyDescriptors = new Set(['syntax', 'inherits', 'initial-value']);

  function extractRootCssProps(cssText, className) {
    const rootProps = [];
    const allProps = [];
    // CSS-escape special chars in class name for selector matching
    const escapedName = className.replace(/([^\\w-])/g, '\\\\$1');
    const classSelector = '.' + escapedName;
    const rawSelector = '.' + className;
    const propRe = /^\\s+([\\w-]+)\\s*:/gm;

    function isRoot(sel) {
      for (const s of [classSelector, rawSelector]) {
        if (sel === s) return true;
        if (sel.length > s.length && sel.startsWith(s) && sel[s.length] === ':') return true;
      }
      return false;
    }

    // Extract only top-level declarations from a block body (skip nested blocks).
    // For CSS nesting like .prose { color: ...; :where(a) { color: ...; } },
    // only extracts "color" from the top level, not from the nested :where(a) block.
    function extractTopLevelProps(body) {
      const props = [];
      let depth = 0;
      let lineStart = 0;
      for (let i = 0; i <= body.length; i++) {
        if (i === body.length || body[i] === '\\n') {
          if (depth === 0) {
            const line = body.slice(lineStart, i);
            const m = /^\\s+([\\w-]+)\\s*:/.exec(line);
            if (m && !atPropertyDescriptors.has(m[1])) props.push(m[1]);
          }
          lineStart = i + 1;
        } else if (body[i] === '{') {
          depth++;
        } else if (body[i] === '}') {
          depth--;
        }
      }
      return props;
    }

    function processText(text) {
      let i = 0;
      while (i < text.length) {
        while (i < text.length && /\\s/.test(text[i])) i++;
        if (i >= text.length) break;
        const braceIdx = text.indexOf('{', i);
        if (braceIdx === -1) break;
        const selector = text.slice(i, braceIdx).trim();
        let depth = 1, j = braceIdx + 1;
        while (j < text.length && depth > 0) {
          if (text[j] === '{') depth++;
          if (text[j] === '}') depth--;
          j++;
        }
        const body = text.slice(braceIdx + 1, j - 1);
        if (selector.startsWith('@media') || selector.startsWith('@supports') || selector.startsWith('@layer')) {
          processText(body);
        } else if (!selector.startsWith('@')) {
          propRe.lastIndex = 0;
          let m;
          while ((m = propRe.exec(body)) !== null) {
            if (!atPropertyDescriptors.has(m[1])) allProps.push(m[1]);
          }
          if (isRoot(selector)) rootProps.push(...extractTopLevelProps(body));
        }
        i = j;
      }
    }

    processText(cssText);
    // Use root-only properties when found; fall back to all for classes with
    // escaped selectors or single-block output where root matching may miss.
    const result = rootProps.length > 0 ? rootProps : allProps;
    return [...new Set(result)];
  }

  for (let i = 0; i < classNames.length; i++) {
    if (cssResults[i]) {
      const props = extractRootCssProps(cssResults[i], classNames[i]);
      if (props.length > 0) cssProps[classNames[i]] = props;
    }
  }

  // Variant ordering from the design system
  const variantOrder = {};
  const variants = ds.getVariants();
  for (let i = 0; i < variants.length; i++) {
    if (!variants[i].isArbitrary) {
      variantOrder[variants[i].name] = i;
    }
  }

  // Component classes from @layer components
  const componentClasses = extractComponentClasses(cssPath, base);

  // Extract class names from attribute selectors [class~="..."] in CSS output.
  // Plugins like @tailwindcss/typography use these for modifier classes (e.g. "not-prose")
  // that don't generate their own CSS but are referenced in other classes' selectors.
  const attrClassRe = /\\[class~="([^"]+)"\\]/g;
  for (let i = 0; i < cssResults.length; i++) {
    if (cssResults[i]) {
      let acm;
      attrClassRe.lastIndex = 0;
      while ((acm = attrClassRe.exec(cssResults[i])) !== null) {
        componentClasses.push(acm[1]);
      }
    }
  }

  // Arbitrary equivalents: map arbitrary forms to named equivalents.
  // Enumerate every dash split point so multi-segment utilities (e.g.
  // bg-card-foreground) emit candidates for every prefix; lastIndexOf
  // alone drops the shorter prefix and misses multi-segment mappings.
  // Start at indexOf('-', 1) so negative utilities (e.g. -translate-x-1)
  // keep their leading '-' in every prefix instead of producing '' + '-[…]'.
  const arbitraryEquivalents = {};
  const candidates = [];
  for (const cls of validClasses) {
    if (cls.includes('[') || cls.includes('/')) continue;
    const idx = classNameIndex.get(cls);
    if (idx === undefined) continue;
    const cssText = cssResults[idx];
    if (!cssText) continue;
    const pvMatch = cssText.match(/^\\s+([\\w-]+)\\s*:\\s*(.+?)\\s*;?\\s*$/m);
    if (!pvMatch) continue;
    const value = pvMatch[2].trim().replace(/;$/, '');
    for (let dashPos = cls.indexOf('-', 1); dashPos > 0; dashPos = cls.indexOf('-', dashPos + 1)) {
      const prefix = cls.slice(0, dashPos);
      candidates.push({ arbitraryForm: prefix + '-[' + value + ']', namedCls: cls, namedCss: cssText });
    }
  }
  function extractDeclarations(css) {
    const openBrace = css.indexOf('{');
    const closeBrace = css.lastIndexOf('}');
    if (openBrace === -1 || closeBrace === -1) return css;
    return css.slice(openBrace + 1, closeBrace).replace(/\\s+/g, ' ').trim();
  }
  if (candidates.length > 0) {
    const arbForms = candidates.map(c => c.arbitraryForm);
    const arbResults = ds.candidatesToCss(arbForms);
    for (let i = 0; i < candidates.length; i++) {
      if (!arbResults[i]) continue;
      if (extractDeclarations(arbResults[i]) === extractDeclarations(candidates[i].namedCss)) {
        arbitraryEquivalents[candidates[i].arbitraryForm] = candidates[i].namedCls;
      }
    }
  }

  process.stdout.write(JSON.stringify({ validClasses, canonical, order, cssProps, variantOrder, componentClasses, arbitraryEquivalents }));
}
main().catch(e => { process.stderr.write(e.message); process.exit(1); });
`

const CACHE_DIR = join(tmpdir(), 'oxlint-tailwindcss')

/**
 * Cache key derived from:
 *   - md5(PRECOMPUTE_SCRIPT): auto-invalidates when our precompute logic changes,
 *     since the shape and content of the cached JSON is fully determined by what
 *     this script prints to stdout.
 *   - @tailwindcss/node version: auto-invalidates when the consumer upgrades
 *     tailwindcss (e.g. 4.2 → 4.3 adding `zoom-*`, `tab-*`, `scrollbar-*` etc.),
 *     so `validClasses`, `cssProps`, `canonical`, and `arbitraryEquivalents`
 *     reflect the installed version. @tailwindcss/node and tailwindcss are
 *     published together, so their versions match.
 */
export function computeCacheKey(scriptContent: string, tailwindVersion: string): string {
  const scriptHash = createHash('md5').update(scriptContent).digest('hex').slice(0, 8)
  return `${scriptHash}:${tailwindVersion}`
}

const CACHE_KEY = computeCacheKey(PRECOMPUTE_SCRIPT, TAILWIND_NODE_VERSION)

/**
 * Single-level disk cache keyed by content hash only.
 *
 * `loader.ts` keeps a per-process in-memory cache keyed by `(path, mtime)`
 * to avoid re-stat'ing the same file repeatedly. The disk cache lives in
 * `os.tmpdir()/oxlint-tailwindcss/` and is shared across processes — and
 * across packages in a monorepo, since two packages with identical CSS
 * content produce the same hash.
 *
 * v1 removed the legacy two-level cache (mtime-keyed `.idx` files →
 * content-keyed `.json`). The fast path it provided is duplicated by the
 * in-memory mtime check in loader.ts; storing it on disk too created the
 * possibility of mtime/content drift that could serve stale data.
 */

export const DEFAULT_LOAD_TIMEOUT_MS = 60_000

function computeContentHash(content: string): string {
  return createHash('md5').update(`${CACHE_KEY}:${content}`).digest('hex')
}

function getContentCachePath(contentHash: string): string {
  return join(CACHE_DIR, `${contentHash}.json`)
}

/**
 * The on-disk cache artifacts for a CSS entry point: the precomputed `json`
 * and the coordination `lock`. Exposed for tests that exercise the
 * cold-cache fork coordination (issue #24).
 */
export function cacheArtifactPaths(cssPath: string): { json: string; lock: string } {
  const content = readFileSync(resolve(cssPath), 'utf-8')
  const hash = computeContentHash(content)
  return { json: getContentCachePath(hash), lock: join(CACHE_DIR, `${hash}.lock`) }
}

function tryReadCache(cachePath: string): PrecomputedData | null {
  const raw = tryReadRawCache(cachePath)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as PrecomputedData
  } catch {
    return null
  }
}

function tryReadRawCache(cachePath: string): string | null {
  try {
    return readFileSync(cachePath, 'utf-8')
  } catch {
    return null
  }
}

function writeCacheFile(contentCachePath: string, data: string): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(contentCachePath, data)
  } catch {
    // Non-fatal — cache is optional
  }
}

// --- Cross-isolate fork coordination (issue #24) ---
//
// oxlint lints files across parallel isolates. On a cold cache they would all
// reach `loadDesignSystemSync` for the same CSS at once, and each used to fork
// its own `execFileSync` Node child to precompute the design system. A dozen
// simultaneous forks — each loading `@tailwindcss/node` — exhausted memory on
// constrained hosts (`spawnSync … ENOMEM`, reported on WSL).
//
// The fix: a content-hash-scoped file lock. The first isolate to create the
// lock forks the precompute child and writes the cache; the others busy-wait
// for the resulting `.json` instead of forking. Coordination is keyed by
// content hash, so distinct CSS files still precompute in parallel.

const LOCK_POLL_MS = 50

// Reused zero-initialized buffer for synchronous sleeps. `Atomics.wait` blocks
// the calling thread for up to `ms` because nothing ever notifies index 0.
const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4))

function syncSleep(ms: number): void {
  Atomics.wait(SLEEP_BUFFER, 0, 0, ms)
}

/** Age of the lock file in ms, or Infinity if it has already vanished. */
function lockAgeMs(lockPath: string): number {
  try {
    return Date.now() - statSync(lockPath).mtimeMs
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function tryUnlink(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // Already gone, or not ours to remove — either way, nothing to do.
  }
}

/** Fork the precompute child once. Throws `DesignSystemLoadError` on failure. */
function runPrecompute(resolvedPath: string, tailwindNodePath: string, timeout: number): string {
  try {
    return execFileSync(process.execPath, ['-e', PRECOMPUTE_SCRIPT], {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 50 * 1024 * 1024,
      env: {
        ...process.env,
        TAILWIND_CSS_PATH: resolvedPath,
        TAILWIND_NODE_PATH: tailwindNodePath,
      },
      cwd: dirname(resolvedPath),
    })
  } catch (cause) {
    const causeError = cause instanceof Error ? cause : undefined
    const message = causeError?.message ?? String(cause)
    throw new DesignSystemLoadError(
      `Failed to precompute design system from "${resolvedPath}": ${message}`,
      'Check the CSS file for syntax errors. If this looks like a timeout, raise `settings.tailwindcss.timeout`.',
      { cause: causeError },
    )
  }
}

/**
 * Return the raw precompute JSON for `contentHash`, forking at most one child
 * across all isolates competing for the same hash. Whoever wins the lock
 * computes and writes the cache; the rest wait for that file.
 */
function computeWithLock(
  resolvedPath: string,
  tailwindNodePath: string,
  contentHash: string,
  cachePath: string,
  timeout: number,
): string {
  const lockPath = join(CACHE_DIR, `${contentHash}.lock`)
  // A healthy holder is busy inside execFileSync (up to `timeout`); only treat
  // the lock as abandoned once it outlives that window plus a write margin.
  const staleMs = timeout + 30_000

  try {
    mkdirSync(CACHE_DIR, { recursive: true })
  } catch {
    // If we can't even create the cache dir, locking is impossible — fall back
    // to an uncoordinated compute rather than spin forever.
    return runPrecompute(resolvedPath, tailwindNodePath, timeout)
  }

  const start = Date.now()
  for (;;) {
    // A peer may have finished while we looped.
    const raw = tryReadRawCache(cachePath)
    if (raw !== null) return raw

    let lockFd: number
    try {
      lockFd = openSync(lockPath, 'wx')
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
        // Someone else holds it. Reclaim if stale, or if we've waited well past
        // the point a healthy holder should have produced the cache.
        if (lockAgeMs(lockPath) > staleMs || Date.now() - start > staleMs * 2) {
          tryUnlink(lockPath)
        } else {
          syncSleep(LOCK_POLL_MS)
        }
        continue
      }
      // Lock dir not writable or similar — degrade to uncoordinated compute.
      return runPrecompute(resolvedPath, tailwindNodePath, timeout)
    }

    try {
      const stdout = runPrecompute(resolvedPath, tailwindNodePath, timeout)
      writeCacheFile(cachePath, stdout)
      return stdout
    } finally {
      closeSync(lockFd)
      tryUnlink(lockPath)
    }
  }
}

/**
 * Synchronously load and precompute the design system for a CSS file.
 *
 * Throws `DesignSystemLoadError` on any failure (missing file, child
 * process error, missing `@tailwindcss/node`, etc.). Callers catch via
 * `reportFatalDsError` to surface a single Program-level diagnostic.
 */
export function loadDesignSystemSync(cssPath: string, timeout?: number): PrecomputedData {
  const resolvedPath = resolve(cssPath)

  let content: string
  try {
    content = readFileSync(resolvedPath, 'utf-8')
  } catch (cause) {
    throw new DesignSystemLoadError(
      `Could not read CSS entry point: ${resolvedPath}`,
      'Verify the path resolves from the oxlint working directory and the file is readable.',
      { cause: cause instanceof Error ? cause : undefined },
    )
  }

  const contentHash = computeContentHash(content)
  const contentCachePath = getContentCachePath(contentHash)

  const cached = tryReadCache(contentCachePath)
  if (cached) return cached

  // The child process receives @tailwindcss/node's absolute path via env.
  // Bare-specifier resolution from the child's cwd would fail under pnpm
  // strict workspaces where the consumer's project root has no direct
  // access to the plugin's transitive deps.
  if (TAILWIND_NODE_PATH === null) {
    throw new DesignSystemLoadError(
      `Could not resolve '@tailwindcss/node' while loading "${resolvedPath}".`,
      "Install '@tailwindcss/node' (or upgrade oxlint-tailwindcss) and re-run.",
    )
  }

  // Coordinate parallel isolates: at most one forks the precompute child for a
  // given content hash; the rest wait for the cache file it writes. Prevents
  // the cold-cache fork storm that exhausted memory on WSL (issue #24).
  const stdout = computeWithLock(
    resolvedPath,
    TAILWIND_NODE_PATH,
    contentHash,
    contentCachePath,
    timeout ?? DEFAULT_LOAD_TIMEOUT_MS,
  )

  try {
    return JSON.parse(stdout) as PrecomputedData
  } catch (cause) {
    throw new DesignSystemLoadError(
      `Precompute output for "${resolvedPath}" was not valid JSON.`,
      'This is likely a bug in oxlint-tailwindcss. Please open an issue with the CSS that triggered it.',
      { cause: cause instanceof Error ? cause : undefined },
    )
  }
}

// validateCandidatesSync removed — runtime child process calls were too slow.
// Unknown classes are now handled via precomputed expansion + heuristics in cache.isValid().
