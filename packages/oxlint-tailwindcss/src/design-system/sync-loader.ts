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
import { resolveTailwindNodeFor, type TailwindNodeResolution } from './tailwind-node'
import { type CssDeclarationIndex, isCssDeclarationIndex } from './css-declarations'

export interface PrecomputedData {
  /** All valid class names (candidatesToCss returned non-null) */
  validClasses: string[]
  /** className → canonical form (only entries where canonical differs) */
  canonical: Record<string, string>
  /**
   * v3 spelling → its v4 name, for the classes Tailwind renamed. A subset of
   * `canonical`, kept apart because "deprecated" and "not canonical" are
   * different claims: `start-2` canonicalizes to `inset-s-2` and is NOT
   * deprecated, while `bg-gradient-to-r` is.
   *
   * Derived by asking `canonicalizeCandidates` about the renamed spellings, so an
   * entry disappears the moment a Tailwind release stops emitting CSS for it —
   * which is what a hardcoded map cannot do. It is also what makes
   * `no-deprecated-classes` the single owner of these classes:
   * `enforce-canonical` skips whatever is in here instead of reporting the same
   * rewrite a second time.
   */
  deprecated?: Record<string, string>
  /** className → sort order as string (BigInt serialized) */
  order: Record<string, string>
  /**
   * Interned CSS declarations per class: property + value + variables read +
   * which box it applies to. Replaced the old name-only `cssProps` map so
   * `no-conflicting-classes` can tell a real conflict from two classes emitting
   * the same declaration, from a `var()` reader composing with its writer, and
   * from a declaration that applies to a pseudo-element or a descendant rather
   * than to the element itself.
   */
  cssDeclarations: CssDeclarationIndex
  /** variant name → sort index from the design system */
  variantOrder: Record<string, number>
  /**
   * variant name → what its selector DOES, for the variants where it matters:
   * `p` when it targets a generated box (`::before`, or a project's
   * `@custom-variant thumb (&::-webkit-slider-thumb)`), `s` when it adds
   * structural context so reordering across it changes which element is matched
   * (`group-*`/`peer-*` wrap the element in an ancestor/sibling selector — the
   * case no list of names can describe). Sparse: variants that only add a
   * condition to the same element are absent.
   */
  variantFacts?: Record<string, { p?: 1; s?: 1 }>
  /** Classes from @layer components and modifier classes referenced via [class~="..."] */
  componentClasses: string[]
  /** arbitraryForm → namedClass for unnecessary arbitrary value detection */
  arbitraryEquivalents: Record<string, string>
  /**
   * Theme variable → the custom properties its value references, for the
   * variables that reference any (`--color-primary: var(--primary)`, the
   * `@theme inline` indirection shadcn/ui builds on). Sparse: literal-valued
   * theme variables are absent, which is precisely what tells a safe
   * `bg-(--primary)` → `bg-primary` rewrite from one that changes the design.
   */
  themeRefs?: Record<string, string[]>
  /**
   * Custom properties the project defines, across the entry CSS and the files it
   * `@import`s (one level). Used to tell "the variable the user referenced does
   * not exist, so the declaration is dead and suggesting a token can only improve
   * it" from "it exists and means something else, so suggesting a token would
   * change the design".
   */
  definedVars?: string[]
  /**
   * Utility prefix → the numeric theme tokens it can be written with, as
   * `[literal, className]` (`rounded` → `[['0.5rem', 'rounded-lg'], …]`).
   *
   * Only classes that emit ONE declaration whose whole value is a single `var(--x)`
   * resolving to a number. Both restrictions are what make a match an equivalence
   * rather than a guess: a colour token can never match a literal a human typed,
   * and a class that declares MORE than the original is not the same declaration —
   * `text-sm` also sets `line-height`, so `text-[14px]` is not it.
   *
   * Read by `prefer-scale-token`, which converts both sides to a common unit with
   * the configured root font size before comparing.
   */
  tokenValues?: Record<string, [string, string][]>
  /**
   * The spacing scale, for `prefer-scale-token`: the resolved value of
   * `--spacing`, the utility prefixes whose `<prefix>-1` reads it, and the
   * granularity Tailwind's own enumerated steps use (the smallest gap between
   * them — 0.5 in the default theme).
   *
   * The granularity is DERIVED rather than chosen: Tailwind compiles any number,
   * so without it every length would have a "scale equivalent" and the rule would
   * report `w-[33.7px]` → `w-8.425`. Deriving it from the steps Tailwind itself
   * enumerates is how the rule stays inside what Tailwind does.
   */
  scale?: { unit: string; step: number; prefixes: string[] }
  /**
   * Tailwind v4 project prefix (e.g. 'tw' for `@import "tailwindcss" prefix(tw)`).
   * Empty string when no prefix is configured. All other fields store class
   * names WITHOUT the prefix; this is the single source of truth for it.
   */
  prefix: string
}

