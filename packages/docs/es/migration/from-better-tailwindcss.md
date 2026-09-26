---
title: "Migrar desde eslint-plugin-better-tailwindcss"
description: "Pasa de eslint-plugin-better-tailwindcss a oxlint-tailwindcss: cada una de sus reglas y settings, qué cambia y el cambio paso a paso."
---

# Migrar desde eslint-plugin-better-tailwindcss

[eslint-plugin-better-tailwindcss](https://github.com/schoero/eslint-plugin-better-tailwindcss)
corre en ESLint y, como JS plugin, en oxlint. oxlint-tailwindcss está hecho para oxlint y Tailwind
v4. Cada una de las 15 reglas de better-tailwindcss 4.7.0 tiene su equivalente aquí, y cada par
reporta el mismo ejemplo — las tablas de abajo se verifican contra él cada semana, con su última
versión.

## Reglas

<!-- generated:btw-rules -->

| better-tailwindcss                      | oxlint-tailwindcss                                                                         | Notas                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enforce-consistent-class-order`        | [`enforce-sort-order`](/es/rules/enforce-sort-order)                                       | Su `order: "official"` por defecto es el orden de esta regla. Las clases desconocidas van primero, en el orden en que están escritas, como con su `unknownClassOrder: "preserve"`. `order: "strict"` → `mode: "strict"`, que también agrupa las clases por cadena de variants (el orden dentro del grupo puede variar). `asc`, `desc` y las opciones `componentClass*` / `unknownClass*` no tienen equivalente. |
| `enforce-consistent-important-position` | [`enforce-consistent-important-position`](/es/rules/enforce-consistent-important-position) | `position: "recommended"` → `"suffix"` (el default, `p-4!`); `"legacy"` → `"prefix"` (`!p-4`).                                                                                                                                                                                                                                                                                                                  |
| `enforce-consistent-line-wrapping`      | [`enforce-consistent-line-wrapping`](/es/rules/enforce-consistent-line-wrapping)           | `printWidth`, `classesPerLine` y `group` significan lo mismo. El autofix solo reescribe template literals — un atributo string se reporta, no se reescribe — y una línea que pasa el `printWidth` se vuelve a envolver solo con `wrapLines`. `indent`, `tabWidth`, `lineBreakStyle`, `preferSingleLine`, `strictness` y `vueConvertToBinding` no tienen equivalente: la indentación sale del código.            |
| `enforce-consistent-variant-order`      | [`consistent-variant-order`](/es/rules/consistent-variant-order)                           | Las dos escriben las cadenas de afuera hacia adentro (`sm:hover:`). Esta regla además ordena color scheme y variants de atributos (`dark:hover:`, `data-[state=open]:hover:`), que la suya deja como están; `order` fija el tuyo.                                                                                                                                                                               |
| `enforce-consistent-variable-syntax`    | [`enforce-consistent-variable-syntax`](/es/rules/enforce-consistent-variable-syntax)       | `syntax: "shorthand"` es el default en las dos; `"variable"` → `"explicit"`.                                                                                                                                                                                                                                                                                                                                    |
| `enforce-shorthand-classes`             | [`enforce-shorthand`](/es/rules/enforce-shorthand)                                         |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `enforce-logical-properties`            | [`enforce-logical`](/es/rules/enforce-logical)                                             | `ignore` → `allowlist` (también expresiones regulares). `direction` la limita a las utilities inline o block; `enforce-physical` es la regla inversa.                                                                                                                                                                                                                                                           |
| `enforce-canonical-classes`             | [`enforce-canonical`](/es/rules/enforce-canonical)                                         | Su `collapse` (juntar `mt-2 mb-2` en `my-2`) aquí es `enforce-shorthand`. `ignore` y `logical` no tienen equivalente.                                                                                                                                                                                                                                                                                           |
| `no-duplicate-classes`                  | [`no-duplicate-classes`](/es/rules/no-duplicate-classes)                                   |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `no-deprecated-classes`                 | [`no-deprecated-classes`](/es/rules/no-deprecated-classes)                                 |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `no-unnecessary-whitespace`             | [`no-unnecessary-whitespace`](/es/rules/no-unnecessary-whitespace)                         | Los saltos de línea siempre se conservan, como con su `allowMultiline: true`.                                                                                                                                                                                                                                                                                                                                   |
| `no-concatenated-classes`               | [`no-dynamic-classes`](/es/rules/no-dynamic-classes)                                       | Las dos reportan una clase armada con `${}` o `+`. Esta la reporta cuando la clase armada empieza con una utility o una variant de Tailwind, así que `"p-4 " + extra` y `` `icon-${name}` `` están bien.                                                                                                                                                                                                        |
| `no-unknown-classes`                    | [`no-unknown-classes`](/es/rules/no-unknown-classes)                                       | `ignore` (expresiones regulares) → `allowlist` (nombres exactos) e `ignorePrefixes`. Las clases que define tu CSS (`@layer components`, `@utility`) siempre se conocen, así que su setting `detectComponentClasses` no tiene equivalente.                                                                                                                                                                       |
| `no-conflicting-classes`                | [`no-conflicting-classes`](/es/rules/no-conflicting-classes)                               | También reporta una clase que otra vuelve redundante (`reportRedundant`), y `allow` exime pares.                                                                                                                                                                                                                                                                                                                |
| `no-restricted-classes`                 | [`no-restricted-classes`](/es/rules/no-restricted-classes)                                 | `restrict: [{ pattern, message }]` → `patterns: [{ pattern, message }]`, y `classes` para nombres exactos. No hay `fix`.                                                                                                                                                                                                                                                                                        |

<!-- /generated:btw-rules -->

## Settings

<!-- generated:btw-settings -->

| `settings["better-tailwindcss"]` | `settings.tailwindcss`                                                                       | Notas                                                                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `entryPoint`                     | `entryPoint`                                                                                 | Aquí es obligatorio. Un string, o un mapping glob → CSS para un monorepo.                                                                                                                                          |
| `cwd`                            | `entryPoint`                                                                                 | Mapea los archivos de cada package a su CSS con `entryPoint: [{ files, use }]`, o dale al package su propio `.oxlintrc.json`.                                                                                      |
| `rootFontSize`                   | `rootFontSize`                                                                               |                                                                                                                                                                                                                    |
| `selectors`                      | `attributes`, `attributePatterns`, `callees`, `calleeExtractors`, `tags`, `variablePatterns` | Los dos leen `class` / `className`, los mismos nombres de variables y la mayoría de los helpers por defecto. Agrega lo que liste el tuyo y este no: el helper `dcnb` a `callees`, los tags `twc` / `twx` a `tags`. |
| `detectComponentClasses`         | —                                                                                            | Siempre encendido: las clases que define tu CSS se conocen.                                                                                                                                                        |
| `tailwindConfig`                 | —                                                                                            | Una config JavaScript de Tailwind v3; este plugin lee el CSS de Tailwind v4.                                                                                                                                       |
| `tsconfig`                       | —                                                                                            |                                                                                                                                                                                                                    |
| `messageStyle`                   | —                                                                                            |                                                                                                                                                                                                                    |

<!-- /generated:btw-settings -->

## El cambio, paso a paso

1. Instala el plugin: `pnpm add -D oxlint-tailwindcss` (y `oxlint`, si better-tailwindcss corría en
   ESLint).
2. En `.oxlintrc.json`, agrega `"jsPlugins": ["oxlint-tailwindcss"]` y pasa
   `settings["better-tailwindcss"]` a `settings.tailwindcss` con la tabla de settings. `entryPoint`
   es obligatorio.
3. Renombra cada `better-tailwindcss/<regla>` a la `tailwindcss/<regla>` de la tabla de reglas, y
   convierte sus opciones en las que nombran sus notas. O parte de la
   [config recomendada](/es/setup) y agrega encima lo que tenías.
4. Quita eslint-plugin-better-tailwindcss — de `jsPlugins`, o de la config de ESLint — y
   desinstálalo, para que los dos no reporten la misma clase.
5. Corre `oxlint`, y después `oxlint --fix` para los autofixes.

Una config típica, antes y después:

```jsonc
// Antes
{
  "jsPlugins": ["eslint-plugin-better-tailwindcss"],
  "settings": { "better-tailwindcss": { "entryPoint": "src/styles.css" } },
  "rules": {
    "better-tailwindcss/enforce-consistent-class-order": "warn",
    "better-tailwindcss/enforce-consistent-important-position": ["warn", { "position": "legacy" }],
    "better-tailwindcss/no-unknown-classes": ["error", { "ignore": ["^swiper-"] }],
    "better-tailwindcss/no-concatenated-classes": "error"
  }
}

// Después
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": { "tailwindcss": { "entryPoint": "src/styles.css" } },
  "rules": {
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-consistent-important-position": ["warn", { "position": "prefix" }],
    "tailwindcss/no-unknown-classes": ["error", { "ignorePrefixes": ["swiper-"] }],
    "tailwindcss/no-dynamic-classes": "error"
  }
}
```

## Qué más cambia

- **Templates de Vue, Svelte y Astro.** En oxlint, los JS plugins ven solo los bloques `<script>` de
  esos archivos — better-tailwindcss corriendo en ESLint con un parser de framework también lee los
  templates. Mira [Vue, Svelte y Astro](/es/frameworks).
- **Tailwind v3.** Este plugin lee el CSS de Tailwind v4 (v4.1.15 en adelante); un proyecto con
  `tailwind.config.js` tiene que quedarse en better-tailwindcss.

## Reglas que better-tailwindcss no tiene

Para revisar una vez hecho el cambio:

<!-- generated:btw-extra -->

[`enforce-negative-arbitrary-values`](/es/rules/enforce-negative-arbitrary-values) ·
[`enforce-physical`](/es/rules/enforce-physical) · [`max-class-count`](/es/rules/max-class-count) ·
[`no-arbitrary-value`](/es/rules/no-arbitrary-value) ·
[`no-contradicting-variants`](/es/rules/no-contradicting-variants) ·
[`no-dark-without-light`](/es/rules/no-dark-without-light) ·
[`no-default-palette`](/es/rules/no-default-palette) ·
[`no-hardcoded-colors`](/es/rules/no-hardcoded-colors) ·
[`no-unnecessary-arbitrary-value`](/es/rules/no-unnecessary-arbitrary-value) ·
[`prefer-scale-token`](/es/rules/prefer-scale-token) ·
[`prefer-theme-tokens`](/es/rules/prefer-theme-tokens)
<!-- /generated:btw-extra -->
