# `settings.tailwindcss`

Cada setting vive bajo `settings.tailwindcss` en tu `.oxlintrc.json`.

## `entryPoint` (obligatorio)

Ruta al archivo CSS que tiene `@import "tailwindcss";` y (opcionalmente) tus customizaciones de
`@theme { ... }`. El plugin lee este archivo para construir el design system que cada regla
consulta.

Es obligatorio para las reglas DS-dependientes, que fallan ruidosamente sin él. Hay un segundo grupo
**DS-opcional**: esas funcionan sin nada configurado y ganan precisión cuando está —
`enforce-shorthand` verifica cada merge contra el CSS emitido, `no-dark-without-light` agrupa la
base por propiedad declarada, `no-deprecated-classes` deriva su lista de renombres, y las reglas
direccionales confirman que la clase que sugieren exista. Mira la
[referencia de defaults](./rules/#referencia-de-defaults) para saber qué regla está en qué grupo.

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

Un `entryPoint` **string relativo** (la forma de proyecto simple) se resuelve respecto al directorio
del `.oxlintrc.json` más cercano que lo contiene, cayendo de vuelta al directorio donde corre oxlint
— así un config por package resuelve al mismo CSS ya sea que oxlint corra desde el package (CLI) o
desde la raíz del workspace (editor). Ver [Monorepos](/es/monorepo).

Los globs (la forma de mapping) se evalúan contra el path del archivo lintado relativo al directorio
donde corre oxlint. Sintaxis soportada: `*` (cualquier caracter excepto `/`), `**` (cualquier
profundidad), segmentos literales. El orden importa — el primer entry que matchea gana. Se
recomienda agregar un fallback `"**"` para archivos fuera de los globs explícitos.

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

## `allowUntestedEngine`

`boolean`, default `false`.

El plugin carga **tu** motor de Tailwind — el `@tailwindcss/node` resuelto desde el proyecto
alrededor de cada entry point, por entry point (así los paquetes de un monorepo pueden estar en
versiones distintas de Tailwind). Evalúa ese motor contra la versión para la que fue construido:

- **Más viejo que Tailwind v4** → fatal (`designSystemUnavailable`). No lo afecta esta opción.
- **Un major más nuevo que el plugin** (p. ej. un futuro Tailwind 5), o un **drift de major** entre
  el motor y el `tailwindcss` que usa tu build → fatal por defecto.
- **Un minor más nuevo**, o un **drift a nivel de minor** respecto de tu build → un warning único en
  stderr; el plugin lintea best-effort.
- **En rango y alineado** → silencioso.

Ponlo en `true` para degradar los **fatales** de major futuro / drift de major a un warning y
lintear igual (los resultados pueden ser inexactos contra un motor no probado). Un motor más viejo
que v4 sigue siendo fatal de todos modos.

```jsonc
{
  "settings": {
    "tailwindcss": {
      "allowUntestedEngine": true
    }
  }
}
```

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
      "allowUntestedEngine": false,        // opcional
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
