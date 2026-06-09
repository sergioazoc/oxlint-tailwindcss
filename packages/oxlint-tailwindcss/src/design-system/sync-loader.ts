/**
 * Synchronous design system loader using a worker_thread.
 *
 * The problem: __unstable__loadDesignSystem is async, but oxlint's createOnce is sync.
 * The solution: run the design-system load + precompute in a worker_thread that writes
 * the result JSON straight to the disk cache and signals completion over a
 * SharedArrayBuffer, while the main thread blocks on `Atomics.wait`. This runs ONCE per
 * unique CSS entry point at plugin init time.
 *
 * Why a worker_thread and not a forked child process (the pre-1.1 design): `execFileSync`
 * does `fork()` of the oxlint host (Rust + embedded Node). Under Linux overcommit
 * accounting on memory-constrained CI runners, forking a large-RSS process is rejected
 * with `spawnSync … ENOMEM` even though the child immediately `exec`s (#24). A
 * worker_thread creates a thread in-process — no address-space duplication — so it is
 * immune. This mirrors what `sort-service.ts` / `canonicalize-service.ts` already do.
 *
 * For arbitrary values (bg-[#123]) that aren't in the class list, we use heuristics.
 */

import { Worker, threadId } from 'node:worker_threads'
import { createHash } from 'node:crypto'
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir, userInfo } from 'node:os'
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
  /**
   * Tailwind v4 project prefix (e.g. 'tw' for `@import "tailwindcss" prefix(tw)`).
   * Empty string when no prefix is configured. All other fields store class
   * names WITHOUT the prefix; this is the single source of truth for it.
   */
  prefix: string
}

