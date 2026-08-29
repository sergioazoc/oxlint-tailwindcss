/**
 * Declarations for classes the precompute never saw.
 *
 * The precompute enumerates the design system's class list, so it cannot know
 * `p-[5px]`, `bg-red-500/50` or `gap-13` — values the user writes. Those classes
 * therefore had no declarations at all, and `no-conflicting-classes` compared
 * nothing: `p-4 p-6` was reported while `p-4 p-[5px]` was silently accepted,
 * which is a worse failure than a false positive because it looks like coverage.
 *
 * This asks the design system directly, at lint time, over the same worker
 * machinery `sort-service` and `canonicalize-service` use. The extractor is the
 * one in `sync-loader`'s `DECL_EXTRACTOR_SOURCE`, interpolated into the worker,
 * so lint-time declarations are parsed by exactly the same code as precomputed
 * ones — including the per-value variable analysis, which the worker returns so
 * the host never has to reimplement it.
 */

import { type DesignSystemCache } from './cache'
import { DesignSystemWorker, makeWorkerScript } from './ds-worker'
import { DECL_EXTRACTOR_SOURCE } from './sync-loader'

interface DeclarationRequest {
  classes: string[]
}

/** `[scope token, property, value]`, the same triple the precompute interns. */
export type RawDeclaration = [string, string, string]

/** Per-value analysis, computed in the worker where the extractor lives. */
export interface ValueFacts {
  /** Custom properties read directly. */
  p: string[]
  /** Custom properties read only inside a `var()` fallback. */
  f: string[]
  /** Whether the value is nothing but `var()` reads. */
  u: boolean
}

export interface DeclarationResponse {
  decls: Record<string, RawDeclaration[]>
  values: Record<string, ValueFacts>
  /**
   * Classes the design system produces NO CSS for. Distinct from "absent from
   * `decls`", which also covers a class that compiles to something the extractor
   * emits no declarations for — `no-unknown-classes` needs the difference, since
   * one means the class is invalid and the other doesn't.
   */
  invalid: string[]
}

export const DECLARATION_HANDLER = `(ds, request) => {
  const decls = {};
  const values = {};
  const invalid = [];
  // A prefixed design system only resolves the PREFIXED form (\`tw:p-[5px]\`), and
  // the host asks with prefix-free names — \`extractUtility\` strips the project
  // prefix along with the variants. Same invariant the precompute follows: apply
  // the prefix only when talking to the design system, key everything returned
  // prefix-free. Without this the service resolved NOTHING in a prefixed project,
  // so every user-written value went silently uncompared.
  const prefix = (ds.theme && ds.theme.prefix) || '';
  const pfx = (c) => (prefix && !c.startsWith(prefix + ':')) ? prefix + ':' + c : c;
  // Resolve one class at a time rather than a single batch call: a malformed/
  // mid-typing arbitrary value can make ds.candidatesToCss throw on some engine
  // versions (#130), and a batched throw blanked the whole request AND masked
  // real typos (a valid sibling like \`bg-red-5000\` went unflagged), then became
  // the worker's 'null' sentinel → a process-sticky fatal error. Per-class,
  // distinguish a THROW (incanonicalizable input → OMIT, so no-unknown-classes
  // stays lenient instead of flagging a transient false "unknown class") from a
  // FALSY result (compiles to nothing → invalid).
  for (let i = 0; i < request.classes.length; i++) {
    const cls = request.classes[i];
    let one;
    try {
      const out = ds.candidatesToCss([pfx(cls)]);
      one = out && out[0];
    } catch (e) {
      continue; // omit: neither decls nor invalid
    }
    if (!one) { invalid.push(cls); continue; }
    const list = [];
    // The selector carries the prefix, so the scope classifier needs the
    // prefixed name even though the result is keyed by the bare one.
    walkDeclarations(one, pfx(cls), (scope, prop, value) => {
      list.push([scope, prop, value]);
      if (!(value in values)) {
        const reads = scanVarReads(value);
        values[value] = { p: reads[0], f: reads[1], u: isPureVarRead(value) };
      }
    });
    if (list.length > 0) decls[cls] = list;
  }
  return { decls, values, invalid };
}`

