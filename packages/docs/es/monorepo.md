# Monorepos

`oxlint-tailwindcss` v1 soporta dos patrones para monorepos, ambos totalmente deterministas — sin
heurísticas de globs, sin sorpresas del auto-detect. Elige el que se ajuste mejor a cómo tu equipo
ya estructura su config.

## Patrón A — un solo config raíz con mapping de globs

Un `.oxlintrc.json` en la raíz. `entryPoint` es un array de objetos `{ files, use }`, evaluados en
orden de declaración; el primer glob que matchea el archivo lintado gana.

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
- Ya estás usando `overrides` de oxlint para customización por regla en la raíz.

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
│   │   ├── .oxlintrc.json               # extends ../../.oxlintrc.json, setea entryPoint
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
  "extends": "../../.oxlintrc.json",
  "settings": {
    "tailwindcss": { "entryPoint": "./src/styles.css" }
  }
}
```

Cuándo conviene:

- Los packages divergen mucho en reglas, plugins o globals.
- Distintos equipos son dueños de distintos packages y quieren config autocontenido.
- Tienes packages sin Tailwind que NO deberían ejecutar el plugin.

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
glob matchea el mapping equivocado.