const PRECOMPUTE_SCRIPT = `
// Runs as a worker_thread (NOT a forked child process). Inputs arrive via
// workerData; the result is written straight to the disk cache and completion
// is signaled over the SharedArrayBuffer's control[2] (0=loading, 1=done,
// -1=error), mirroring sort-service.ts / canonicalize-service.ts.
const { workerData } = require('worker_threads');
const { tailwindNodePath, cssPath: WD_CSS_PATH, cachePath: WD_CACHE_PATH, tmpPath: WD_TMP_PATH, sharedBuffer } = workerData;
const control = new Int32Array(sharedBuffer, 0, 4);
// On failure, write the error message into the data region so the main thread
// can surface the real cause instead of a bare "undefined".
const errLengthView = new DataView(sharedBuffer, 16, 4);
const errDataArea = new Uint8Array(sharedBuffer, 20);
function signalError(e) {
  try {
    const msg = Buffer.from(String((e && e.message) || e || 'unknown precompute error'), 'utf-8');
    const n = Math.min(msg.length, errDataArea.length);
    errDataArea.set(msg.subarray(0, n), 0);
    errLengthView.setUint32(0, n);
  } catch {}
  Atomics.store(control, 2, -1);
  Atomics.notify(control, 2);
}
// Everything below — including the top-level require()s — runs inside this try
// so any SYNCHRONOUS module-scope failure (a broken @tailwindcss/node install,
// missing fs/path) is routed through signalError. Without it the worker would
// die unsignaled and the main thread would block until the full timeout, then
// report a misleading "timed out" instead of the real cause.
try {
// Resolve @tailwindcss/node via an absolute path passed in by the parent —
// bare-specifier lookup from the worker's cwd fails under pnpm strict
// workspaces (the module lives under node_modules/.pnpm/... which is not on the
// resolution path from the consumer's project root).
const { __unstable__loadDesignSystem } = require(tailwindNodePath);
const { readFileSync, writeFileSync, renameSync } = require('fs');
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
  const cssPath = WD_CSS_PATH;
  const css = readFileSync(cssPath, 'utf-8');
  const base = dirname(cssPath);
  const ds = await __unstable__loadDesignSystem(css, { base });

  // Tailwind v4 project prefix (\`@import "tailwindcss" prefix(tw)\`). getClassList()
  // returns names WITHOUT the prefix, but candidatesToCss/getClassOrder/
  // canonicalizeCandidates only resolve the PREFIXED form (\`tw:flex\`). We apply
  // the prefix only when calling the DS and strip it back off before storing, so
  // every structure stays prefix-free. The prefix is alphanumeric (no ':' '-' '['
  // ']' '/'), so \`prefix + ':'\` is an unambiguous separator.
  const prefix = (ds.theme && ds.theme.prefix) || '';
  const pfx = (c) => prefix ? prefix + ':' + c : c;
  const unpfx = (c) => (prefix && c.startsWith(prefix + ':')) ? c.slice(prefix.length + 1) : c;

  const entries = ds.getClassList();
  const classNames = entries.map(e => e[0]);

  // Index for O(1) lookups by class name (avoids O(N) indexOf/includes in later phases)
  const classNameIndex = new Map();
  for (let i = 0; i < classNames.length; i++) classNameIndex.set(classNames[i], i);

  // Validity: which classes produce CSS. Validate the prefixed form, but keep
  // cssResults aligned positionally to the unprefixed classNames so the later
  // cssProps / arbitraryEquivalents phases keep indexing by position.
  const cssResults = ds.candidatesToCss(classNames.map(pfx));
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
    const extraResults = ds.candidatesToCss(extraCandidates.map(pfx));
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
    const result = ds.canonicalizeCandidates([pfx(cls)]);
    const canon = result[0] ? unpfx(result[0]) : null;
    // Compare unprefixed-vs-unprefixed so the prefix itself never reads as a change.
    if (canon && canon !== cls) {
      canonical[cls] = canon;
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
    const legacyCssResults = ds.candidatesToCss(legacyToProcess.map(pfx));
    for (let i = 0; i < legacyToProcess.length; i++) {
      if (legacyCssResults[i] == null) continue;
      const cls = legacyToProcess[i];
      const result = ds.canonicalizeCandidates([pfx(cls)]);
      const canon = result[0] ? unpfx(result[0]) : null;
      if (canon && canon !== cls) {
        canonical[cls] = canon;
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
  const orderResults = ds.getClassOrder(allForOrder.map(pfx));
  for (const [name, val] of orderResults) {
    if (val !== null) order[unpfx(name)] = val.toString();
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
      // Match against the prefixed selector (the CSS emits \`.tw\\:flex\`), but
      // store under the unprefixed key. extractRootCssProps CSS-escapes the ':'.
      const props = extractRootCssProps(cssResults[i], pfx(classNames[i]));
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
        // Typography-style plugins emit \`[class~="tw:not-prose"]\` under a prefix.
        componentClasses.push(unpfx(acm[1]));
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
    // Prefix only the validation; keys/values stored stay prefix-free. The
    // declaration block extractDeclarations compares is identical with or
    // without the prefix (the prefix only affects the selector).
    const arbResults = ds.candidatesToCss(arbForms.map(pfx));
    for (let i = 0; i < candidates.length; i++) {
      if (!arbResults[i]) continue;
      if (extractDeclarations(arbResults[i]) === extractDeclarations(candidates[i].namedCss)) {
        arbitraryEquivalents[candidates[i].arbitraryForm] = candidates[i].namedCls;
      }
    }
  }

  const json = JSON.stringify({ validClasses, canonical, order, cssProps, variantOrder, componentClasses, arbitraryEquivalents, prefix });
  // Atomic write: write to a unique temp path then rename, so a peer isolate
  // busy-waiting on the cache file never observes a half-written JSON.
  writeFileSync(WD_TMP_PATH, json);
  renameSync(WD_TMP_PATH, WD_CACHE_PATH);
}
main()
  .then(() => { Atomics.store(control, 2, 1); Atomics.notify(control, 2); })
  .catch((e) => signalError(e));
} catch (e) {
  signalError(e);
}
`

