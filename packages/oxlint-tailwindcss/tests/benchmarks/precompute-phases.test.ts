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
import { DECL_EXTRACTOR_SOURCE } from '../../src/design-system/sync-loader'

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
  // Mirrors extractComponentClasses in sync-loader.ts — selectors only.
  const result = new Set();
  const classRe = /\\.(-?[a-zA-Z_][\\w-]*)/g;
  for (const content of files) {
    let prelude = '';
    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      if (c === '/' && content[i + 1] === '*') {
        const end = content.indexOf('*/', i + 2);
        i = end === -1 ? content.length : end + 1;
        continue;
      }
      if (c === '"' || c === "'") {
        const quote = c;
        i++;
        while (i < content.length && content[i] !== quote) {
          if (content[i] === '\\\\') i++;
          i++;
        }
        continue;
      }
      if (c === '{') {
        classRe.lastIndex = 0;
        let m2;
        while ((m2 = classRe.exec(prelude)) !== null) result.add(m2[1]);
        prelude = '';
        continue;
      }
      if (c === '}' || c === ';') {
        if (c === ';' && prelude.trimStart().charCodeAt(0) === 64) {
          classRe.lastIndex = 0;
          let m3;
          while ((m3 = classRe.exec(prelude)) !== null) result.add(m3[1]);
        }
        prelude = '';
        continue;
      }
      prelude += c;
    }
  }
  return [...result];
}

${DECL_EXTRACTOR_SOURCE}

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

  // === Phase 5: CSS declaration extraction ===
  t = performance.now();
  const scopeIds = new Map([['', 0]]);
  const scopeTable = [''];
  const propIds = new Map();
  const propTable = [];
  const valueIds = new Map();
  const valueTable = [];
  const declFreq = new Map();
  const perClass = {};
  for (let i = 0; i < classNames.length; i++) {
    if (!cssResults[i]) continue;
    const keys = [];
    walkDeclarations(cssResults[i], classNames[i], (scopeTok, prop, value) => {
      let sc = scopeIds.get(scopeTok);
      if (sc === undefined) { sc = scopeTable.length; scopeTable.push(scopeTok); scopeIds.set(scopeTok, sc); }
      let p = propIds.get(prop);
      if (p === undefined) { p = propTable.length; propTable.push(prop); propIds.set(prop, p); }
      let v = valueIds.get(value);
      if (v === undefined) { v = valueTable.length; valueTable.push(value); valueIds.set(value, v); }
      const key = sc + '|' + p + '|' + v;
      declFreq.set(key, (declFreq.get(key) || 0) + 1);
      keys.push(key);
    });
    if (keys.length > 0) perClass[classNames[i]] = keys;
  }
  for (let v = 0; v < valueTable.length; v++) {
    scanVarReads(valueTable[v]);
    isPureVarRead(valueTable[v]);
  }
  timings['5_css_declarations'] = performance.now() - t;
  timings['_decl_values'] = valueTable.length;
  timings['_decl_distinct'] = declFreq.size;

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
  const componentSet = new Set(extractComponentClasses(cssPath, base));
  const attrClassRe = /\\[class~="([^"]+)"\\]/g;
  for (let i = 0; i < cssResults.length; i++) {
    if (cssResults[i]) {
      let acm;
      attrClassRe.lastIndex = 0;
      while ((acm = attrClassRe.exec(cssResults[i])) !== null) {
        componentSet.add(acm[1]);
      }
    }
  }
  const componentClasses = [...componentSet];
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
      ['5_css_declarations', 'Extracción de declaraciones CSS'],
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
