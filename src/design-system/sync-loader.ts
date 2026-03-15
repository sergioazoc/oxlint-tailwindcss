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

function extractComponentClasses(cssPath, baseDir) {
  let css;
  try { css = readFileSync(cssPath, 'utf-8'); } catch { return []; }
  const files = [css];
  const importRe = /@import\\s+['"](\\.[\\/][^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(css)) !== null) {
    try { files.push(readFileSync(resolve(baseDir, m[1]), 'utf-8')); } catch {}
  }
  const result = [];
  for (const content of files) {
    const layerRe = /@layer\\s+components\\s*\\{/g;
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

  // CSS properties per class
  const cssProps = {};
  const propRegex = /^\\s+([\\w-]+)\\s*:/gm;
  for (let i = 0; i < classNames.length; i++) {
    if (cssResults[i]) {
      const props = [];
      let match;
      propRegex.lastIndex = 0;
      while ((match = propRegex.exec(cssResults[i])) !== null) {
        props.push(match[1]);
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

function getCachePath(cssPath: string, mtime: number): string {
  const hash = createHash('md5').update(`${cssPath}:${mtime}`).digest('hex')
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