// Namespace the cache dir by the current user. `os.tmpdir()` is per-user on
// macOS but shared (`/tmp`) on Linux and CI runners. A shared, predictably
// named dir lets a local attacker pre-plant a `<hash>.json` that we would
// deserialize and feed into autofixes that rewrite the user's source. A
// per-uid dir created with mode 0o700 (below) keeps the cache private to its
// owner. Combined with schema validation on read (`isPrecomputedData`), a
// poisoned or corrupt entry can no longer reach the rule layer.
function cacheDirName(): string {
  try {
    const info = userInfo()
    // uid is -1 on Windows; fall back to the username there.
    const id = typeof info.uid === 'number' && info.uid >= 0 ? String(info.uid) : info.username
    return `oxlint-tailwindcss-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`
  } catch {
    return 'oxlint-tailwindcss'
  }
}

const CACHE_DIR = join(tmpdir(), cacheDirName())

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

// Captures the target of `@import "..."`, `@import '...'` and `@import url("...")`.
const IMPORT_RE = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g

/**
 * Concatenate the entry CSS with the content of its locally-imported files, so
 * the cache key invalidates when an `@import`'d file changes — not only when the
 * entry itself does (DS-A2). Without this, editing a `@theme`/component file
 * pulled in via `@import "./theme.css"` served a stale design system until the
 * entry was touched or the Tailwind version changed.
 *
 * Resolves RELATIVE imports (`./`, `../`) recursively up to a small depth;
 * package imports (`@import "tailwindcss"`, `tw-animate-css`) are already
 * covered by the `@tailwindcss/node` version baked into CACHE_KEY. Best-effort:
 * an unreadable import contributes nothing (it can't affect the DS either).
 */
function hashableContent(entryPath: string, entryContent: string): string {
  const parts: string[] = [entryContent]
  const seen = new Set<string>([resolve(entryPath)])

  const visit = (cssPath: string, content: string, depth: number): void => {
    if (depth <= 0) return
    const baseDir = dirname(cssPath)
    IMPORT_RE.lastIndex = 0
    const specifiers: string[] = []
    let m: RegExpExecArray | null
    while ((m = IMPORT_RE.exec(content)) !== null) {
      if (m[1].startsWith('.')) specifiers.push(m[1])
    }
    for (const spec of specifiers) {
      const importPath = resolve(baseDir, spec.split('?')[0])
      if (seen.has(importPath)) continue
      seen.add(importPath)
      let importContent: string
      try {
        importContent = readFileSync(importPath, 'utf-8')
      } catch {
        continue
      }
      parts.push(importContent)
      visit(importPath, importContent, depth - 1)
    }
  }

  visit(resolve(entryPath), entryContent, 4)
  return parts.join('\0')
}

function getContentCachePath(contentHash: string): string {
  return join(CACHE_DIR, `${contentHash}.json`)
}

/**
 * The on-disk cache artifacts for a CSS entry point: the precomputed `json`
 * and the coordination `lock`. Exposed for tests that exercise the
 * cold-cache precompute coordination (issue #24).
 */
export function cacheArtifactPaths(cssPath: string): { json: string; lock: string } {
  const resolved = resolve(cssPath)
  const content = readFileSync(resolved, 'utf-8')
  const hash = computeContentHash(hashableContent(resolved, content))
  return { json: getContentCachePath(hash), lock: join(CACHE_DIR, `${hash}.lock`) }
}

/**
 * Minimal shape check for a cache payload. Guards against (a) a poisoned file
 * planted by a local attacker and (b) a corrupt/half-written or version-skewed
 * file. A `{}` that is valid JSON but missing fields would otherwise blow up
 * later in `DesignSystemCache.fromPrecomputed` with a raw TypeError that isn't
 * plugin-fatal, breaking the lint with no diagnostic. We don't deep-validate
 * every entry — just enough that `fromPrecomputed` can rely on the fields.
 */
function isPrecomputedData(data: unknown): data is PrecomputedData {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  const isObject = (v: unknown) => typeof v === 'object' && v !== null
  return (
    Array.isArray(d.validClasses) &&
    Array.isArray(d.componentClasses) &&
    typeof d.prefix === 'string' &&
    isObject(d.canonical) &&
    isObject(d.order) &&
    isObject(d.cssProps) &&
    isObject(d.variantOrder) &&
    isObject(d.arbitraryEquivalents)
  )
}