/**
 * Declaration extractor, as source text, interpolated into PRECOMPUTE_SCRIPT.
 *
 * It lives in its own constant for two reasons: the benchmark in
 * `tests/benchmarks/precompute-phases.test.ts` used to keep a hand-copied
 * duplicate of the extractor that silently drifted from the real one, and it is
 * interpolated (not concatenated at runtime), so its text still feeds the
 * `SCRIPT_HASH` md5 and any edit here invalidates the disk cache automatically.
 *
 * Exports (in the worker scope): `walkDeclarations`, `scanVarReads`,
 * `isPureVarRead`.
 */
export const DECL_EXTRACTOR_SOURCE = `
// One declaration per line, '{' closing the selector line, '}' alone — the
// shape candidatesToCss pretty-prints. Verified against every fixture: zero
// unparsed declaration lines.
const DECL_RE = /^([\\w-]+)\\s*:\\s*(.*?)\\s*;?$/;

// Class-name characters, plus '\\\\' because escaped selectors continue the name
// ('.w-1\\\\/2' must not be matched by the token '.w-1').
function isNameChar(c) {
  if (c === undefined) return false;
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
    || c === '-' || c === '_' || c === '\\\\';
}

// Classify what follows the class token inside a selector:
//   '::name' → the declaration styles that pseudo-element's box
//   '>'      → a combinator intervenes, so the class is not the subject
//   ''       → the element's own box (pseudo-CLASSES land here)
// The combinator scan is paren-aware: tw-animate-css emits
// '&:where(:dir(ltr), [dir="ltr"], [dir="ltr"]*)', whose spaces and commas sit
// inside :where(). A naive "is there a space" test would mislabel 92 rules as
// descendant and silently stop reporting on the slide-in-* family.
function classifyAfter(after) {
  if (after.startsWith('::')) {
    let e = 2;
    while (e < after.length && isNameChar(after[e]) && after[e] !== '\\\\') e++;
    return after.slice(0, e);
  }
  let depth = 0;
  for (let x = 0; x < after.length; x++) {
    const ch = after[x];
    if (ch === '(') depth++;
    else if (ch === ')') { if (depth > 0) depth--; }
    else if (depth === 0) {
      if (ch === '>' || ch === '+' || ch === '~' || ch === ' ' || ch === '\\t') return '>';
      if (ch === ',') break;
    }
  }
  return '';
}

// Find the token as a COMPLETE compound ('.rounded' must not match inside
// '.rounded-lg'). Returns null when the token is absent, which the caller
// treats as element scope: that is today's behaviour for selectors we cannot
// attribute, and widening it to 'descendant' would blind the rule.
function classifyTopLevel(sel, token) {
  let from = 0;
  for (;;) {
    const i = sel.indexOf(token, from);
    if (i < 0) return null;
    if (!isNameChar(sel[i + token.length])) return classifyAfter(sel.slice(i + token.length));
    from = i + 1;
  }
}

// Nested block (CSS nesting). A selector that does not start with '&' is
// implicitly '& <sel>', i.e. a descendant — that is what keeps prose's
// ':where(p)' rules out of the element's declaration set.
function classifyNested(sel) {
  if (sel[0] !== '&') return '>';
  return classifyAfter(sel.slice(1));
}

// Tailwind emits the same value two ways: 'slide-in-from-left' declares
// '-100%' and 'slide-in-from-left-full' declares 'calc(1 * -100%)'. Same
// computed value, different text — and a text comparison would call that a
// conflict. Only a SINGLE numeric term is unwrapped, so 'calc(1 * 2px + 3px)'
// (where the multiplication is part of a larger expression) is left alone.
const CALC_ONE_LEFT = /^calc\\(\\s*1\\s*\\*\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+)[a-z%]*)\\s*\\)$/;
const CALC_ONE_RIGHT = /^calc\\(\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+)[a-z%]*)\\s*\\*\\s*1\\s*\\)$/;
function normalizeDeclValue(value) {
  const trimmed = value.trim();
  const m = CALC_ONE_LEFT.exec(trimmed) || CALC_ONE_RIGHT.exec(trimmed);
  return m ? m[1] : trimmed;
}

function walkDeclarations(cssText, className, sink) {
  const token = '.' + className.replace(/([^\\w-])/g, '\\\\$1');
  const stack = [];
  let skipDepth = 0;
  const lines = cssText.split('\\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (line === '') continue;
    if (line === '}') { if (skipDepth > 0) skipDepth--; else stack.pop(); continue; }
    if (line.charCodeAt(line.length - 1) === 123 /* { */) {
      if (skipDepth > 0) { skipDepth++; continue; }
      const sel = line.slice(0, -1).trim();
      // @property blocks describe a variable, they don't style anything: skip
      // the whole block (that also drops syntax/inherits/initial-value).
      if (sel.startsWith('@property')) { skipDepth++; continue; }
      stack.push(sel);
      continue;
    }
    if (skipDepth > 0) continue;
    const m = DECL_RE.exec(line);
    if (!m) continue;
    // Resolve the scope from the open block stack.
    let conditional = false, scope = '', seenSubject = false;
    for (let k = 0; k < stack.length; k++) {
      const sel = stack[k];
      if (sel.charCodeAt(0) === 64 /* @ */) { conditional = true; continue; }
      if (!seenSubject) {
        seenSubject = true;
        const top = classifyTopLevel(sel, token);
        scope = top === null ? '' : top;
      } else {
        const inner = classifyNested(sel);
        if (inner === '>') scope = '>';
        else if (inner !== '' && scope !== '>') scope = inner;
      }
    }
    sink((conditional ? '@' : '') + scope, m[1], normalizeDeclValue(m[2]));
  }
}

// Custom properties a value reads. 'primary' means "not inside another var()'s
// fallback" — NOT "at paren depth 0": the vars inside linear-gradient(...) are
// primary reads. Fallback reads are reported separately because a fallback is a
// last resort, not the composition channel.
function scanVarReads(value) {
  const primary = [], fallback = [];
  function walk(s, inFallback) {
    let i = 0;
    for (;;) {
      const at = s.indexOf('var(', i);
      if (at < 0) break;
      let d = 1, j = at + 4;
      while (j < s.length && d > 0) { if (s[j] === '(') d++; else if (s[j] === ')') d--; j++; }
      const inner = s.slice(at + 4, j - 1);
      let c = 0, comma = -1;
      for (let x = 0; x < inner.length; x++) {
        if (inner[x] === '(') c++;
        else if (inner[x] === ')') c--;
        else if (inner[x] === ',' && c === 0) { comma = x; break; }
      }
      const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
      if (name.startsWith('--')) (inFallback ? fallback : primary).push(name);
      if (comma >= 0) walk(inner.slice(comma + 1), true);
      i = j;
    }
  }
  walk(value, false);
  return [[...new Set(primary)], [...new Set(fallback)]];
}

// A value is a pure var() read when, with every balanced var(...) group removed,
// only separators remain. 'var(--tw-scale-x) var(--tw-scale-y)' is pure;
// 'translateZ(0) var(--tw-rotate-x,)' is not (it contributes a value of its own).
function isPureVarRead(value) {
  let rest = '', i = 0;
  while (i < value.length) {
    if (value.startsWith('var(', i)) {
      let d = 1, j = i + 4;
      while (j < value.length && d > 0) { if (value[j] === '(') d++; else if (value[j] === ')') d--; j++; }
      i = j;
      continue;
    }
    rest += value[i++];
  }
  return /^[\\s,]*$/.test(rest);
}
`

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

