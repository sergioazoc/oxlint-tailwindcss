---
layout: home
title: "Linting de Tailwind CSS para oxlint"
description: "oxlint-tailwindcss es el plugin de oxlint para Tailwind CSS v4: reglas de lint que revisan tus clases contra tu propio design system, con autofixes."

hero:
  name: oxlint-tailwindcss
  text: Linting de Tailwind CSS para oxlint.
  tagline: 27 reglas pensadas para Tailwind v4. Determinista, rápido, fail-loud.
  actions:
    - theme: brand
      text: Empezar
      link: /es/setup
    - theme: alt
      text: Reglas
      link: /es/rules/
    - theme: alt
      text: Ver en GitHub
      link: https://github.com/sergioazoc/oxlint-tailwindcss

features:
  - title: Configuras una vez
    details: |
      `settings.tailwindcss.entryPoint` es obligatorio y explícito. Sin
      auto-detect de filesystem, sin sorpresas entre máquinas. Mismo
      input, mismo output.
  - title: Nativo de Tailwind v4
    details: |
      Llama a `@tailwindcss/node` directamente para entender tus tokens
      `@theme` personalizados, tus variables de shadcn, tu plugin de tipografía.
      Sin necesidad de mantener una config paralela.
  - title: Coexiste con oxfmt y Prettier
    details: |
      Apunta el `sortTailwindcss` de oxfmt al mismo CSS que usa este plugin
      y lista tus helpers de clases, y ambas ordenan igual. La
      [guía de interop](/es/interop) lo explica.
  - title: Falla ruidoso, se arregla fácil
    details: |
      Si la configuración está mal, ves un diagnóstico
      `designSystemUnavailable` con una pista accionable — nunca reglas
      saltadas en silencio — y un setting mal escrito se nombra, junto
      al que querías poner.
---

## ¿Qué es oxlint-tailwindcss?

oxlint-tailwindcss es un plugin de [oxlint](https://oxc.rs/docs/guide/usage/linter), el linter del
proyecto Oxc, que linta los nombres de clases de Tailwind CSS v4. Carga el design system de tu
proyecto desde el entry point CSS que configuras — sus tokens de `@theme`, sus definiciones
`@utility` y `@custom-variant` y sus plugins — y revisa contra él cada string de clases en JSX, TSX,
JavaScript y TypeScript (y el `<script>` de los archivos Vue, Svelte y Astro), con 27 reglas, la
mayoría con autofix.

## Qué detecta

- **Clases que Tailwind no puede generar**: un typo como `itms-center`, junto a la clase que querías
  — [`no-unknown-classes`](/es/rules/no-unknown-classes).
- **Clases que se pisan entre sí**: `p-4 p-6`, o `line-clamp-1 flex`, donde `flex` reemplaza el
  `display` del clamp — [`no-conflicting-classes`](/es/rules/no-conflicting-classes).
- **Clases armadas en runtime**, que no tienen CSS: `` `bg-${color}-500` `` —
  [`no-dynamic-classes`](/es/rules/no-dynamic-classes).
- **Clases que Tailwind v4 renombró**: `flex-shrink-0` → `shrink-0` —
  [`no-deprecated-classes`](/es/rules/no-deprecated-classes).
- **Un color de modo oscuro sin base para el modo claro** —
  [`no-dark-without-light`](/es/rules/no-dark-without-light).
- **Valores que tu theme ya nombra**: `p-[10px]` → `p-2.5`, `bg-(--primary)` → `bg-primary` —
  [`prefer-scale-token`](/es/rules/prefer-scale-token),
  [`prefer-theme-tokens`](/es/rules/prefer-theme-tokens).
- **Orden y forma**: orden de clases y variants, formas canónicas y shorthand, espacios —
  [`enforce-sort-order`](/es/rules/enforce-sort-order),
  [`consistent-variant-order`](/es/rules/consistent-variant-order),
  [`enforce-canonical`](/es/rules/enforce-canonical), y [el resto](/es/rules/).

## Inicio rápido

```bash
pnpm add -D oxlint oxlint-tailwindcss
```

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": { "tailwindcss": { "entryPoint": "src/styles.css" } },
  "rules": {
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-conflicting-classes": "error"
  }
}
```

```bash
npx oxlint
```

`entryPoint` es el archivo CSS donde haces `@import "tailwindcss"`. [Setup](/es/setup) tiene las
reglas recomendadas y el setup del editor, el monorepo y el formateador.