function tryReadCache(cachePath: string): PrecomputedData | null {
  const raw = tryReadRawCache(cachePath)
  if (raw === null) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  return isPrecomputedData(data) ? data : null
}

function tryReadRawCache(cachePath: string): string | null {
  try {
    return readFileSync(cachePath, 'utf-8')
  } catch {
    return null
  }
}

// --- Cross-isolate precompute coordination (issue #24) ---
//
// oxlint lints files across parallel isolates. On a cold cache they would all
// reach `loadDesignSystemSync` for the same CSS at once, and each would spawn a
// precompute worker that loads `@tailwindcss/node`. Letting a dozen run at once
// wastes memory re-doing identical work.
//
// The fix: a content-hash-scoped file lock. The first isolate to create the
// lock runs the precompute worker (which writes the cache); the others busy-wait
// for the resulting `.json` instead of spawning their own. Coordination is keyed
// by content hash, so distinct CSS files still precompute in parallel.

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

/**
 * Reclaim a stale lock by exclusive rename rather than unlink (DS-M1). Two
 * waiters that both judge the lock stale would otherwise both `unlink` it — and
 * the second unlink could delete a FRESH lock a third isolate just created,
 * letting two precomputes run in parallel (the very amplification the lock
 * exists to prevent, #24). `renameSync` moves the file atomically: only one
 * waiter wins the move; the loser gets ENOENT and loops back to re-check.
 */
function reclaimStaleLock(lockPath: string): void {
  const reclaimPath = `${lockPath}.reclaim.${process.pid}.${threadId}.${precomputeSeq++}`
  try {
    renameSync(lockPath, reclaimPath)
  } catch {
    return // someone else already reclaimed or released it
  }
  tryUnlink(reclaimPath)
}

/** control[2] — the worker's ready/done signal (0=loading, 1=done, -1=error). */
const PRECOMPUTE_SIGNAL_INDEX = 2

// Control ints (16 B) + length (4 B) + room for an error message. The success
// payload goes to disk, so 64 KB is far more than the failure path ever needs.
const ERR_BUFFER_SIZE = 64 * 1024

// Monotonic suffix so two precompute workers in the same process never collide
// on the temp file they write before renaming it into place.
let precomputeSeq = 0

/**
 * Choose the diagnostic hint based on the underlying error code. ENOMEM/EAGAIN
 * is memory pressure, not a CSS or timeout problem — the legacy hint pointed
 * users at the wrong levers (issue #24 / birdman CI report). Exported for tests.
 */
export function precomputeHint(cause: unknown): string {
  const code = (cause as NodeJS.ErrnoException | undefined)?.code
  const message = cause instanceof Error ? cause.message : ''
  if (code === 'ENOMEM' || code === 'EAGAIN' || message.includes('ENOMEM')) {
    return 'The host ran out of memory spawning the precompute worker. This is rare now that precompute runs in a worker thread; if it persists, lower oxlint concurrency (e.g. `--threads`) or give the machine/CI runner more memory.'
  }
  return 'Check the CSS file (and its imports) for syntax errors. If this looks like a timeout, raise `settings.tailwindcss.timeout`.'
}

function precomputeLoadError(resolvedPath: string, cause: unknown): DesignSystemLoadError {
  const causeError = cause instanceof Error ? cause : undefined
  const message = causeError?.message ?? String(cause)
  return new DesignSystemLoadError(
    `Failed to precompute design system from "${resolvedPath}": ${message}`,
    precomputeHint(cause),
    { cause: causeError },
  )
}

/**
 * Run the precompute in a worker_thread (not a forked child). The worker loads
 * the design system in-process, writes the JSON straight to `cachePath`, and
 * signals completion over a SharedArrayBuffer; the main thread blocks on
 * `Atomics.wait`. Because worker_threads don't fork the host's address space,
 * this avoids the `spawnSync … ENOMEM` the fork-based path hit on
 * memory-constrained CI runners (#24).
 *
 * Throws `DesignSystemLoadError` on spawn failure, worker error, or timeout.
 * The worker writes the result itself, so this returns nothing — callers read
 * it back from `cachePath`.
 */
