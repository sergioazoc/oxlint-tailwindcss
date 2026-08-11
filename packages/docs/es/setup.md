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
- **Tailwind CSS v4**. El plugin carga tu design system vía `@tailwindcss/node` y solo entiende
  sintaxis v4 (`@import "tailwindcss";`, `@theme { ... }`).
- **Node.js 20** o posterior para el proceso del linter.

::: warning Evita oxlint 1.77.0 con la extensión del editor oxlint **1.77.0** trae una regresión que
hace panic en el **language server** ante cualquier diagnóstico de un plugin JS —
`disable_fix.rs:52`, `range end index N out of range for slice of length 0`, y después SIGABRT y
bucle de reinicio. Es un bug de oxlint, no del plugin, y la CLI no está afectada (CI y
`oxlint --fix` funcionan bien). Está **corregido en oxlint 1.78.0**
([oxc#25280](https://github.com/oxc-project/oxc/pull/25280)) — sube a `oxlint@1.78.0` o posterior (o
quédate en `1.76.0`) si usas la extensión del editor. :::

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

Eso es todo. Ejecuta `oxlint` y el plugin va a lintear cada archivo JS / TS / JSX / TSX / Vue /
Svelte del proyecto contra el design system cargado desde `src/styles.css`.

## 3. Conjunto de reglas recomendado

Si quieres un set "bendecido" que detecte problemas reales sin ser ruidoso, activa estas:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["oxlint-tailwindcss"],
  "rules": {
    // Correctness — atrapan bugs reales
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/no-unknown-classes": "error",

    // Modernización — mantiene las clases en su forma canónica actual
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",

    // Estilo y consistencia
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/consistent-variant-order": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/no-unnecessary-whitespace": "warn"
  },
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  }
}
```

Agrega reglas extra a medida que las necesites:

- `enforce-logical` / `enforce-physical` si tienes una preferencia de dirección.
- `no-arbitrary-value`, `no-hardcoded-colors`, `no-restricted-classes` si quieres enforcement de
  design-system.
- `prefer-theme-tokens` para preferir utilidades nombradas sobre referencias `var()`.

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
resuelve respecto al directorio del `.oxlintrc.json` más cercano que lo contiene (el config que lo
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

`enforce-sort-order` coincide byte por byte con oxfmt y prettier-plugin-tailwindcss **si las tres
herramientas leen el mismo CSS**. Por defecto, oxfmt y el plugin de prettier usan el
`tailwindcss/theme.css` bundled — que no conoce tus tokens `@theme` personalizados. Apúntalos a tu
CSS:

```jsonc
// .oxfmtrc.json
{ "sortTailwindcss": { "stylesheet": "./src/styles.css" } }

// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles.css"
}
```

Lee la [guía completa de interop](/es/interop) para el porqué y los edge cases con tagged templates
y plugins como `@tailwindcss/typography`.

## 7. Yendo más allá

- **Ajustar extractors**: por defecto el plugin escanea `className` / `class`, ~14 callees (`cn`,
  `clsx`, `cva`, `twMerge`, …), templates con `tw`, y variables que matchean `/^classNames?$/`,
  `/^classes$/`, `/^styles?$/`. Agrega `attributes`, `callees`, `tags`, `variablePatterns`, o quita
  defaults vía `exclude`. Mira la [referencia de settings](/es/settings).
- **Ajustar timeouts**: `settings.tailwindcss.timeout` (ms, default 60000) limita cuánto espera el
  plugin al worker (hilo) que precomputa el design system. CI lento puede necesitar subirlo.
- **Logging de debug**: `settings.tailwindcss.debug: true` (o `DEBUG=oxlint-tailwindcss`) loguea qué
  CSS entry point resolvió por cada archivo lintado.
- **Qué Tailwind se usa**: el plugin carga el motor de Tailwind de _tu_ proyecto, resuelto por entry
  point, así el linter y tu build coinciden. Si el motor resuelto es un major más nuevo que el
  plugin (un futuro Tailwind 5) o tiene un drift de major respecto de tu build, falla fuerte;
  `settings.tailwindcss.allowUntestedEngine: true` permite correr igual. Ver la
  [referencia de settings](/es/settings#allowuntestedengine).
- **¿Vienes de v0.x?** Lee la [guía de migración](/es/migration/v0-to-v1) — `entryPoint` ahora es
  obligatorio y la forma legacy `string[]` fue removida.
