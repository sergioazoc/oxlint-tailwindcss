---
title: "Instalación y configuración"
description: "Instala oxlint-tailwindcss, apúntalo a tu CSS de entrada de Tailwind y activa sus reglas: requisitos, una config inicial y qué cubre cada tipo de archivo."
---

# Setup

Todo lo necesario para tener `oxlint-tailwindcss` corriendo en un proyecto, en una sola página.
Elige la sección que coincida con la forma de tu repo — proyecto simple o monorepo — y copia el
snippet.

## 1. Instalación

```bash
pnpm add -D oxlint oxlint-tailwindcss
```

Requisitos:

- **oxlint 1.43.0** o posterior.
- **Tailwind CSS v4.1.15** o posterior. El plugin carga tu design system vía `@tailwindcss/node` y
  solo entiende sintaxis v4 (`@import "tailwindcss";`, `@theme { ... }`). Resuelve el Tailwind de
  _tu_ proyecto por entry point; las versiones anteriores a 4.1.15 no están soportadas (son
  anteriores a una API del design system que el plugin necesita) y se reportan con un diagnóstico
  claro. Los builds insiders (`tailwindcss@insiders`) corren con un aviso único de "motor no
  probado".
- **Node.js `^20.19.0 || >=22.12.0`** para el proceso del linter — el mismo rango que exige el
  propio oxlint.

::: warning Evita oxlint 1.77.0 con la extensión del editor

oxlint **1.77.0** trae una regresión que hace panic en el **language server** ante cualquier
diagnóstico de un plugin JS — `disable_fix.rs:52`,
`range end index N out of range for slice of length 0`, y después SIGABRT y bucle de reinicio. Es un
bug de oxlint, no del plugin, y la CLI no está afectada (CI y `oxlint --fix` funcionan bien). Está
**corregido en oxlint 1.78.0** ([oxc#25280](https://github.com/oxc-project/oxc/pull/25280)) — sube a
`oxlint@1.78.0` o posterior (o quédate en `1.76.0`) si usas la extensión del editor.

:::

## 2. Configuración mínima

Crea o extiende tu `.oxlintrc.json` en la raíz del proyecto:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["oxlint-tailwindcss"],
  "rules": {
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-canonical": "warn"
  },
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  }
}
```

`settings.tailwindcss.entryPoint` es **obligatorio** en v1.0.0 y debe apuntar al archivo CSS donde
haces `@import "tailwindcss";` y (opcionalmente) declaras tus tokens `@theme { ... }`. El plugin lee
ese archivo para construir el design system que todas las reglas consultan.

Eso es todo. Ejecuta `oxlint` y el plugin revisa cada archivo que oxlint lintea — `.js`, `.jsx`,
`.ts`, `.tsx` (y `.mjs`, `.cjs`, `.mts`, `.cts`) — contra el design system cargado desde
`src/styles.css`. En los archivos `.vue`, `.svelte` y `.astro`, oxlint solo le pasa a los plugins
los bloques `<script>` (y el frontmatter de Astro), así que las clases escritas en el template o en
el markup **todavía no** se revisan. Ver [Vue, Svelte y Astro](/es/frameworks).

### Con `oxlint.config.ts`, o en una config compartida

oxlint también lee su config desde un `oxlint.config.ts` — experimental en oxlint, que lo importa a
través del type stripping propio de Node, así que necesita oxlint 1.45.0 o posterior en Node 22.18.0
o posterior. Ahí, `oxlint-tailwindcss/config` te da el plugin y las reglas recomendadas con sus
severidades, para `extends`:

```ts
// oxlint.config.ts
import { defineConfig } from 'oxlint'
import tailwindcss from 'oxlint-tailwindcss/config'

export default defineConfig({
  extends: [tailwindcss()],
  settings: {
    tailwindcss: { entryPoint: 'src/styles.css' },
  },
})
```

Tus propias `rules` pisan las recomendadas, y `tailwindcss({ recommended: false })` registra solo el
plugin. Los `settings` quedan en tu config, como arriba: oxlint nunca los lee de una config
extendida, así que `tailwindcss()` no recibe ninguno. Un `entryPoint` relativo se resuelve respecto
al directorio de la config que lo declara.

Así es también como una **config compartida** — un preset publicado como paquete — trae el plugin.
No puede fiarse de `"oxlint-tailwindcss"` en `jsPlugins`: oxlint resuelve ese nombre desde donde
corre, no desde el preset que lo lista, así que encontrar la dependencia propia del preset depende
del gestor de paquetes y de cómo se lanza oxlint (con pnpm, muchas veces no la encuentra), y oxlint
rechaza una ruta relativa en una config extendida. `tailwindcss()` registra el plugin por su ruta
absoluta, así que el preset lo pone en su propio `extends`, y el proyecto no necesita una
dependencia propia — solo sus `settings.tailwindcss`. Publica el preset en JavaScript: Node no quita
los tipos dentro de `node_modules`.

## 3. Conjunto de reglas recomendado

Si quieres un set "bendecido" que detecte problemas reales sin ser ruidoso, activa estas. Se genera
a partir de la severidad `recommended` de cada regla, así que siempre coincide con las reglas:

<!-- generated:recommended-config -->

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["oxlint-tailwindcss"],
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  },
  "rules": {
    // Corrección
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-contradicting-variants": "warn",
    "tailwindcss/no-dark-without-light": "warn",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/no-dynamic-classes": "error",
    "tailwindcss/no-unknown-classes": "error",
    // Modernización
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-negative-arbitrary-values": "warn",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    // Consistencia
    "tailwindcss/consistent-variant-order": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/enforce-consistent-variable-syntax": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/no-unnecessary-whitespace": "warn",
    // Protección del design system
    "tailwindcss/no-hardcoded-colors": "warn"
  }
}
```