function runPrecomputeViaWorker(
  resolvedPath: string,
  tailwindNodePath: string,
  cachePath: string,
  timeout: number,
): void {
  // The precompute payload travels via the disk cache, so the buffer only needs
  // room for the control ints plus an error message on the failure path:
  //   [0..3]  Int32 control (index 2 = ready signal)
  //   [16..19] Uint32 error-message length
  //   [20..]   Uint8 error-message bytes
  const sharedBuffer = new SharedArrayBuffer(ERR_BUFFER_SIZE)
  const control = new Int32Array(sharedBuffer, 0, 4)
  const errLengthView = new DataView(sharedBuffer, 16, 4)
  const errDataArea = new Uint8Array(sharedBuffer, 20)
  const tmpPath = `${cachePath}.tmp.${process.pid}.${threadId}.${precomputeSeq++}`

  let worker: Worker
  try {
    worker = new Worker(PRECOMPUTE_SCRIPT, {
      eval: true,
      workerData: { sharedBuffer, cssPath: resolvedPath, cachePath, tmpPath, tailwindNodePath },
    })
  } catch (cause) {
    throw precomputeLoadError(resolvedPath, cause)
  }

  // Swallow worker 'error' events so an unhandled one can't tear down the
  // oxlint host. We don't read it for the cause: the main thread is blocked in
  // `Atomics.wait` and reads the signal synchronously the instant it returns —
  // the event loop never turns, so this handler hasn't run yet. The real cause
  // travels through the SharedArrayBuffer via signalError instead.
  worker.on('error', () => {})

  try {
    const result = Atomics.wait(control, PRECOMPUTE_SIGNAL_INDEX, 0, timeout)
    if (result === 'timed-out') {
      throw new DesignSystemLoadError(
        `Timed out precomputing design system from "${resolvedPath}" after ${timeout}ms.`,
        'Raise `settings.tailwindcss.timeout` if your machine or CI runner is slow, or verify the CSS imports resolve.',
      )
    }
    if (control[PRECOMPUTE_SIGNAL_INDEX] === -1) {
      // signalError wrote the real message into the buffer. len === 0 only if
      // the worker died before signaling at all (e.g. OS-killed under memory
      // pressure) — give a cause that says so instead of a bare "undefined".
      const len = errLengthView.getUint32(0)
      const cause =
        len > 0
          ? new Error(Buffer.from(errDataArea.slice(0, len)).toString('utf-8'))
          : new Error(
              'precompute worker exited without reporting a cause (it may have been killed by the OS, e.g. under memory pressure)',
            )
      throw precomputeLoadError(resolvedPath, cause)
    }
    // Success: the worker wrote the cache file. Nothing else to do here.
  } finally {
    tryUnlink(tmpPath)
    void worker.terminate()
  }
}

/**
 * Run the precompute worker, then read back and validate the JSON it wrote to
 * `cachePath`. Used by both the lock-winner path and the uncoordinated degrade
 * path. Returns the validated `PrecomputedData` (never a raw string), so a
 * malformed payload surfaces as a clear diagnostic here instead of crashing
 * later in `DesignSystemCache.fromPrecomputed`.
 */
function precomputeAndRead(
  resolvedPath: string,
  tailwindNodePath: string,
  cachePath: string,
  timeout: number,
): PrecomputedData {
  runPrecomputeViaWorker(resolvedPath, tailwindNodePath, cachePath, timeout)
  const data = tryReadCache(cachePath)
  if (data === null) {
    throw new DesignSystemLoadError(
      `Precompute worker finished but wrote no valid cache file for "${resolvedPath}".`,
      'This usually means the system temp directory is not writable, or the output was malformed; check its permissions and free space.',
    )
  }
  return data
}