// The entry CSS plus every \`@import\` that resolves, one level deep. Shared by
// the component-class scan and the \`definedVars\` scan: a custom property declared
// in an imported file is as real to the browser as one in the entry, and treating
// it as undefined makes prefer-theme-tokens propose a token that can change the
// design (the #78 hazard, in miniature).
function collectCssSources(cssPath, baseDir) {
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
  return files;
}

// Class names the project writes in its own CSS, read from the SELECTORS only.
//
// This used to scan whole files with two regexes, which harvested identifiers
// from places that are not selectors at all: the URLs in Tailwind's own preflight
// comments (\`developer.mozilla.org\` → \`mozilla\`, \`org\`; \`bugs.chromium.org\`;
// \`-webkit-\`) and the decimals in declaration values (\`padding: 0.5rem\` →
// \`5rem\`). Everything here reaches \`validitySet\`, so every project accepted
// \`com\`, \`org\`, \`css\` and \`5rem\` as valid Tailwind classes.
//
// A selector is the text between the last \`{\`, \`}\` or \`;\` and the next \`{\`, so
// scanning only what precedes a \`{\` skips declaration bodies by construction —
// a declaration ends in \`;\` or \`}\` and never reaches one. Comments and strings
// are stepped over. Requiring a CSS identifier start (never a digit) is the
// second line of defence, for a decimal inside an at-rule prelude
// (\`@media (min-width: 40.5rem)\`).
function extractComponentClasses(cssPath, baseDir) {
  const files = collectCssSources(cssPath, baseDir);
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
        let m;
        while ((m = classRe.exec(prelude)) !== null) result.add(m[1]);
        prelude = '';
        continue;
      }
      if (c === '}' || c === ';') {
        // A statement at-rule carries a selector even though it has no block:
        // \`@custom-variant sidebar-open (&:where(.sidebar-open *));\` makes that
        // class load-bearing exactly the way \`group\`/\`peer\` are, so it has to
        // stay valid. Plain declarations never start with \`@\`, so this readmits
        // the selector without readmitting \`padding: 0.5rem\`.
        if (c === ';' && prelude.trimStart().charCodeAt(0) === 64) {
          classRe.lastIndex = 0;
          let m;
          while ((m = classRe.exec(prelude)) !== null) result.add(m[1]);
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
  // declarations / arbitraryEquivalents phases keep indexing by position.
  const cssResults = ds.candidatesToCss(classNames.map(pfx));
  const validClasses = classNames.filter((_, i) => cssResults[i] != null);

  // className → its emitted CSS, for the declarations phase. Every phase that
  // validates extra candidates feeds this map, so classes recovered outside
  // getClassList() (bare utilities like \`rounded\`, negatives like \`-col-1\`,
  // legacy v3 spellings) get declarations too. They used to be pushed into
  // validClasses with their CSS thrown away, which left ~300 valid classes
  // invisible to no-conflicting-classes (\`rounded rounded-lg\` never reported).
  const declCss = {};
  for (let i = 0; i < classNames.length; i++) {
    if (cssResults[i] != null) declCss[classNames[i]] = cssResults[i];
  }

  // Expand: validate extra candidates not in getClassList() but valid in v4
  const validSet = new Set(validClasses);
  const knownPrefixes = new Set();
  for (const cls of validClasses) {
    const dash = cls.lastIndexOf('-');
    if (dash > 0) knownPrefixes.add(cls.slice(0, dash));
  }
  // Curated static utilities valid in v4 but absent from getClassList() (#37).
  // These are special-cased in Tailwind's compiler, so they appear in neither
  // getClassList() NOR the utility registry (\`utilities.keys('static')\`) — only
  // an explicit probe surfaces them:
  //   - \`@container-size\` (\`container-type: size\`) — sibling of the enumerated
  //     \`@container\` / \`@container-normal\`; was flagged as a typo of \`contain-size\`.
  //   - \`filter-none\` / \`backdrop-filter-none\` (\`filter: none\`) — the reset
  //     utilities; their functional bases enumerate values but omit \`none\`.
  //   - \`max-w-screen\` (\`max-width: 100vw\`).
  // Validated via candidatesToCss (self-prunes on any Tailwind version that doesn't
  // emit them) and their CSS is captured so the declarations phase below treats them
  // exactly like their getClassList siblings — otherwise no-conflicting-classes
  // would flag \`@container @container-normal\` but silently accept
  // \`@container @container-size\`. Named forms (\`@container-size/main\`) are covered
  // by the slash-modifier path in cache.isValid once the base lands in validClasses.
  const staticExtras = [
    '@container-size',
    'filter-none',
    'backdrop-filter-none',
    'max-w-screen',
  ].filter((c) => !validSet.has(c));
  if (staticExtras.length > 0) {
    const staticResults = ds.candidatesToCss(staticExtras.map(pfx));
    for (let i = 0; i < staticExtras.length; i++) {
      if (staticResults[i] != null) {
        validClasses.push(staticExtras[i]);
        validSet.add(staticExtras[i]);
        declCss[staticExtras[i]] = staticResults[i];
      }
    }
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
        declCss[extraCandidates[i]] = extraResults[i];
      }
    }
  }

  // Negative variants of utilities that support them (#37). getClassList()
  // enumerates negatives for most (\`-m-4\`, \`-translate-x-2\`) but omits a few
  // (\`-col-1\`, \`-row-1\`, \`-hue-rotate-45\`, \`-backdrop-hue-rotate-45\`). Probe
  // \`-<prefix>-1\` for every known prefix lacking negative coverage; candidatesToCss
  // self-prunes utilities that reject negatives (\`-p-1\` → null), so only genuinely
  // negative-capable prefixes land in validClasses, giving isValid's / getOrder's
  // numeric-prefix heuristic the \`-<prefix>\` it needs to accept any \`-<prefix>-<n>\`.
  const negativeProbes = [];
  for (const prefix of knownPrefixes) {
    if (!knownPrefixes.has('-' + prefix)) negativeProbes.push('-' + prefix + '-1');
  }
  if (negativeProbes.length > 0) {
    const negResults = ds.candidatesToCss(negativeProbes.map(pfx));
    for (let i = 0; i < negativeProbes.length; i++) {
      if (negResults[i] != null && !validSet.has(negativeProbes[i])) {
        validClasses.push(negativeProbes[i]);
        validSet.add(negativeProbes[i]);
        declCss[negativeProbes[i]] = negResults[i];
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
  //
  // Two kinds, and the difference is what \`deprecated\` records:
  // - RENAMES: a v3 spelling of a utility v4 calls something else. Mirrors the
  //   internal v3->v4 map in tailwindcss/canonicalize. These ARE deprecated, and
  //   no-deprecated-classes owns them.
  // - Pattern renames (start-* -> inset-s-*, end-* -> inset-e-*), derived from
  //   the inset-{s,e}-* utilities in validClasses so every numeric/named value is
  //   covered. These are NOT deprecated: \`start-2\` is current Tailwind (it is
  //   what the docs use), it just isn't the canonical spelling. Calling it
  //   deprecated would be a lie, so only enforce-canonical speaks about it.
  const v3Renames = [
    'order-none',
    'break-words',
    'overflow-ellipsis',
    'flex-grow', 'flex-grow-0', 'flex-grow-1',
    'flex-shrink', 'flex-shrink-0', 'flex-shrink-1',
    'decoration-clone', 'decoration-slice',
    'bg-gradient-to-t', 'bg-gradient-to-tr', 'bg-gradient-to-r', 'bg-gradient-to-br',
    'bg-gradient-to-b', 'bg-gradient-to-bl', 'bg-gradient-to-l', 'bg-gradient-to-tl',
    // v3 background/object-position spellings reordered in v4 (#37):
    // \`bg-left-top\` -> \`bg-top-left\`. canonicalizeCandidates rewrites them, so
    // enforce-canonical suggests the v4 form and no-unknown-classes accepts them.
    'bg-left-top', 'bg-right-top', 'bg-left-bottom', 'bg-right-bottom',
    'object-left-top', 'object-right-top', 'object-left-bottom', 'object-right-bottom',
  ];
  const renameSet = new Set(v3Renames);
  const legacyCandidates = [...v3Renames];
  for (const cls of validClasses) {
    if (cls.startsWith('inset-s-')) legacyCandidates.push('start-' + cls.slice(8));
    else if (cls.startsWith('-inset-s-')) legacyCandidates.push('-start-' + cls.slice(9));
    else if (cls.startsWith('inset-e-')) legacyCandidates.push('end-' + cls.slice(8));
    else if (cls.startsWith('-inset-e-')) legacyCandidates.push('-end-' + cls.slice(9));
  }
  const deprecated = {};
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
        // Only a v3 rename that this Tailwind still compiles AND still renames.
        // A release that drops either of those drops the entry, so the rule can
        // never suggest a replacement for a class that no longer exists.
        if (renameSet.has(cls)) deprecated[cls] = canon;
      }
      // Mark as valid so no-unknown-classes doesn't flag legacy spellings.
      validClasses.push(cls);
      validSet.add(cls);
      declCss[cls] = legacyCssResults[i];
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

  // CSS declarations per class, interned. The walker, the scope grammar and the
  // var-read scanner live in DECL_EXTRACTOR_SOURCE above (shared with the
  // benchmark so the two can no longer drift).
  const scopeIds = new Map([['', 0]]);
  const scopeTable = [''];
  const propIds = new Map();
  const propTable = [];
  const valueIds = new Map();
  const valueTable = [];
  const declFreq = new Map();
  const perClass = {};
  const partial = [];

  for (const cls in declCss) {
    // Collect first, intern after, so the descendant-scope decision below can
    // look at the whole class.
    const raw = [];
    let hasElement = false, hasDescendant = false, hasConditional = false;
    walkDeclarations(declCss[cls], pfx(cls), (scopeTok, prop, value) => {
      raw.push([scopeTok, prop, value]);
      const conditional = scopeTok.charCodeAt(0) === 64;
      const body = conditional ? scopeTok.slice(1) : scopeTok;
      if (conditional) hasConditional = true;
      if (body === '') hasElement = true;
      else if (body === '>') hasDescendant = true;
    });

    // A class whose CSS styles BOTH itself and its descendants (\`prose\` and its
    // dozens of \`:where(p)\` rules) only advertises what it puts on the element:
    // comparing descendant declarations would turn every \`prose prose-sm\` into
    // ~40 conflicts. Classes that style ONLY descendants (\`space-x-*\`,
    // \`divide-*\`) keep them — that is what makes \`space-x-4 space-x-2\` a
    // conflict while \`ms-2 space-x-4\` is not. Pseudo-elements are always kept:
    // they are a distinct box and there are few of them.
    const dropDescendants = hasElement && hasDescendant;
    // Anything we deliberately did not model. A class in here must never be
    // called redundant: \`container\` looks like a plain \`width: 100%\` because its
    // breakpoint \`max-width\`es live in @media, so "remove it" would be wrong.
    if (dropDescendants || hasConditional) partial.push(cls);

    const keys = [];
    for (let r = 0; r < raw.length; r++) {
      const scopeTok = raw[r][0], prop = raw[r][1], value = raw[r][2];
      const body = scopeTok.charCodeAt(0) === 64 ? scopeTok.slice(1) : scopeTok;
      if (dropDescendants && body === '>') continue;
      let s = scopeIds.get(scopeTok);
      if (s === undefined) { s = scopeTable.length; scopeTable.push(scopeTok); scopeIds.set(scopeTok, s); }
      let p = propIds.get(prop);
      if (p === undefined) { p = propTable.length; propTable.push(prop); propIds.set(prop, p); }
      let v = valueIds.get(value);
      if (v === undefined) { v = valueTable.length; valueTable.push(value); valueIds.set(value, v); }
      const key = s + '|' + p + '|' + v;
      declFreq.set(key, (declFreq.get(key) || 0) + 1);
      keys.push(key);
    }
    // Kept in emission order and NOT deduplicated: a class that declares the
    // same property twice (bg-linear-to-r does, once plainly and once inside
    // @supports) keeps both. Within one block the LAST one wins, which is CSS
    // semantics — the consumer applies that, the data keeps everything.
    if (keys.length > 0) perClass[cls] = keys;
  }

  // Hottest declarations get the shortest base36 ids. Ties break on the key so
  // the artifact stays byte-reproducible for a given design system.
  const sortedKeys = [...declFreq.keys()].sort((a, b) => {
    const d = declFreq.get(b) - declFreq.get(a);
    return d !== 0 ? d : (a < b ? -1 : a > b ? 1 : 0);
  });
  const declIds = new Map();
  const table = [];
  for (let i = 0; i < sortedKeys.length; i++) {
    declIds.set(sortedKeys[i], i);
    const parts = sortedKeys[i].split('|');
    table.push(
      Number(parts[0]).toString(36) + '|' + Number(parts[1]).toString(36) + '|' + Number(parts[2]).toString(36)
    );
  }
  const byClass = {};
  for (const cls in perClass) {
    const ids = perClass[cls];
    let packed = '';
    for (let i = 0; i < ids.length; i++) {
      packed += (i === 0 ? '' : ',') + declIds.get(ids[i]).toString(36);
    }
    byClass[cls] = packed;
  }

  // Which variables a value reads is a property of the VALUE, so it is computed
  // once per interned value (~2.7k) instead of once per declaration (~55k).
  const varIds = new Map();
  const varTable = [];
  const valueVars = {};
  const valueFallbackVars = {};
  const pureValues = [];
  function internVar(name) {
    let id = varIds.get(name);
    if (id === undefined) { id = varTable.length; varTable.push(name); varIds.set(name, id); }
    return id;
  }
  for (let v = 0; v < valueTable.length; v++) {
    const reads = scanVarReads(valueTable[v]);
    if (reads[0].length > 0) valueVars[v] = reads[0].map(internVar);
    if (reads[1].length > 0) valueFallbackVars[v] = reads[1].map(internVar);
    if (isPureVarRead(valueTable[v])) pureValues.push(v);
  }

  const cssDeclarations = {
    partial,
    scopes: scopeTable,
    props: propTable,
    values: valueTable,
    vars: varTable,
    valueVars,
    valueFallbackVars,
    pureValues,
    table,
    byClass,
  };

  // Variant ordering from the design system.
  const variantOrder = {};
  const variants = ds.getVariants();
  for (let i = 0; i < variants.length; i++) {
    if (!variants[i].isArbitrary) {
      variantOrder[variants[i].name] = i;
    }
  }

  // What each variant DOES to the selector, so the variant rules can stop
  // guessing from a list of names — the list cannot know a project's own
  // \`@custom-variant\`.
  //
  // Derived by compiling a probe utility and reading the emitted selector, NOT
  // from \`variant.selectors()\`: that returns '&'-relative strings, comes back
  // empty for \`before\`/\`after\`, and reports \`group\`/\`peer\` as arbitrary with no
  // selectors at all. Compiling is the same mechanism the declaration extractor
  // already trusts, and \`walkDeclarations\` already classifies exactly what we
  // need — the scope of each emitted declaration.
  //
  // Functional variants (\`group-*\`, \`peer-*\`, \`data-*\`, \`nth-*\`) are skipped:
  // probing them would need a value, and none of them retargets the selector.
  // Measured in Tailwind 4.3.3: \`group-hover\`/\`peer-checked\` compile to
  // \`&:is(:where(.group):hover *)\` — an \`:is()\` on the element itself — so two of
  // them in either order produce equivalent selectors and neither is a
  // reordering barrier.
  const variantFacts = {};
  const probeNames = [];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    if (v.isArbitrary) continue;
    if (v.values && v.values.length > 0) continue;
    probeNames.push(v.name);
  }
  if (probeNames.length > 0) {
    const probeClasses = probeNames.map((n) => n + ':flex');
    const probeCss = ds.candidatesToCss(probeClasses.map(pfx));
    for (let i = 0; i < probeNames.length; i++) {
      if (!probeCss[i]) continue;
      let pseudo = false, structural = false;
      walkDeclarations(probeCss[i], pfx(probeClasses[i]), (scopeTok) => {
        const body = scopeTok.charCodeAt(0) === 64 ? scopeTok.slice(1) : scopeTok;
        if (body.startsWith('::')) pseudo = true;
        else if (body === '>') structural = true;
      });
      // A variant that styles a generated box is a pseudo-element variant even
      // when it ALSO reaches descendants' boxes (\`marker\` emits both
      // \`& ::marker\` and \`&::marker\`): it belongs innermost, not treated as a
      // reordering barrier.
      if (pseudo) {
        variantFacts[probeNames[i]] = { p: 1 };
      } else if (structural) {
        variantFacts[probeNames[i]] = { s: 1 };
      }
    }
  }

  // Component classes from @layer components
  const componentSet = new Set(extractComponentClasses(cssPath, base));

  // Extract class names from attribute selectors [class~="..."] in CSS output.
  // Plugins like @tailwindcss/typography use these for modifier classes (e.g. "not-prose")
  // that don't generate their own CSS but are referenced in other classes' selectors.
  // Interned in a Set: typography references \`not-prose\` from ~230 selectors, and
  // pushing one entry per occurrence only inflated the cache artifact.
  const attrClassRe = /\\[class~="([^"]+)"\\]/g;
  for (let i = 0; i < cssResults.length; i++) {
    if (cssResults[i]) {
      let acm;
      attrClassRe.lastIndex = 0;
      while ((acm = attrClassRe.exec(cssResults[i])) !== null) {
        // Typography-style plugins emit \`[class~="tw:not-prose"]\` under a prefix.
        componentSet.add(unpfx(acm[1]));
      }
    }
  }
  const componentClasses = [...componentSet];

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

  // Custom properties the project defines, across the entry AND its resolved
  // @imports — splitting the theme across files is the normal shadcn/ui layout,
  // and a definition we cannot see reads as "undefined", which is what makes
  // prefer-theme-tokens propose a token that means something else. One level
  // deep, same as the component-class scan it shares \`collectCssSources\` with.
  const definedVars = [...new Set(
    collectCssSources(cssPath, base).flatMap(src => src.match(/--[\\w-]+(?=\\s*:)/g) || [])
  )];

  const themeRefs = {};
  const themeValues = new Map();
  if (ds.theme && typeof ds.theme.entries === 'function') {
    for (const [name, entry] of ds.theme.entries()) {
      const value = entry && typeof entry.value === 'string' ? entry.value : '';
      themeValues.set(name, value);
      if (!value.includes('var(')) continue;
      const reads = scanVarReads(value);
      const all = [...new Set([...reads[0], ...reads[1]])];
      if (all.length > 0) themeRefs[name] = all;
    }
  }

  // ── What a literal value could have been written as (for prefer-scale-token) ──
  //
  // Two families, both derived. Neither is a name table: the emitted CSS says
  // which variable a class reads and the theme says what that variable is worth.

  // A single declaration whose whole value is one \`var(--x)\` that the theme
  // resolves to a NUMBER. Numeric because that is the only thing the rule can
  // compare — a colour token could never match a literal the user typed — and
  // SINGLE because a class that declares more than the original is not an
  // equivalent: \`text-sm\` sets \`line-height\` too, so \`text-[14px]\` is not it.
  const NUMERIC_LITERAL = /^-?\\d*\\.?\\d+(rem|px|em|%|s|ms|deg)?$/;
  const tokenValues = {};
  for (const cls of validClasses) {
    if (cls.includes('[') || cls.includes('/')) continue;
    const css = declCss[cls];
    if (!css) continue;
    const open = css.indexOf('{');
    const close = css.indexOf('}');
    if (open < 0 || close < 0) continue;
    const body = css.slice(open + 1, close).replace(/\\s+/g, ' ').replace(/;\\s*$/, '').trim();
    const m = /^([a-z-]+):\\s*var\\((--[\\w-]+)\\)$/.exec(body);
    if (!m) continue;
    const value = themeValues.get(m[2]);
    if (!value || !NUMERIC_LITERAL.test(value)) continue;
    const dash = cls.lastIndexOf('-');
    if (dash <= 0) continue;
    const prefix = unpfx(cls).slice(0, unpfx(cls).lastIndexOf('-'));
    if (!prefix) continue;
    if (!tokenValues[prefix]) tokenValues[prefix] = [];
    tokenValues[prefix].push([value, unpfx(cls)]);
  }

  // The spacing scale: its unit, which prefixes read it, and the granularity
  // Tailwind's own enumerated steps use. Every step getClassList() lists is a
  // multiple of that granularity, so deriving it is how the rule stays inside
  // what Tailwind does instead of inventing a threshold.
  const scaleUnit = themeValues.get('--spacing') || '';
  const scalePrefixes = [];
  if (scaleUnit) {
    const probes = [...knownPrefixes];
    const probeResults = ds.candidatesToCss(probes.map(p => pfx(p + '-1')));
    for (let i = 0; i < probes.length; i++) {
      const css = probeResults[i];
      if (!css) continue;
      // \`size-1\` emits width AND height, both reading the unit — one match is enough.
      if (css.includes('var(--spacing)')) scalePrefixes.push(probes[i]);
    }
  }
  let scaleStep = 0;
  if (scalePrefixes.length > 0) {
    const steps = new Set();
    const scaleSet = new Set(scalePrefixes);
    for (const cls of validClasses) {
      const dash = cls.lastIndexOf('-');
      if (dash <= 0) continue;
      if (!scaleSet.has(cls.slice(0, dash))) continue;
      const suffix = cls.slice(dash + 1);
      if (!/^\\d*\\.?\\d+$/.test(suffix)) continue;
      steps.add(parseFloat(suffix));
    }
    const sorted = [...steps].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.round((sorted[i] - sorted[i - 1]) * 1000) / 1000;
      if (gap > 0 && (scaleStep === 0 || gap < scaleStep)) scaleStep = gap;
    }
  }
  const scale = scaleUnit && scalePrefixes.length > 0
    ? { unit: scaleUnit, step: scaleStep || 1, prefixes: scalePrefixes.sort() }
    : undefined;

  const json = JSON.stringify({ validClasses, canonical, deprecated, order, cssDeclarations, variantOrder, variantFacts, componentClasses, arbitraryEquivalents, themeRefs, definedVars, tokenValues, scale, prefix });
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
 *   - the resolved `@tailwindcss/node` version: auto-invalidates when the engine
 *     changes (e.g. 4.2 → 4.3 adding `zoom-*`, `tab-*`, `scrollbar-*` etc.), so
 *     `validClasses`, `cssProps`, `canonical`, and `arbitraryEquivalents` reflect
 *     the installed version.
 *
 * Kept exported (with the same `${scriptHash}:${version}` shape it always had)
 * for the unit tests that pin the key format. The hot path uses `SCRIPT_HASH` +
 * the per-entry-point engine version via `computeContentHash`, NOT a single
 * module-global key — in a monorepo two packages can resolve different engines.
 */
