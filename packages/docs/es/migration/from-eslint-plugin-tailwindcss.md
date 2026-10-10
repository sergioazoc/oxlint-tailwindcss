---
title: "Migrar desde eslint-plugin-tailwindcss"
description: "Pasa de eslint-plugin-tailwindcss a oxlint-tailwindcss: cada una de sus reglas y settings, qué cambia y el paso de ESLint a oxlint, paso a paso."
---

# Migrar desde eslint-plugin-tailwindcss

[eslint-plugin-tailwindcss](https://github.com/francoismassart/eslint-plugin-tailwindcss) es el
plugin de ESLint para Tailwind CSS; sus versiones 4.x leen Tailwind v4. oxlint-tailwindcss está
hecho para oxlint y Tailwind v4. Cada una de las 9 reglas de eslint-plugin-tailwindcss 4.4.0 tiene
su equivalente aquí, y cada par reporta el mismo ejemplo — las tablas de abajo se verifican contra
él cada semana, con su última versión.

## Reglas

<!-- generated:eptw-rules -->

| eslint-plugin-tailwindcss            | oxlint-tailwindcss                                                                         | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classnames-order`                   | [`enforce-sort-order`](/es/rules/enforce-sort-order)                                       | Las dos ordenan con el orden de clases de Tailwind, el que usa prettier-plugin-tailwindcss. `mode: "strict"` además agrupa las clases por cadena de variants.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `enforces-canonical-classname`       | [`enforce-canonical`](/es/rules/enforce-canonical)                                         | Las dos le piden a Tailwind la forma canónica, pero esta regla solo reescribe una clase cuando las dos imprimen el mismo CSS: `[&>*]:flex-1` → `*:flex-1` (otro selector) y `aspect-[16/9]` → `aspect-video` (una variable del tema) se quedan como están. Lo demás que la suya incluye tiene aquí su propia regla: los renombres de v3 (`bg-gradient-to-r`) son de `no-deprecated-classes`, `bg-[var(--x)]` → `bg-(--x)` de `enforce-consistent-variable-syntax`, `!p-4` → `p-4!` de `enforce-consistent-important-position` y `-m-[5px]` → `m-[-5px]` de `enforce-negative-arbitrary-values`. |
| `enforces-negative-arbitrary-values` | [`enforce-negative-arbitrary-values`](/es/rules/enforce-negative-arbitrary-values)         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `enforces-shorthand`                 | [`enforce-shorthand`](/es/rules/enforce-shorthand)                                         | Su `overflow-hidden text-ellipsis whitespace-nowrap` → `truncate` no tiene equivalente aquí. Cuatro esquinas o lados se vuelven una sola clase de una vez (`rounded-tl-md rounded-tr-md rounded-br-md rounded-bl-md` → `rounded-md`), donde la suya los une de dos en dos.                                                                                                                                                                                                                                                                                                                      |
| `important-modifier-suffix`          | [`enforce-consistent-important-position`](/es/rules/enforce-consistent-important-position) | Aquí el sufijo (`p-4!`) también es el default; `position: "prefix"` pide `!p-4`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `no-arbitrary-value`                 | [`no-arbitrary-value`](/es/rules/no-arbitrary-value)                                       | Apagada en los dos configs recomendados. Aquí `allow` tolera valores arbitrarios bajo los prefijos que listes (`grid-cols-`), `allowVariables` un valor que es solo una variable CSS, y el mensaje nombra los valores más cercanos de tu tema.                                                                                                                                                                                                                                                                                                                                                  |
| `no-contradicting-classname`         | [`no-conflicting-classes`](/es/rules/no-conflicting-classes)                               | Se decide con el CSS que imprime cada clase, y el mensaje nombra la que gana. También reporta una clase que otra vuelve redundante (`reportRedundant`), y `allow` exime pares. Una variant que repite su clase base (`flex hover:flex`) es cosa de `no-contradicting-variants`.                                                                                                                                                                                                                                                                                                                 |
| `no-custom-classname`                | [`no-unknown-classes`](/es/rules/no-unknown-classes)                                       | `whitelist` → `allowlist` para nombres exactos e `ignorePrefixes` para familias (`custom-`); una expresión regular que no sea ninguna de las dos no tiene equivalente. Las clases que define tu CSS (`@layer components`, `@utility`) siempre se conocen, y un typo recibe como sugerencia la clase más cercana.                                                                                                                                                                                                                                                                                |
| `no-unnecessary-arbitrary-value`     | [`no-unnecessary-arbitrary-value`](/es/rules/no-unnecessary-arbitrary-value)               | Esta regla solo reescribe cuando la clase con nombre imprime el mismo CSS. La suya además convierte en su token un valor igual a un paso de la escala o a un valor del tema (`m-[8px]` → `m-2`, `w-[20rem]` → `w-xs`): aquí eso es `prefer-scale-token`, como sugerencia, porque el token lee una variable que tu tema puede cambiar. `z-[123]` → `z-123` es de `enforce-canonical`.                                                                                                                                                                                                            |

<!-- /generated:eptw-rules -->

## Settings

Los dos plugins leen `settings.tailwindcss`, con claves distintas:

<!-- generated:eptw-settings -->

| eslint-plugin-tailwindcss | oxlint-tailwindcss                | Notas                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cssConfigPath`           | `entryPoint`                      | Obligatorio en los dos. Una ruta relativa se resuelve aquí contra el config de oxlint más cercano, y en el suyo contra el `eslint.config.*` o `package.json` más cercano. Un mapeo glob → CSS cubre un monorepo.                                                                                                               |
| `attributes`              | `attributes`, `attributePatterns` | Fijar el suyo reemplaza sus defaults (`class`, `className`, `ngClass`, `@apply`); aquí `attributes` se suma a `class` y `className`, y `attributePatterns` encuentra nombres con expresiones regulares. `ngClass` y `@apply` no tienen nada que encontrar: oxlint no les pasa a los JS plugins ni templates de Angular ni CSS. |
| `functions`               | `callees`, `tags`                 | El suyo es una sola lista para llamadas y tagged templates, y fijarla reemplaza los defaults; `callees` y `tags` se suman a los de este plugin. De sus defaults, `classNames(…)` y `tw(…)` como llamada no se leen aquí: agrégalos a `callees` si los usas.                                                                    |
| `parseKeyFunctions`       | —                                 | Las claves de un objeto que recibe cualquier callee se leen como clases (`cn({ "p-4": isOpen })`), y sus valores no. El suyo lee las claves solo en estas funciones (por defecto `classnames`, `classNames`, `clsx`) y los valores en las demás.                                                                               |
| `ignoredKeys`             | —                                 | Los configs de `cva` y `tv` se leen por su estructura: `defaultVariants` se salta, `compoundVariants` y `compoundSlots` se leen.                                                                                                                                                                                               |
| `cacheMaxSize`            | —                                 | El design system se guarda en caché en disco, indexado por el contenido de tu CSS, y se reconstruye cuando cambia: no hay nada que ajustar.                                                                                                                                                                                    |
| `cacheMaxAge`             | —                                 | Igual que `cacheMaxSize`.                                                                                                                                                                                                                                                                                                      |

<!-- /generated:eptw-settings -->

## El cambio, paso a paso

1. Instala oxlint y el plugin: `pnpm add -D oxlint oxlint-tailwindcss`.
2. Crea `.oxlintrc.json` con `"jsPlugins": ["oxlint-tailwindcss"]` y pasa `settings.tailwindcss` a
   las claves de este plugin con la tabla de settings: `cssConfigPath` pasa a ser `entryPoint`, que
   es obligatorio.
3. Renombra cada `tailwindcss/<regla>` al `tailwindcss/<regla>` de la tabla de reglas — los dos
   plugins usan el prefijo `tailwindcss`. O parte del [config recomendado](/es/setup) y agrega lo
   que tenías encima.
4. Quita eslint-plugin-tailwindcss de tu config de ESLint y desinstálalo. Los dos plugins se llaman
   `tailwindcss`, así que oxlint no carga los dos a la vez: se detiene con
   `Plugin name 'tailwindcss' is already registered`.
5. Corre `oxlint`, y después `oxlint --fix` para los autofixes.

Un config típico, antes:

```js
// eslint.config.mjs
import tailwindcss from "eslint-plugin-tailwindcss";
import { defineConfig } from "eslint/config";

export default defineConfig([
  tailwindcss.configs.recommended,
  {
    settings: {
      tailwindcss: {
        cssConfigPath: "./src/styles.css",
        functions: ["cn", "cva", "classNames"],
      },
    },
    rules: {
      "tailwindcss/no-custom-classname": ["warn", { whitelist: ["swiper-.*", "legacy-card"] }],
      "tailwindcss/no-arbitrary-value": "warn",
    },
  },
]);
```

Y después, con las reglas que encendía el config recomendado:

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": {
    "tailwindcss": { "entryPoint": "src/styles.css", "callees": ["classNames"] }
  },
  "rules": {
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-negative-arbitrary-values": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/no-unknown-classes": [
      "warn",
      { "ignorePrefixes": ["swiper-"], "allowlist": ["legacy-card"] }
    ],
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/no-arbitrary-value": "warn"
  }
}
```

## Qué más cambia

- **Templates de Vue y Svelte.** Su config recomendado lintea los archivos `.vue` y `.svelte`,
  templates incluidos, con los parsers de ESLint. En oxlint, los JS plugins ven solo los bloques
  `<script>` de esos archivos. Mira [Vue, Svelte y Astro](/es/frameworks).
- **Clases en variables.** Este plugin también lee los strings asignados a `className`, `classes` o
  `styles` (`variablePatterns`), que el suyo deja de lado, así que espera reportes ahí también.
- **Tailwind v3.** Este plugin lee el CSS de Tailwind v4 (v4.1.15 en adelante); un proyecto con
  `tailwind.config.js` tiene que quedarse en eslint-plugin-tailwindcss 3.x.

## Reglas que eslint-plugin-tailwindcss no tiene

Para revisar una vez hecho el cambio:

<!-- generated:eptw-extra -->

[`consistent-variant-order`](/es/rules/consistent-variant-order) ·
[`enforce-consistent-line-wrapping`](/es/rules/enforce-consistent-line-wrapping) ·
[`enforce-consistent-variable-syntax`](/es/rules/enforce-consistent-variable-syntax) ·
[`enforce-logical`](/es/rules/enforce-logical) · [`enforce-physical`](/es/rules/enforce-physical) ·
[`max-class-count`](/es/rules/max-class-count) ·
[`no-borrowed-component-styles`](/es/rules/no-borrowed-component-styles) ·
[`no-contradicting-variants`](/es/rules/no-contradicting-variants) ·
[`no-dark-without-light`](/es/rules/no-dark-without-light) ·
[`no-default-palette`](/es/rules/no-default-palette) ·
[`no-deprecated-classes`](/es/rules/no-deprecated-classes) ·
[`no-duplicate-classes`](/es/rules/no-duplicate-classes) ·
[`no-dynamic-classes`](/es/rules/no-dynamic-classes) ·
[`no-hardcoded-colors`](/es/rules/no-hardcoded-colors) ·
[`no-restricted-classes`](/es/rules/no-restricted-classes) ·
[`no-unnecessary-whitespace`](/es/rules/no-unnecessary-whitespace) ·
[`prefer-scale-token`](/es/rules/prefer-scale-token) ·
[`prefer-theme-tokens`](/es/rules/prefer-theme-tokens)
<!-- /generated:eptw-extra -->
