---
layout: home
title: "Linting de Tailwind CSS para oxlint"
description: "oxlint-tailwindcss es el plugin de oxlint para Tailwind CSS v4: reglas de lint que revisan tus clases contra tu propio design system, con autofixes."

hero:
  name: oxlint-tailwindcss
  text: Linting de Tailwind CSS para oxlint.
  tagline: 25 reglas pensadas para Tailwind v4. Determinista, rápido, fail-loud.
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
