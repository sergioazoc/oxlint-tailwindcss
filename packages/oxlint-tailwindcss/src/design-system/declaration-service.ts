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

import { DesignSystemWorker, makeWorkerScript } from './ds-worker'
import { DECL_EXTRACTOR_SOURCE } from './sync-loader'
import { SortServiceError } from '../utils/fatal'

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
}

const DECLARATION_HANDLER = `(ds, request) => {
  const decls = {};
  const values = {};
  const css = ds.candidatesToCss(request.classes);
  for (let i = 0; i < request.classes.length; i++) {
    if (!css[i]) continue;
    const cls = request.classes[i];
    const list = [];
    walkDeclarations(css[i], cls, (scope, prop, value) => {
      list.push([scope, prop, value]);
      if (!(value in values)) {
        const reads = scanVarReads(value);
        values[value] = { p: reads[0], f: reads[1], u: isPureVarRead(value) };
      }
    });
    if (list.length > 0) decls[cls] = list;
  }
  return { decls, values };
}`

const WORKER_SCRIPT = makeWorkerScript(DECLARATION_HANDLER, DECL_EXTRACTOR_SOURCE)

const declWorker = new DesignSystemWorker<DeclarationRequest, DeclarationResponse>({
  workerScript: WORKER_SCRIPT,
  serviceName: 'declarations',
})

/**
 * Classes already asked about, per entry point. A miss is cached as an empty
 * result: a class the design system produces no CSS for must not be re-queried
 * on every AST node it appears in.
 */
const queried = new Map<string, Set<string>>()

function queriedFor(cssPath: string): Set<string> {
  let set = queried.get(cssPath)
  if (!set) {
    set = new Set()
    queried.set(cssPath, set)
  }
  return set
}

/**
 * Resolve declarations for `classes` that the precompute doesn't know.
 *
 * Returns null when the service is unavailable, which the caller treats as "no
 * information" — the same posture as a class with no declarations, so a broken
 * worker degrades to today's silence rather than to wrong diagnostics. Real
 * failures still surface through the sticky error the worker records.
 */
export function resolveDeclarationsSync(
  cssPath: string,
  classes: string[],
): DeclarationResponse | null {
  const seen = queriedFor(cssPath)
  const pending = classes.filter((cls) => !seen.has(cls))
  if (pending.length === 0) return null
  for (const cls of pending) seen.add(cls)

  try {
    return declWorker.callSync(cssPath, { classes: pending })
  } catch (error) {
    if (error instanceof SortServiceError) return null
    throw error
  }
}

/** Test hook: drops the per-entry-point query memo and the warm workers. */
export function resetDeclarationService(): void {
  queried.clear()
  declWorker.reset()
}
