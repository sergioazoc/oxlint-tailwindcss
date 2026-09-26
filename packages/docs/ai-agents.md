---
title: "oxlint-tailwindcss for AI coding agents"
description: "Use oxlint-tailwindcss with AI coding agents: a skill that sets it up, and a Claude Code plugin that checks the Tailwind classes Claude writes."
---

# AI coding agents

Agents write Tailwind classes fast, and get them wrong the way people do: a typo, a palette color
instead of a theme one, two classes that override each other, a component rebuilt by hand.
oxlint-tailwindcss reports those with the fix in the message, which an agent can act on without
help. Two things make that automatic.

## The skill

```bash
npx skills add sergioazoc/oxlint-tailwindcss --skill oxlint-tailwindcss
```

It installs
[`skills/oxlint-tailwindcss/SKILL.md`](https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/skills/oxlint-tailwindcss/SKILL.md)
for the agents `npx skills` supports. It tells the agent how to set the plugin up — the
requirements, the entry point, the [recommended config](/setup#3-recommended-starter-rule-set) — and
what to do about each diagnostic.

## The Claude Code plugin

In Claude Code:

```text
/plugin marketplace add sergioazoc/oxlint-tailwindcss
/plugin install oxlint-tailwindcss@oxlint-tailwindcss
```

It adds three things:

- **Diagnostics as Claude works.** It starts your project's `oxlint --lsp` as a language server, so
  Claude sees oxlint-tailwindcss's reports — and oxlint's — on the files it opens and edits.
- **A check before Claude finishes.** It notes each file Claude edits; when Claude is about to
  finish, it lints those files and, if oxlint-tailwindcss reports errors in them, sends Claude back
  with the list. Warnings and files Claude didn't touch don't count, and it never sends Claude back
  twice in a row.
- **The skill** above.

It runs your project's own oxlint (`node_modules/.bin/oxlint`, found from the project root up) with
your `.oxlintrc.json`, so install `oxlint` and `oxlint-tailwindcss` in the project and
[set it up](/setup) first. Without them, the plugin does nothing.

## Any agent

- Every page of these docs is also plain markdown at the same path, with `.md`
  ([`/setup.md`](https://oxlint-tailwindcss.pages.dev/setup.md)), and
  [`/llms.txt`](https://oxlint-tailwindcss.pages.dev/llms.txt) lists them.
- oxlint switches to a terse output format of its own when it detects that an agent runs it, which
  keeps the diagnostics short in an agent's context.
