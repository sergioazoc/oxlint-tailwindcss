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
  // A prefixed design system only resolves the PREFIXED form (\`tw:p-[5px]\`), and
  // the host asks with prefix-free names — \`extractUtility\` strips the project
  // prefix along with the variants. Same invariant the precompute follows: apply
  // the prefix only when talking to the design system, key everything returned
  // prefix-free. Without this the service resolved NOTHING in a prefixed project,
  // so every user-written value went silently uncompared.
  const prefix = (ds.theme && ds.theme.prefix) || '';
  const pfx = (c) => (prefix && !c.startsWith(prefix + ':')) ? prefix + ':' + c : c;
  const css = ds.candidatesToCss(request.classes.map(pfx));
  for (let i = 0; i < request.classes.length; i++) {
    if (!css[i]) continue;
    const cls = request.classes[i];
    const list = [];
    // The selector carries the prefix, so the scope classifier needs the
    // prefixed name even though the result is keyed by the bare one.
    walkDeclarations(css[i], pfx(cls), (scope, prop, value) => {
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
 * Classes already asked about, per design-system CACHE — not per entry point. A
 * miss is remembered too: a class the design system produces no CSS for must not
 * be re-queried on every AST node it appears in.
 *
 * The lifetime has to match the cache's, because that is where the answers are
 * interned. Keyed by path, a rebuilt cache (an mtime bump in a long-lived editor
 * process, or `resetDesignSystem()`) inherited a fully-populated set and could
 * never re-learn: the rule went permanently blind to user-written values with no
 * diagnostic. A WeakMap also means there is nothing to reset.
 */
const queried = new WeakMap<DesignSystemCache, Set<string>>()

function queriedFor(cache: DesignSystemCache): Set<string> {
  let set = queried.get(cache)
  if (!set) {
    set = new Set()
    queried.set(cache, set)
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
  cache: DesignSystemCache,
  classes: string[],
): DeclarationResponse | null {
  const seen = queriedFor(cache)
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

/** Test hook: drops the warm workers. The query memo dies with its cache. */
export function resetDeclarationService(): void {
  declWorker.reset()
}
