# oxlint-tailwindcss monorepo

This repository contains the [oxlint-tailwindcss](./packages/oxlint-tailwindcss) plugin and its [documentation site](./packages/docs).

## Packages

- **[`packages/oxlint-tailwindcss`](./packages/oxlint-tailwindcss)** — the published npm package. Tailwind CSS linting rules for [oxlint](https://oxc.rs/docs/guide/usage/linter). See its [README](./packages/oxlint-tailwindcss/README.md) for installation and configuration.
- **[`packages/docs`](./packages/docs)** — the VitePress site published at [oxlint-tailwindcss.pages.dev](https://oxlint-tailwindcss.pages.dev). Source for the user-facing documentation.

## Development

```bash
pnpm install           # install all workspaces
pnpm build             # build the plugin
pnpm test              # run the plugin's test suite
pnpm -C packages/docs dev   # run docs site locally
```

All top-level scripts (`build`, `test`, `lint`, `format`, `typecheck`) delegate to `packages/oxlint-tailwindcss`. To target a specific package use `pnpm -C packages/<name> <script>`.

## License

[MIT](./LICENSE)