export function computeCacheKey(scriptContent: string, tailwindVersion: string): string {
  const scriptHash = createHash('md5').update(scriptContent).digest('hex').slice(0, 8)
  return `${scriptHash}:${tailwindVersion}`
}

/** md5 of the precompute script (no version) — the version is folded in per entry point. */
const SCRIPT_HASH = createHash('md5').update(PRECOMPUTE_SCRIPT).digest('hex').slice(0, 8)

/**
 * The engine identifier folded into the content hash. Normally the resolved
 * `@tailwindcss/node` version; when that is `'unknown'` (unreadable
 * `package.json`) two genuinely different engines would both hash as `unknown`,
 * so tiebreak on the resolved path (machine-local, but the disk cache is
 * per-uid/per-machine anyway, and under pnpm the path encodes the version).
 */
function engineCacheKey(res: TailwindNodeResolution): string {
  return res.nodeVersion === 'unknown' && res.nodePath !== null
    ? `unknown@${res.nodePath}`
    : res.nodeVersion
}

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

function computeContentHash(content: string, engineVersion: string): string {
  return createHash('md5').update(`${SCRIPT_HASH}:${engineVersion}:${content}`).digest('hex')
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
 * covered by the engine version folded into the content hash. Best-effort:
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
  const res = resolveTailwindNodeFor(resolved)
  const hash = computeContentHash(hashableContent(resolved, content), engineCacheKey(res))
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
    // Validated in depth, unlike its siblings: a `cssDeclarations: {}` that
    // slipped through would leave `no-conflicting-classes` silent, and a rule
    // that quietly stops reporting is exactly the failure mode v1 forbids.
    isCssDeclarationIndex(d.cssDeclarations) &&
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

  // Parse the script before handing it to a worker. A SYNTAX error in it cannot
  // reach us any other way: `signalError` lives inside the script, so it is
  // never installed, and the worker's 'error' event cannot be read either —
  // the main thread parks in `Atomics.wait` and the event loop never turns
  // before it gives up. Without this the failure surfaced as a full-timeout
  // blaming the user's machine ("raise the timeout"), which is how an editing
  // mistake in the precompute costs an hour to find.
  try {
    new Function(PRECOMPUTE_SCRIPT)
  } catch (cause) {
    throw precomputeLoadError(resolvedPath, cause)
  }

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

  // Resolve the engine from the CONSUMER's project (issue #114), anchored on
  // the entry point's directory. The version discriminates the disk cache so a
  // monorepo's per-package engines never share a cache entry.
  const engine = resolveTailwindNodeFor(resolvedPath)
  const contentHash = computeContentHash(
    hashableContent(resolvedPath, content),
    engineCacheKey(engine),
  )
  const contentCachePath = getContentCachePath(contentHash)

  const cached = tryReadCache(contentCachePath)
  if (cached) return cached

  // The worker receives @tailwindcss/node's absolute path via workerData.
  // Bare-specifier resolution from the worker's cwd would fail under pnpm
  // strict workspaces where the consumer's project root has no direct
  // access to the plugin's transitive deps.
  if (engine.nodePath === null) {
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
    engine.nodePath,
    contentHash,
    contentCachePath,
    timeout ?? DEFAULT_LOAD_TIMEOUT_MS,
  )
}

// validateCandidatesSync removed — runtime child process calls were too slow.
// Unknown classes are now handled via precomputed expansion + heuristics in cache.isValid().
