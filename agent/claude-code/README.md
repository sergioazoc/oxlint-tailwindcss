# oxlint-tailwindcss for Claude Code

The Claude Code plugin of [oxlint-tailwindcss](https://oxlint-tailwindcss.pages.dev). Install it
from this repo's marketplace:

```text
/plugin marketplace add sergioazoc/oxlint-tailwindcss
/plugin install oxlint-tailwindcss@oxlint-tailwindcss
```

- `.lsp.json` — starts the project's own `oxlint --lsp` (`scripts/oxlint-lsp.mjs`), so Claude sees
  oxlint's and oxlint-tailwindcss's diagnostics on the files it opens and edits.
- `hooks/hooks.json` — PostToolUse notes each file Claude edits (`scripts/record-edit.mjs`); Stop
  lints them with the project's oxlint and sends Claude back once with the `tailwindcss(...)` errors
  (`scripts/stop-lint.mjs`).
- `skills/oxlint-tailwindcss` — the agent skill, copied from the repo's `skills/` by
  `pnpm -C packages/docs generate`.

The project needs `oxlint` and `oxlint-tailwindcss` installed and configured; see
[AI coding agents](https://oxlint-tailwindcss.pages.dev/ai-agents). The logic lives in
`scripts/lib.mjs`, tested in `packages/oxlint-tailwindcss/tests/agent/` and, end to end with the
real oxlint, in `tests/e2e/agent-stop-hook.test.ts` and `tests/e2e/oxlint-lsp.test.ts`.
