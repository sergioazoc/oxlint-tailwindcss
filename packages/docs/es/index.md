---
layout: home

hero:
  name: oxlint-tailwindcss
  text: Linting de Tailwind CSS para oxlint.
  tagline: 23 reglas pensadas para Tailwind v4. Determinista, rápido, fail-loud.
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
      `@theme` custom, tus variables de shadcn, tu plugin de typography.
      Sin necesidad de mantener una config paralela.
  - title: Coexiste con oxfmt y Prettier
    details: |
      Apunta `sortTailwindcss.stylesheet` de oxfmt al mismo CSS que usa
      este plugin y ambas herramientas coinciden byte a byte. La
      [guía de interop](/es/interop) lo explica.
  - title: Falla ruidoso, se arregla fácil
    details: |
      Si la configuración está mal, ves un diagnóstico
      `designSystemUnavailable` con una pista accionable — nunca reglas
      saltadas en silencio. El error te dice exactamente qué archivo y
      qué falta.
---
