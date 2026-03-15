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
  /** Classes defined in @layer components blocks */
  componentClasses: string[]
  /** arbitraryForm → namedClass for unnecessary arbitrary value detection */
  arbitraryEquivalents: Record<string, string>
}

const PRECOMPUTE_SCRIPT = `
const { __unstable__loadDesignSystem } = require('@tailwindcss/node');
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

  // Sort order
  const order = {};
  const orderResults = ds.getClassOrder(classNames);
  for (const [name, val] of orderResults) {
    if (val !== null) order[name] = val.toString();
  }

  // CSS properties per class — extract only from the class rule block, skip @property descriptors
  const cssProps = {};
  const atPropertyDescriptors = new Set(['syntax', 'inherits', 'initial-value']);
  const propRegex = /^\\s+([\\w-]+)\\s*:/gm;
  for (let i = 0; i < classNames.length; i++) {
    if (cssResults[i]) {
      const props = [];
      let match;
      propRegex.lastIndex = 0;
      while ((match = propRegex.exec(cssResults[i])) !== null) {
        if (!atPropertyDescriptors.has(match[1])) props.push(match[1]);
      }
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

  // Arbitrary equivalents: map arbitrary forms to named equivalents
  const arbitraryEquivalents = {};
  const candidates = [];
  for (const cls of validClasses) {
    if (cls.includes('[') || cls.includes('/')) continue;
    const idx = classNames.indexOf(cls);
    const cssText = cssResults[idx];
    if (!cssText) continue;
    const pvMatch = cssText.match(/^\\s+([\\w-]+)\\s*:\\s*(.+?)\\s*;?\\s*$/m);
    if (!pvMatch) continue;
    const value = pvMatch[2].trim().replace(/;$/, '');
    const lastDash = cls.lastIndexOf('-');
    if (lastDash <= 0) continue;
    const prefix = cls.slice(0, lastDash);
    candidates.push({ arbitraryForm: prefix + '-[' + value + ']', namedCls: cls, namedCss: cssText });
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

// Bump this when precompute logic changes to invalidate disk cache
const CACHE_VERSION = 7

function getCachePath(cssPath: string, mtime: number): string {
  const hash = createHash('md5').update(`v${CACHE_VERSION}:${cssPath}:${mtime}`).digest('hex')
  return join(CACHE_DIR, `${hash}.json`)
}

export function loadDesignSystemSync(cssPath: string): PrecomputedData | null {
  const resolvedPath = resolve(cssPath)

  try {
    const mtime = statSync(resolvedPath).mtimeMs
    const cachePath = getCachePath(resolvedPath, mtime)

    // Try disk cache first
    if (existsSync(cachePath)) {
      try {
        return JSON.parse(readFileSync(cachePath, 'utf-8')) as PrecomputedData
      } catch {
        // Cache corrupted, fall through to full load
      }
    }

    const stdout = execFileSync(process.execPath, ['-e', PRECOMPUTE_SCRIPT], {
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, TAILWIND_CSS_PATH: resolvedPath },
      cwd: dirname(resolvedPath),
    })

    // Write to disk cache for other threads/future runs
    try {
      mkdirSync(CACHE_DIR, { recursive: true })
      writeFileSync(cachePath, stdout)
    } catch {
      // Non-fatal — cache is optional
    }

    return JSON.parse(stdout) as PrecomputedData
  } catch (error) {
    console.error(
      `[oxlint-tailwindcss] Failed to load design system from "${resolvedPath}":`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

// validateCandidatesSync removed — runtime child process calls were too slow.
// Unknown classes are now handled via precomputed expansion + heuristics in cache.isValid().
