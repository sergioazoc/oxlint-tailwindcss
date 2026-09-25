---
title: Vue, Svelte y Astro
description:
  Qué partes de los archivos .vue, .svelte y .astro revisa hoy oxlint-tailwindcss (los bloques de
  script), cuáles todavía no (templates y markup) y cómo mantener cubiertas las listas de clases.
---

# Vue, Svelte y Astro

**Respuesta corta:** oxlint-tailwindcss revisa cada string de clases que oxlint le deja ver a un
plugin. En los archivos `.vue`, `.svelte` y `.astro` eso es el **script**, no el template: oxlint le
pasa a los plugins JS los bloques `<script>` (y el frontmatter de Astro) y nunca el markup. Las
clases escritas en un template todavía no se revisan.

Así se comporta oxlint 1.85, y la suite end-to-end del plugin lo fija contra el binario real.

## Qué se lintea

| Archivo                                               | Se revisa                                                                              | No se revisa                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `.js` `.jsx` `.ts` `.tsx` `.mjs` `.cjs` `.mts` `.cts` | El archivo completo                                                                    | —                                                   |
| `.vue`                                                | Cada bloque `<script>` y `<script setup>`, incluido JSX en `lang="tsx"` / `lang="jsx"` | `<template>` (`class="…"`, `:class="…"`), `<style>` |
| `.svelte`                                             | `<script module>` y el `<script>` de instancia                                         | El markup (`class="…"`, `class:…`), `<style>`       |
| `.astro`                                              | El frontmatter (`---`) y las etiquetas `<script>`                                      | El markup, `<style>`                                |
| `.html`, `.md`, `.mdx`                                | oxlint no los lintea                                                                   | —                                                   |

## Qué significa en la práctica

- **Las listas de clases definidas en el script están cubiertas.** Eso incluye las variantes de
  `cva()` / `tv()` en `<script setup>` o en un archivo `.ts` junto al componente (shadcn-vue, por
  ejemplo, guarda `buttonVariants` en `index.ts`), las llamadas a `cn()` / `clsx()` y las variables
  con nombres como `classes` o `className`. Ver [settings](/es/settings) para la lista completa de
  detección.
- **Las clases escritas directamente en el template no.** `class="flex flex"` dentro de un
  `<template>` no se toca. Si quieres que una lista de clases se revise, arma la lista en el script
  con un helper que el plugin lee — `const cardClasses = cn('…')`, o una definición `cva()` / `tv()`
  — y enlázala (`:class="cardClasses"`). Un string suelto solo cuenta si la variable se llama como
  `classes`, `className(s)` o `style(s)`, o coincide con tus propios
  [`variablePatterns`](/es/settings#configuracion-del-extractor).
- **Los fixes caen donde corresponde.** Los diagnósticos y los autofixes apuntan a las líneas
  correctas del archivo, los templates nunca se tocan, y el texto no-ASCII antes de un string de
  clases no desplaza un fix.
- **Deja `<script …>` en una sola línea.** Hoy oxlint se salta una etiqueta de apertura `<script` de
  Vue que ocupa varias líneas ([oxc#26289](https://github.com/oxc-project/oxc/pull/26289)).

## Ordenar las clases del template

El `sortTailwindcss` de [oxfmt](https://oxc.rs/docs/guide/usage/formatter) ordena los atributos de
clase en **templates `.vue`** (no en `.svelte` ni `.astro`), con el mismo orden de Tailwind que
[`enforce-sort-order`](/es/rules/enforce-sort-order). Si formateas con oxfmt, las clases de los
templates de Vue quedan ordenadas aunque el linter no pueda verlas. Ver [Interop](/es/interop) para
la configuración.

## ¿Cuándo se van a lintear los templates?

Depende de que oxlint exponga los templates de los SFC a los plugins JS. Ese trabajo se sigue
upstream en el RFC de Language Plugins
([oxc#21936](https://github.com/oxc-project/oxc/discussions/21936)), su issue paraguas
([oxc#23207](https://github.com/oxc-project/oxc/issues/23207)) y
[oxc#20501](https://github.com/oxc-project/oxc/pull/20501) (reportar en las posiciones reales del
archivo). Nada de eso salió todavía en oxlint 1.85.

La suite de tests del plugin incluye canarios que fallan el día que oxlint cambie lo que los plugins
pueden ver. El soporte de templates llega cuando oxlint lo haga posible.
