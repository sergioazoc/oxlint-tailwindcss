---
title: "Uso en monorepos"
description: "Usa oxlint-tailwindcss en un monorepo: un config con un mapping de entryPoint o un .oxlintrc.json por package, y qué puede cambiar entre packages."
---

# Monorepos

`oxlint-tailwindcss` v1 soporta dos patrones para monorepos, ambos totalmente deterministas — sin
heurísticas de globs, sin sorpresas del auto-detect. Elige el que se ajuste mejor a cómo tu equipo
ya estructura su config.

## Patrón A — un solo config raíz con mapping de globs

Un `.oxlintrc.json` en la raíz. `entryPoint` es un array de objetos `{ files, use }`, evaluados en
orden de declaración; el primer glob que coincide con el archivo lintado gana.

```jsonc
// /my-monorepo/.oxlintrc.json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["oxlint-tailwindcss"],
  "rules": {
    "tailwindcss/no-unknown-classes": "error"
  },
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        { "files": "packages/ui/**",     "use": "packages/ui/src/styles.css" },
        { "files": "packages/admin/**",  "use": "packages/admin/src/admin.css" },
        { "files": "packages/web/**",    "use": "packages/web/src/app.css" },
        { "files": "**",                  "use": "src/global.css" }
      ]
    }
  }
}
```

Cuándo conviene:

- Todos tus packages comparten las mismas reglas.
- Quieres una sola fuente de verdad de qué se lintea cómo.
- Ya estás usando `overrides` de oxlint para personalización por regla en la raíz.

Un entry de fallback `"**"` al final es recomendado — sin él, cualquier archivo fuera de los globs
explícitos va a fallar con `MissingEntryPointError`.

## Patrón B — un `.oxlintrc.json` por package

Cada package tiene su propio config y su propio CSS entry. oxlint resuelve el config más cercano al
archivo lintado, así que los overrides por package "just work".

```
my-monorepo/
├── .oxlintrc.json                       # base de reglas (opcional entryPoint para archivos top-level)
├── packages/
│   ├── ui/
│   │   ├── .oxlintrc.json               # extends ../../.oxlintrc.json, define entryPoint
│   │   ├── src/styles.css
│   │   └── src/Button.tsx
│   ├── admin/
│   │   ├── .oxlintrc.json
│   │   ├── src/admin.css
│   │   └── src/Page.tsx
│   └── shared-utils/                    # sin Tailwind, sin config
│       └── index.ts
```

```jsonc
// packages/ui/.oxlintrc.json
{
  "extends": ["../../.oxlintrc.json"],
  "settings": {
    "tailwindcss": { "entryPoint": "./src/styles.css" }
  }
}
```