/**
 * Return the raw precompute JSON for `contentHash`, spawning at most one
 * precompute worker across all isolates competing for the same hash. Whoever
 * wins the lock computes and writes the cache; the rest wait for that file.
 */
function computeWithLock(
  resolvedPath: string,
  tailwindNodePath: string,
  contentHash: string,
  cachePath: string,
  timeout: number,
): PrecomputedData {
  const lockPath = join(CACHE_DIR, `${contentHash}.lock`)
  // A healthy holder is busy inside the precompute worker (up to `timeout`);
  // only treat the lock as abandoned once it outlives that window plus a margin.
  const staleMs = timeout + 30_000

  try {
    // mode 0o700: the cache dir is private to its owner (see cacheDirName).
    mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 })
  } catch {
    // If we can't even create the cache dir, locking is impossible — fall back
    // to an uncoordinated compute rather than spin forever.
    return precomputeAndRead(resolvedPath, tailwindNodePath, cachePath, timeout)
  }

  const start = Date.now()
  for (;;) {
    // A peer may have finished while we looped. `tryReadCache` validates the
    // payload, so a corrupt/poisoned file reads as a miss and we fall through
    // to recompute (deleting it once we hold the lock, below).
    const cached = tryReadCache(cachePath)
    if (cached) return cached

    let lockFd: number
    try {
      lockFd = openSync(lockPath, 'wx')
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
        // Someone else holds it. Reclaim if stale, or if we've waited well past
        // the point a healthy holder should have produced the cache.
        if (lockAgeMs(lockPath) > staleMs || Date.now() - start > staleMs * 2) {
          reclaimStaleLock(lockPath)
        } else {
          syncSleep(LOCK_POLL_MS)
        }
        continue
      }
      // Lock dir not writable or similar — degrade to uncoordinated compute.
      return precomputeAndRead(resolvedPath, tailwindNodePath, cachePath, timeout)
    }

    try {
      // We hold the lock. If a cache file is present here it failed validation
      // above (corrupt, half-written by a crashed peer, or poisoned) — remove
      // it so the worker writes a clean one instead of us reading it forever.
      tryUnlink(cachePath)
      // The worker writes the cache file itself; read it back as the result.
      return precomputeAndRead(resolvedPath, tailwindNodePath, cachePath, timeout)
    } finally {
      closeSync(lockFd)
      tryUnlink(lockPath)
    }
  }
}

/**
 * Synchronously load and precompute the design system for a CSS file.
 *
 * Throws `DesignSystemLoadError` on any failure (missing file, worker
 * error, missing `@tailwindcss/node`, etc.). Callers catch via
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

  const contentHash = computeContentHash(hashableContent(resolvedPath, content))
  const contentCachePath = getContentCachePath(contentHash)

  const cached = tryReadCache(contentCachePath)
  if (cached) return cached

  // The worker receives @tailwindcss/node's absolute path via workerData.
  // Bare-specifier resolution from the worker's cwd would fail under pnpm
  // strict workspaces where the consumer's project root has no direct
  // access to the plugin's transitive deps.
  if (TAILWIND_NODE_PATH === null) {
    throw new DesignSystemLoadError(
      `Could not resolve '@tailwindcss/node' while loading "${resolvedPath}".`,
      "Install '@tailwindcss/node' (or upgrade oxlint-tailwindcss) and re-run.",
    )
  }

  // Coordinate parallel isolates: at most one spawns the precompute worker for a
  // given content hash; the rest wait for the cache file it writes. The worker
  // runs in-thread (no fork), so it can't trigger the cold-cache `spawnSync …
  // ENOMEM` that the fork-based precompute hit on constrained CI runners (#24).
  // Returns validated `PrecomputedData` — malformed payloads are caught inside.
  return computeWithLock(
    resolvedPath,
    TAILWIND_NODE_PATH,
    contentHash,
    contentCachePath,
    timeout ?? DEFAULT_LOAD_TIMEOUT_MS,
  )
}

// validateCandidatesSync removed — runtime child process calls were too slow.
// Unknown classes are now handled via precomputed expansion + heuristics in cache.isValid().