<!-- /generated:recommended-config -->

Agrega reglas extra a medida que las necesites:

- `enforce-logical` / `enforce-physical` si tienes una preferencia de dirección.
- `no-arbitrary-value`, `no-restricted-classes` y `max-class-count` si quieres una protección más
  estricta del design system.
- `prefer-theme-tokens` y `prefer-scale-token` para preferir utilidades nombradas sobre referencias
  `var()` y valores fijos.

El catálogo completo está en [Reglas](/es/rules/). Cada página documenta el comportamiento exacto,
las opciones disponibles, y ejemplos ✓ / ✗.

## 4. Verifica el setup

La prueba más rápida es escribir mal una clase a propósito:

```tsx
<div className="flx items-cetner" />
```

oxlint debería marcar ambas clases con `no-unknown-classes`, y las sugerencias `flex` /
`items-center` aparecer en tu editor.

Si en cambio ves un diagnóstico `designSystemUnavailable`, significa que `entryPoint` no está
configurado o apunta a un archivo que el plugin no puede leer. El mensaje del diagnóstico te dice
exactamente qué ruta intentó — copia esa en tu setting `entryPoint`. Un `entryPoint` relativo se
resuelve respecto al directorio de la config de oxlint más cercana que lo contiene
(`.oxlintrc.json`, `.oxlintrc.jsonc`, `oxlint.config.ts` u `oxlint.config.mts` — la config que lo
declara), cayendo de vuelta al directorio donde corres `oxlint`.

## 5. Setups de monorepo

Si tienes un solo `.oxlintrc.json` en la raíz y varios archivos CSS de Tailwind entre los packages,
usa la forma de mapping — gana el primer glob que coincide:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        { "files": "packages/ui/**",    "use": "packages/ui/src/styles.css" },
        { "files": "packages/admin/**", "use": "packages/admin/src/admin.css" },
        { "files": "packages/web/**",   "use": "packages/web/src/app.css" },
        { "files": "**",                "use": "src/global.css" }
      ]
    }
  }
}
```

Agrega un fallback `"**"` al final para que cualquier archivo fuera de los globs explícitos resuelva
a uno por defecto.

Si en cambio cada package tiene su propio `.oxlintrc.json` extendiendo una base compartida,
simplemente pon `entryPoint: "./src/styles.css"` (string) en los settings de cada package. Mira la
[guía de monorepo](/es/monorepo) para ambos patrones lado a lado.

## 6. Coexistencia con oxfmt o prettier-plugin-tailwindcss

`enforce-sort-order` ordena las clases igual que oxfmt y prettier-plugin-tailwindcss **cuando leen
el mismo CSS y conocen tus helpers de clases**. Por defecto los formateadores usan el theme que trae
`tailwindcss` — que no conoce tus tokens `@theme` — y solo ordenan atributos de clase. Apúntalos a
tu CSS y lista tus helpers:

```jsonc
// .oxfmtrc.json
{ "sortTailwindcss": { "stylesheet": "./src/styles.css", "functions": ["cn", "clsx", "cva", "tv"] } }

// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles.css",
  "tailwindFunctions": ["cn", "clsx", "cva", "tv"]
}
```

Lee la [guía completa de interop](/es/interop) para saber quién formatea qué, la nota sobre `--fix`
y plugins como `@tailwindcss/typography`.

## 7. Yendo más allá

- **Ajustar extractors**: por defecto el plugin escanea `className` / `class`, ~14 callees (`cn`,
  `clsx`, `cva`, `twMerge`, …), templates con `tw`, y variables que coinciden con `/^classNames?$/`,
  `/^classes$/`, `/^styles?$/`. Agrega `attributes`, `attributePatterns` (regex para props tipo
  `*ClassName`), `callees`, `calleeExtractors` (enruta un wrapper propio por el extractor de
  `tv`/`cva`/`classed`), `tags`, `variablePatterns`, o quita defaults vía `exclude`. Mira la
  [referencia de settings](/es/settings).
- **Ajustar timeouts**: `settings.tailwindcss.timeout` (ms, default 60000) limita cuánto espera el
  plugin al worker (hilo) que precomputa el design system. CI lento puede necesitar subirlo.
- **Registro de depuración**: `settings.tailwindcss.debug: true` (o `DEBUG=oxlint-tailwindcss`)
  registra qué CSS entry point resolvió por cada archivo lintado.
- **Qué Tailwind se usa**: el plugin carga el motor de Tailwind de _tu_ proyecto, resuelto por entry
  point, así el linter y tu build coinciden. Si el motor resuelto es un major más nuevo que el
  plugin (un futuro Tailwind 5) o tiene un drift de major respecto de tu build, falla fuerte;
  `settings.tailwindcss.allowUntestedEngine: true` permite correr igual. Ver la
  [referencia de settings](/es/settings#allowuntestedengine).
- **¿Vienes de v0.x?** Lee la [guía de migración](/es/migration/v0-to-v1) — `entryPoint` ahora es
  obligatorio y la forma legacy `string[]` fue removida.
