/**
 * Benchmark: PRECOMPUTE_SCRIPT phase-by-phase breakdown.
 *
 * Runs the same logic as sync-loader.ts PRECOMPUTE_SCRIPT but with
 * timing instrumentation for each phase. This helps identify which
 * phases are bottlenecks and where optimization effort should focus.
 *
 * Run: pnpm vitest run tests/benchmarks/precompute-phases.bench.ts
 */

import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

/**
 * Instrumented version of the PRECOMPUTE_SCRIPT.
 * Identical logic but with performance.now() around each phase.
 */
const INSTRUMENTED_SCRIPT = `
const { __unstable__loadDesignSystem } = require('@tailwindcss/node');
const { readFileSync } = require('fs');
const { dirname, resolve } = require('path');

function resolveImport(specifier, baseDir) {
  if (specifier.startsWith('.')) return resolve(baseDir, specifier);
  const { join } = require('path');
  const { existsSync } = require('fs');
  let dir = baseDir;
  while (true) {
    const pkgDir = join(dir, 'node_modules', specifier);
    if (existsSync(pkgDir)) {
      try {
        const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
        const entry = pkg.style || pkg.main || '';
        if (entry.endsWith('.css')) return resolve(pkgDir, entry);
        const exp = pkg.exports && pkg.exports['.'];
        const styleEntry = typeof exp === 'object' && exp !== null ? exp.style : null;
        if (styleEntry) return resolve(pkgDir, styleEntry);
      } catch {}
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
    const classSelRe = /\\.([a-zA-Z_][\\w-]*)/g;
    let cs;
    while ((cs = classSelRe.exec(content)) !== null) result.push(cs[1]);
  }
  return [...new Set(result)];
}

const atPropertyDescriptors = new Set(['syntax', 'inherits', 'initial-value']);

function extractRootCssProps(cssText, className) {
  const rootProps = [];
  const allProps = [];
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
  const result = rootProps.length > 0 ? rootProps : allProps;
  return [...new Set(result)];
}

async function main() {
  const timings = {};
  const cssPath = process.env.TAILWIND_CSS_PATH;

  // === Phase 0: Node.js startup + require ===
  // (measured externally — this is the time before main() runs)
  const t_main_start = performance.now();

  // === Phase 1: Load Design System ===
  let t = performance.now();
  const css = readFileSync(cssPath, 'utf-8');
  const base = dirname(cssPath);
  const ds = await __unstable__loadDesignSystem(css, { base });
  timings['1_load_design_system'] = performance.now() - t;

  // === Phase 2: Class validation + expansion ===
  t = performance.now();
  const entries = ds.getClassList();
  const classNames = entries.map(e => e[0]);
  const classNameIndex = new Map();
  for (let i = 0; i < classNames.length; i++) classNameIndex.set(classNames[i], i);
  const cssResults = ds.candidatesToCss(classNames);
  const validClasses = classNames.filter((_, i) => cssResults[i] != null);
  const validSet = new Set(validClasses);
  const knownPrefixes = new Set();
  for (const cls of validClasses) {
    const dash = cls.lastIndexOf('-');
    if (dash > 0) knownPrefixes.add(cls.slice(0, dash));
  }
  const extraCandidates = [];
  const breakpoints = ['sm', 'md', 'lg', 'xl', '2xl'];
  for (const prefix of knownPrefixes) {
    if (!validSet.has(prefix)) extraCandidates.push(prefix);
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
  timings['2_class_validation'] = performance.now() - t;

  // === Phase 3: Canonicalization ===
  t = performance.now();
  const canonical = {};
  for (const cls of classNames) {
    const result = ds.canonicalizeCandidates([cls]);
    if (result[0] && result[0] !== cls) {
      canonical[cls] = result[0];
    }
  }
  timings['3_canonicalization'] = performance.now() - t;

  // === Phase 4: Sort order ===
  t = performance.now();
  const allForOrder = [...classNames];
  for (const cls of validClasses) {
    if (!classNameIndex.has(cls)) allForOrder.push(cls);
  }
  const order = {};
  const orderResults = ds.getClassOrder(allForOrder);
  for (const [name, val] of orderResults) {
    if (val !== null) order[name] = val.toString();
  }
  timings['4_sort_order'] = performance.now() - t;

  // === Phase 5: CSS property extraction ===
  t = performance.now();
  const cssProps = {};
  for (let i = 0; i < classNames.length; i++) {
    if (cssResults[i]) {
      const props = extractRootCssProps(cssResults[i], classNames[i]);
      if (props.length > 0) cssProps[classNames[i]] = props;
    }
  }
  timings['5_css_props'] = performance.now() - t;

  // === Phase 6: Variant ordering ===
  t = performance.now();
  const variantOrder = {};
  const variants = ds.getVariants();
  for (let i = 0; i < variants.length; i++) {
    if (!variants[i].isArbitrary) {
      variantOrder[variants[i].name] = i;
    }
  }
  timings['6_variant_order'] = performance.now() - t;

  // === Phase 7: Component classes ===
  t = performance.now();
  const componentClasses = extractComponentClasses(cssPath, base);
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
  timings['7_component_classes'] = performance.now() - t;

  // === Phase 8: Arbitrary equivalents ===
  t = performance.now();
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
  timings['8_arbitrary_equivalents'] = performance.now() - t;

  timings['_total_main'] = performance.now() - t_main_start;
  timings['_class_count'] = classNames.length;
  timings['_valid_count'] = validClasses.length;
  timings['_extra_candidates'] = extraCandidates.length;
  timings['_canonical_diffs'] = Object.keys(canonical).length;
  timings['_arb_candidates'] = candidates.length;
  timings['_arb_equivalents'] = Object.keys(arbitraryEquivalents).length;

  process.stdout.write(JSON.stringify(timings));
}
main().catch(e => { process.stderr.write(e.message); process.exit(1); });
`