Un `entryPoint` string **relativo** se resuelve respecto al directorio del `.oxlintrc.json` más
cercano que lo contiene —es decir, el config que lo declara— y no respecto al working directory
actual. Así `./src/styles.css` apunta a `packages/ui/src/styles.css` ya sea que oxlint corra desde
el package (`cd packages/ui && oxlint`, como en la CLI) o desde la raíz del workspace (como hacen
las extensiones de editor, p. ej. el plugin de oxlint para VS Code). Si el archivo no se encuentra
ahí, la resolución cae de vuelta al CWD. Esto es lo que hace que los configs por package se
comporten igual en la terminal y en el editor (issue #39).

::: tip Configs explícitos con `-c`

El anclaje usa el `.oxlintrc.json` más cercano porque ese es el config que oxlint aplica bajo su
descubrimiento de configs anidados por defecto. Si en cambio pasas `oxlint -c <config>` (o
deshabilitas los configs anidados), oxlint usa solo ese archivo — y el plugin no puede saber cuál
config fue (oxlint le expone la ruta del archivo y el CWD, nunca la ruta del config). El fallback
config-más-cercano + CWD igual resuelve bien para el layout habitual, pero si mezclas un config
explícito `-c` con un `.oxlintrc.json` anidado no relacionado debajo del archivo lintado, prefiere
un `entryPoint` **absoluto** (o la forma de mapping) para eliminar toda ambigüedad.

:::

Cuándo conviene:

- Los packages divergen mucho en reglas, plugins o globals.
- Distintos equipos son dueños de distintos packages y quieren config autocontenido.
- Tienes packages sin Tailwind que NO deberían ejecutar el plugin.

## Opciones y settings distintos por package

Las opciones de las reglas y `settings.tailwindcss` se resuelven para cada archivo, así que los
packages pueden diferir en ambos — dentro de una misma corrida, en la terminal y en el editor. Dónde
puedes definirlos:

| Definido en                                | Opciones de reglas | `settings.tailwindcss` |
| ------------------------------------------ | ------------------ | ---------------------- |
| Un bloque `overrides` del config raíz      | ✓                  | ✗                      |
| Un `.oxlintrc.json` anidado (Patrón B)     | ✓                  | ✓                      |
| El mapping de `entryPoint` raíz (Patrón A) | —                  | solo `entryPoint`      |

oxlint rechaza `settings` dentro de `overrides` (``unknown field `settings` ``), así que un package
que necesita sus propios `attributes`, `callees`, `rootFontSize` o `debug` lleva un config anidado.
Un config anidado es independiente salvo que liste el raíz en `extends` — entonces hereda
`jsPlugins` y `rules` y solo agrega lo que cambia, como en el ejemplo del Patrón B.

::: warning Vite+ y editores

- **Vite+** (`vp lint`) no descubre los `.oxlintrc.json` anidados (oxlint 1.85+,
  [oxc#26763](https://github.com/oxc-project/oxc/pull/26763)): solo aplica el config raíz. Usa el
  mapping de `entryPoint` del Patrón A para el CSS por package; los demás settings no pueden variar
  por package ahí.
- **Editores** (la extensión de oxc para VS Code y otros clientes LSP) descubren los configs
  anidados cuando `oxc.configPath` no está definido. Desde oxlint 1.84 un `""` vacío también cuenta
  como no definido ([oxc#26762](https://github.com/oxc-project/oxc/pull/26762)); apuntarlo a un
  archivo desactiva los configs anidados, como `oxlint -c`.

:::

## Lo que **NO** funciona en v1

- `entryPoint: ["a.css", "b.css"]` — la forma legacy `string[]` se removió porque su heurística de
  "entry más cercano por prefix de path" era no-determinista en edge cases. v1 lanza
  `DeprecatedEntryPointShapeError` e imprime el snippet de migración directo en el diagnóstico.

## Archivos que no necesitan el plugin

Si un archivo vive en un package sin Tailwind — por ejemplo, una utilidad pura de TypeScript — las
reglas DS-dependientes simplemente no se disparan, porque solo corren cuando los extractors
encuentran strings de clases. No hace falta deshabilitar el plugin por archivo.

## Verificando qué CSS resolvió por archivo

Activa `settings.tailwindcss.debug` (o la variable `DEBUG=oxlint-tailwindcss`) y oxlint va a
imprimir una línea por archivo mostrando qué CSS cargó el plugin para ese archivo. Útil cuando un
glob coincide con el mapping equivocado.

## Motores de Tailwind por package

Para cada entry point CSS resuelto, el plugin carga el motor de Tailwind (`@tailwindcss/node`) desde
el `node_modules` de ese package, así los packages fijados a versiones distintas de Tailwind se
lintean cada uno con el motor con el que compilan. El guard de versión corre por package también —
un motor más viejo que v4.1.15, un major futuro, o un drift de major respecto del build de ese
package falla fuerte (ver [`allowUntestedEngine`](/es/settings#allowuntestedengine)). No tienes que
hacer nada para esto; sigue la misma resolución de entry point por archivo de arriba.
