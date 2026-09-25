// Fetch the pinned benchmark corpus: shadcn-ui/ui apps/v4 at a fixed commit.
//
// The corpus lives in bench/.corpus/ui (gitignored). It resolves `tailwindcss`,
// `tw-animate-css` and `shadcn/tailwind.css` from bench/node_modules, because
// Node walks up from bench/.corpus/ui/apps/v4 — so run `npm ci` in bench/ first.
//
// Usage: node corpus.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CORPUS_REPO = 'https://github.com/shadcn-ui/ui.git'
export const CORPUS_SHA = '98a1fe67b439324ddc857f47fbdce056600a4329'

const BENCH = dirname(fileURLToPath(import.meta.url))
export const CORPUS_DIR = join(BENCH, '.corpus/ui')
export const CORPUS_APP = join(CORPUS_DIR, 'apps/v4')

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}

function headSha() {
  try {
    return git('-C', CORPUS_DIR, 'rev-parse', 'HEAD')
  } catch {
    return null
  }
}

export function ensureCorpus() {
  if (existsSync(CORPUS_DIR) && headSha() === CORPUS_SHA) return CORPUS_APP
  if (!existsSync(CORPUS_DIR)) {
    mkdirSync(dirname(CORPUS_DIR), { recursive: true })
    git('clone', '--filter=blob:none', '--no-checkout', CORPUS_REPO, CORPUS_DIR)
  }
  git('-C', CORPUS_DIR, 'sparse-checkout', 'set', 'apps/v4')
  git('-C', CORPUS_DIR, 'fetch', '--filter=blob:none', 'origin', CORPUS_SHA)
  git('-C', CORPUS_DIR, 'checkout', '--detach', CORPUS_SHA)
  const sha = headSha()
  if (sha !== CORPUS_SHA) throw new Error(`corpus is at ${sha}, expected ${CORPUS_SHA}`)
  return CORPUS_APP
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`corpus ready at ${ensureCorpus()} (${CORPUS_SHA})`)
}
