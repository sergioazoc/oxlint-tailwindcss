# `settings.tailwindcss`

Cada setting vive bajo `settings.tailwindcss` en tu `.oxlintrc.json`.

## `entryPoint` (obligatorio)

Ruta al archivo CSS que tiene `@import "tailwindcss";` y (opcionalmente) tus customizaciones de
`@theme { ... }`. El plugin lee este archivo para construir el design system que cada regla
consulta.

Acepta dos formas:

```jsonc
// Proyecto simple
{ "settings": { "tailwindcss": { "entryPoint": "src/styles.css" } } }

// Monorepo: mapping explícito glob → CSS, primer match gana
{
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        { "files": "packages/ui/**",    "use": "packages/ui/src/styles.css" },
        { "files": "packages/admin/**", "use": "packages/admin/src/admin.css" },
        { "files": "**",                "use": "src/global.css" }
      ]
    }
  }
}
```

Los globs se evalúan contra el path del archivo lintado relativo al directorio donde corre oxlint.
Sintaxis soportada: `*` (cualquier caracter excepto `/`), `**` (cualquier profundidad), segmentos
literales. El orden importa — el primer entry que matchea gana. Se recomienda agregar un fallback
`"**"` para archivos fuera de los globs explícitos.

`files` también acepta un arreglo de globs (`string[]`): el entry matchea si el archivo lintado
coincide con cualquiera de ellos.

**v0.x → v1.0.0**: la forma legacy `string[]` se removió. Pasarla en v1 lanza
`DeprecatedEntryPointShapeError` con el snippet de migración incluido en el mensaje. Ver la
[guía de migración](/es/migration/v0-to-v1).

## `rootFontSize`

`number`, default `16`.

Tamaño de fuente en píxeles que `enforce-canonical` usa para convertir entre px y rem. Cambia esto
solo si tu proyecto define un root size distinto de 16 en `<html>`.

## `timeout`

`number` en milisegundos, default `60000`.

Cuánto espera el plugin al worker (hilo) que precalcula el design system. CI lentos pueden necesitar
subirlo; no deberías necesitar bajarlo.

## `debug`

`boolean`, default `false`. También se activa con la variable de entorno `DEBUG=oxlint-tailwindcss`.

Cuando está activo, el plugin loguea a stderr:

- Qué entry point CSS resolvió para cada archivo lintado.
- Carga exitosa del DS y cache hits.

Útil cuando estás depurando qué CSS terminó cargando el plugin.

## Configuración del extractor

El plugin escanea estas ubicaciones por defecto:

| Tipo                 | Defaults                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Atributos            | `className`, `class` (JSX)                                                                                         |
| Callees              | `cn`, `clsx`, `cva`, `twMerge`, `tv`, `cx`, `classnames`, `ctl`, `twJoin`, `cc`, `clb`, `cnb`, `objstr`, `classed` |
| Tags                 | `` tw`...` `` (tagged template literals)                                                                           |
| Patrones de variable | `/^classNames?$/`, `/^classes$/`, `/^styles?$/`                                                                    |

Agrega más sin perder los defaults:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "attributes": ["xyzClassName"],
      "callees": ["myHelper"],
      "tags": ["css"],
      "variablePatterns": ["^tw[A-Z]"]
    }
  }
}
```

O quita de los defaults:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "exclude": {
        "callees": ["objstr"],
        "variablePatterns": ["^styles?$"]
      }
    }
  }
}
```

Las exclusiones de `variablePatterns` matchean contra `RegExp.source` literal.

## Cheat sheet

```jsonc
{
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css",    // obligatorio
      "rootFontSize": 16,                  // opcional
      "timeout": 60000,                    // opcional
      "debug": false,                      // opcional
      "attributes": [],                    // opcional
      "callees": [],                       // opcional
      "tags": [],                          // opcional
      "variablePatterns": [],              // opcional
      "exclude": {                         // opcional
        "attributes": [],
        "callees": [],
        "tags": [],
        "variablePatterns": []
      }
    }
  }
}
```
