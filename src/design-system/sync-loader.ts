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
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

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

export function readTailwindVersion(): string {
  try {
    // @tailwindcss/node doesn't expose ./package.json in its exports map,
    // so walk up from the resolved entry until we find a package.json named
    // '@tailwindcss/node'.
    let dir = dirname(require.resolve('@tailwindcss/node'))
    while (true) {
      const candidate = join(dir, 'package.json')
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf-8')) as {
          name?: string
          version?: string
        }
        if (pkg.name === '@tailwindcss/node' && pkg.version) return pkg.version
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    // Fallback below.
  }
  // Fallback: cache key still varies with script content; consumers without
  // @tailwindcss/node installed won't reach the precompute path anyway.
  return 'unknown'
}

const CACHE_KEY = computeCacheKey(PRECOMPUTE_SCRIPT, readTailwindVersion())

/**
 * Two-level disk cache for monorepo deduplication:
 *
 * Level 1 — mtime index (.idx): maps path+mtime → content hash (fast-path, avoids reading CSS)
 * Level 2 — content cache (.json): maps content hash → precomputed data (shared across packages)
 *
 * In monorepos, multiple packages with identical CSS (e.g. `@import 'tailwindcss'`) at different
 * paths share a single content cache entry, avoiding redundant child process spawns.
 */

function getMtimeIndexPath(cssPath: string, mtime: number): string {
  const hash = createHash('md5').update(`${CACHE_KEY}:${cssPath}:${mtime}`).digest('hex')
  return join(CACHE_DIR, `${hash}.idx`)
}

function computeContentHash(content: string): string {
  return createHash('md5').update(`${CACHE_KEY}:${content}`).digest('hex')
}

function getContentCachePath(contentHash: string): string {
  return join(CACHE_DIR, `${contentHash}.json`)
}

function tryReadCache(cachePath: string): PrecomputedData | null {
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as PrecomputedData
  } catch {
    return null
  }
}

function writeCacheFiles(
  contentCachePath: string,
  mtimeIndexPath: string,
  contentHash: string,
  data: string,
): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(contentCachePath, data)
    writeFileSync(mtimeIndexPath, contentHash)
  } catch {
    // Non-fatal — cache is optional
  }
}

export function loadDesignSystemSync(cssPath: string, timeout?: number): PrecomputedData | null {
  const resolvedPath = resolve(cssPath)

  try {
    const mtime = statSync(resolvedPath).mtimeMs
    const mtimeIndexPath = getMtimeIndexPath(resolvedPath, mtime)

    // Fast path: mtime index exists → read content hash → look up content cache
    if (existsSync(mtimeIndexPath)) {
      try {
        const contentHash = readFileSync(mtimeIndexPath, 'utf-8').trim()
        const contentCachePath = getContentCachePath(contentHash)
        const cached = tryReadCache(contentCachePath)
        if (cached) return cached
      } catch {
        // Index corrupted, fall through
      }
    }

    // Slow path: read CSS content, compute content hash
    const content = readFileSync(resolvedPath, 'utf-8')
    const contentHash = computeContentHash(content)
    const contentCachePath = getContentCachePath(contentHash)

    // Check content cache — another package with identical CSS may have already computed this
    const cached = tryReadCache(contentCachePath)
    if (cached) {
      // Content cache hit (monorepo deduplication) — just write the mtime index
      try {
        mkdirSync(CACHE_DIR, { recursive: true })
        writeFileSync(mtimeIndexPath, contentHash)
      } catch {
        // Non-fatal
      }
      return cached
    }

    // Resolve @tailwindcss/node from the plugin's own location and pass it to
    // the child via env. Bare-specifier resolution from the child's cwd would
    // fail under pnpm strict workspaces where the consumer's project root has
    // no direct access to the plugin's transitive deps.
    const tailwindNodePath = require.resolve('@tailwindcss/node')

    // Full computation: spawn child process
    const stdout = execFileSync(process.execPath, ['-e', PRECOMPUTE_SCRIPT], {
      encoding: 'utf-8',
      timeout: timeout ?? 30_000,
      maxBuffer: 50 * 1024 * 1024,
      env: {
        ...process.env,
        TAILWIND_CSS_PATH: resolvedPath,
        TAILWIND_NODE_PATH: tailwindNodePath,
      },
      cwd: dirname(resolvedPath),
    })

    // Write both cache levels
    writeCacheFiles(contentCachePath, mtimeIndexPath, contentHash, stdout)

    return JSON.parse(stdout) as PrecomputedData
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // Surface the pnpm/npm hoisting failure mode with an actionable hint
    // instead of a raw "Cannot find module '@tailwindcss/node'" stack.
    if (msg.includes("Cannot find module '@tailwindcss/node'")) {
      console.error(
        `[oxlint-tailwindcss] Could not resolve '@tailwindcss/node' for "${resolvedPath}". ` +
          `If you are using pnpm with strict hoisting, add '@tailwindcss/node' as a direct devDependency, ` +
          `or upgrade oxlint-tailwindcss to >= 0.7.0 which resolves it from the plugin's own install location. ` +
          `DS-dependent rules will be skipped for this file.`,
      )
    } else {
      console.error(
        `[oxlint-tailwindcss] Failed to load design system from "${resolvedPath}":`,
        msg,
      )
    }
    return null
  }
}

// validateCandidatesSync removed — runtime child process calls were too slow.
// Unknown classes are now handled via precomputed expansion + heuristics in cache.isValid().
