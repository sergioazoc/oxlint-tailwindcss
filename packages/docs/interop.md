# Interop with oxfmt and prettier-plugin-tailwindcss

`oxlint-tailwindcss/enforce-sort-order` produces the exact official Tailwind sort order — the same
one that [prettier-plugin-tailwindcss](https://github.com/tailwindlabs/prettier-plugin-tailwindcss)
and [oxfmt](https://oxc.rs/docs/guide/usage/formatter)'s `sortTailwindcss` use. The three tools
agree byte-for-byte **if they read the same CSS**.

The catch: by default, prettier-plugin-tailwindcss (and oxfmt, which delegates to it) reads the
`theme.css` bundled inside the installed `tailwindcss` npm package — **not your project's CSS**. If
your project has a `@theme { ... }` block with custom tokens, oxfmt doesn't know they exist, and its
sort order will disagree with `enforce-sort-order` on those tokens.

## The fix: align the stylesheet

Point oxfmt's `sortTailwindcss.stylesheet` at the same CSS this plugin reads:

```jsonc
// .oxfmtrc.json
{
  "sortTailwindcss": {
    "stylesheet": "./src/styles.css"
  }
}
```

That single line makes both tools load identical input and produce identical output. The same
applies to prettier:

```jsonc
// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles.css"
}
```

## Why this isn't fixed upstream

The Tailwind team
[intentionally requires explicit config](https://github.com/tailwindlabs/prettier-plugin-tailwindcss/issues/389)
for the stylesheet in v4. There's no convention like `tailwind.config.js` to auto-detect in v4 — CSS
files can live anywhere and be named anything. The plugin defaults to the bundled `theme.css` rather
than guess.

`oxlint-tailwindcss` v1 follows the same philosophy (explicit `entryPoint`), so the only step needed
for consistency is to tell each tool the same path.

## What about `tailwindcss-animate` and `@tailwindcss/typography`?

If you use plugins that register classes (e.g. `prose-*`, `animate-in`), they're imported via your
`@import` in CSS — both tools will pick them up automatically as long as they're reading the same
stylesheet.

## Multiple stylesheets per project

If different parts of your monorepo use different CSS files, see the [monorepo guide](/monorepo).
The same patterns apply to oxfmt — you can use
[overrides in `.oxfmtrc`](https://oxc.rs/docs/guide/usage/formatter#configuration) to point
different file globs at different stylesheets.