const WORKER_SCRIPT = makeWorkerScript(DECLARATION_HANDLER, DECL_EXTRACTOR_SOURCE)

const declWorker = new DesignSystemWorker<DeclarationRequest, DeclarationResponse>({
  workerScript: WORKER_SCRIPT,
  serviceName: 'declarations',
})

/**
 * Everything already asked about, per design-system CACHE — not per entry point:
 * class name → does the design system produce CSS for it. A miss is remembered
 * too, so a class that compiles to nothing is not re-queried on every AST node it
 * appears in.
 *
 * The lifetime has to match the cache's, because that is where the declarations
 * are interned. Keyed by path, a rebuilt cache (an mtime bump in a long-lived
 * editor process, or `resetDesignSystem()`) inherited a fully-populated map and
 * could never re-learn: the rules went permanently blind to user-written values
 * with no diagnostic. A WeakMap also means there is nothing to reset.
 */
const answers = new WeakMap<DesignSystemCache, Map<string, boolean>>()

function answersFor(cache: DesignSystemCache): Map<string, boolean> {
  let map = answers.get(cache)
  if (!map) {
    map = new Map()
    answers.set(cache, map)
  }
  return map
}

/**
 * Ask the design system about every class there is no answer for yet, intern the
 * declarations it returns, and record which classes produce no CSS at all.
 *
 * **Throws `SortServiceError` when the service is unavailable**, like the sort and
 * canonicalize services do. It used to swallow the failure and report "no
 * information", which was defensible when `no-conflicting-classes` was the only
 * caller — no declarations means no comparison, so the rule just went quiet. It
 * stopped being defensible once `no-unknown-classes` started asking about
 * VALIDITY: there, silence sends the rule back to the tolerant heuristic, so a
 * dead worker quietly reinstates the very false negatives the service exists to
 * remove, with nothing anywhere to say so.
 *
 * The caller decides what to do, and the two postures already exist in the
 * plugin: a DS-dependent rule surfaces it through `safeGetDS` as
 * `designSystemUnavailable` (what `enforce-canonical` does with the canonicalize
 * worker), a DS-OPTIONAL rule catches it and degrades.
 */
function ask(cssPath: string, cache: DesignSystemCache, classes: string[]): void {
  const known = answersFor(cache)
  const pending = [...new Set(classes.filter((cls) => !known.has(cls)))]
  if (pending.length === 0) return

  const response: DeclarationResponse = declWorker.callSync(cssPath, { classes: pending })

  const invalid = new Set(response.invalid)
  for (const cls of pending) known.set(cls, !invalid.has(cls))
  for (const [cls, raws] of Object.entries(response.decls)) {
    cache.internDeclarations(cls, raws, response.values)
  }
}

/**
 * Resolve and intern declarations for `classes` that the precompute doesn't know.
 * They land in the cache, so the caller reads them back through
 * `cache.getCssDeclarations` like any other class.
 *
 * Throws `SortServiceError` if the service is unavailable — see `ask`.
 */
export function resolveDeclarationsSync(
  cssPath: string,
  cache: DesignSystemCache,
  classes: string[],
): void {
  ask(cssPath, cache, classes)
}

/**
 * Which of these classes produce CSS.
 *
 * This is what makes validity exact for the classes the precompute cannot
 * enumerate: `w-45` and `bg-red-5000` are shaped identically, and only Tailwind
 * knows that it compiles the first and not the second. Throws
 * `SortServiceError` if the service is unavailable — see `ask`.
 */
export function validateClassesSync(
  cssPath: string,
  cache: DesignSystemCache,
  classes: string[],
): Map<string, boolean> {
  ask(cssPath, cache, classes)
  return answersFor(cache)
}

/** Test hook: drops the warm workers. The answers die with their cache. */
export function resetDeclarationService(): void {
  declWorker.reset()
}