describe('Precompute Phases Benchmark', () => {
  it('measures each phase of the PRECOMPUTE_SCRIPT', () => {
    const resolvedPath = resolve(ENTRY_POINT)

    // Measure total wall time including process spawn
    const wallStart = performance.now()
    const stdout = execFileSync(process.execPath, ['-e', INSTRUMENTED_SCRIPT], {
      encoding: 'utf-8',
      timeout: 60_000,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, TAILWIND_CSS_PATH: resolvedPath },
      cwd: dirname(resolvedPath),
    })
    const wallTime = performance.now() - wallStart

    const timings = JSON.parse(stdout) as Record<string, number>

    const phases = [
      ['1_load_design_system', 'Carga del design system'],
      ['2_class_validation', 'Validación de clases + expansión'],
      ['3_canonicalization', 'Canonicalización (1 llamada por clase)'],
      ['4_sort_order', 'Orden de sort'],
      ['5_css_props', 'Extracción de CSS props'],
      ['6_variant_order', 'Orden de variantes'],
      ['7_component_classes', 'Clases de componentes'],
      ['8_arbitrary_equivalents', 'Equivalentes arbitrarios'],
    ]

    console.log('\n' + '='.repeat(65))
    console.log(' PRECOMPUTE_SCRIPT — Desglose por fase')
    console.log('='.repeat(65))

    let phasesTotal = 0
    for (const [key, label] of phases) {
      const ms = timings[key]!
      phasesTotal += ms
      const pct = ((ms / timings._total_main!) * 100).toFixed(1)
      const bar = '█'.repeat(Math.round((ms / timings._total_main!) * 30))
      console.log(
        `  ${label.padEnd(42)} ${ms.toFixed(0).padStart(6)}ms  ${pct.padStart(5)}%  ${bar}`,
      )
    }

    console.log('-'.repeat(65))
    console.log(`  ${'Suma de fases'.padEnd(42)} ${phasesTotal.toFixed(0).padStart(6)}ms`)
    console.log(`  ${'Total main()'.padEnd(42)} ${timings._total_main!.toFixed(0).padStart(6)}ms`)
    console.log(
      `  ${'Overhead proceso (spawn + require + IPC)'.padEnd(42)} ${(wallTime - timings._total_main!).toFixed(0).padStart(6)}ms`,
    )
    console.log(`  ${'Wall time total'.padEnd(42)} ${wallTime.toFixed(0).padStart(6)}ms`)

    console.log('\n' + '-'.repeat(65))
    console.log(' Estadísticas')
    console.log('-'.repeat(65))
    console.log(`  Clases en getClassList():      ${timings._class_count}`)
    console.log(`  Clases válidas:                 ${timings._valid_count}`)
    console.log(`  Candidatos extra evaluados:     ${timings._extra_candidates}`)
    console.log(`  Clases con forma no-canónica:   ${timings._canonical_diffs}`)
    console.log(`  Candidatos arbitrarios:         ${timings._arb_candidates}`)
    console.log(`  Equivalentes encontrados:       ${timings._arb_equivalents}`)
    console.log('='.repeat(65) + '\n')

    // Sanity check — should complete
    expect(timings._total_main).toBeGreaterThan(0)
    expect(timings._class_count).toBeGreaterThan(100)
  })
})
