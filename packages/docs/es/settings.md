---
title: "Referencia de settings"
description: "Cada opción de settings.tailwindcss de oxlint-tailwindcss — entryPoint, rootFontSize, timeout, debug y el extractor de clases — y sus variables de entorno."
---

# `settings.tailwindcss`

Cada setting vive bajo `settings.tailwindcss` en tu `.oxlintrc.json`. Los settings se leen para cada
archivo lintado, así que un `.oxlintrc.json` anidado puede darle a un package sus propios valores —
mira
[opciones y settings distintos por package](/es/monorepo#opciones-y-settings-distintos-por-package).

oxlint no revisa `settings`, así que lo hace el plugin: una clave que no conoce, un valor del tipo
equivocado, un patrón que no es una expresión regular o un tipo de `calleeExtractors` que no existe
se reporta una vez por archivo, en su primera línea, desde la primera regla que lo linta
(`invalidSetting`):

```text
Check settings.tailwindcss: "rootfontsize" is not a setting (did you mean "rootFontSize"?)
```

Un `entryPoint` mal escrito lo reportan las reglas que necesitan el design system, con una pista de
cómo arreglarlo (`designSystemUnavailable`).

## `entryPoint` (obligatorio)

Ruta al archivo CSS que tiene `@import "tailwindcss";` y (opcionalmente) tus personalizaciones de
`@theme { ... }`. El plugin lee este archivo para construir el design system que cada regla
consulta.

Es obligatorio para las reglas DS-dependientes, que fallan ruidosamente sin él. Hay un segundo grupo
**DS-opcional**: esas funcionan sin nada configurado y ganan precisión cuando está —
`enforce-shorthand` verifica cada fusión contra el CSS emitido, `no-dark-without-light` agrupa la
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
profundidad), segmentos literales. El orden importa — el primer entry que coincide gana. Se
recomienda agregar un fallback `"**"` para archivos fuera de los globs explícitos.

`files` también acepta un arreglo de globs (`string[]`): el entry coincide si el archivo lintado
coincide con cualquiera de ellos.

**v0.x → v1.0.0**: la forma legacy `string[]` se removió. Pasarla en v1 lanza
`DeprecatedEntryPointShapeError` con el snippet de migración incluido en el mensaje. Ver la
[guía de migración](/es/migration/v0-to-v1).

## `rootFontSize`

`number`, default `16`.

Tamaño de fuente en píxeles para convertir entre px y rem. `prefer-scale-token` lo usa para comparar
un valor en px con la escala basada en rem (`p-[10px]` → `p-2.5`), y `enforce-canonical` se lo pasa
al canonicalizador de Tailwind. Cambia esto solo si tu proyecto define un root size distinto de 16
en `<html>`.

## `timeout`

`number` en milisegundos, default `60000`.

Cuánto espera el plugin al worker (hilo) que precalcula el design system. CI lentos pueden necesitar
subirlo; no deberías necesitar bajarlo.

Esto rige **solo el precompute loader**. Los worker services de sort / canonicalize / declaration
que usan las reglas dependientes del design system durante el linteo tienen su propio timeout de
**30 s por request** que este ajuste no mueve. Si una máquina lenta-pero-funcional o un runner de CI
reporta `worker request timed out after 30000ms` sobre listas de clases válidas, súbelo con la
variable de entorno `OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT` (milisegundos) para que el request
se complete en vez de fallar:

```bash
OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT=60000 oxlint
```

Un timeout ya no cuesta O(archivos): tras unos pocos timeouts consecutivos para un mismo entry point
el resto del run falla rápido, y el estado se auto-sana cuando la máquina se recupera.

## `debug`

`boolean`, default `false`. También se activa con la variable de entorno `DEBUG=oxlint-tailwindcss`.

Cuando está activo, el plugin registra en stderr:

- Qué entry point CSS resolvió para cada archivo lintado (`src/Button.tsx → src/styles.css`).
- Cada carga del design system, una vez por entry point por corrida
  (`Loaded design system from "…"`) — la misma línea venga de la caché en disco o de un precompute
  nuevo.
- El chequeo del motor de Tailwind de cada entry point (`engine E=4.3.3 B=4.3.3 → ok`).

Útil cuando estás depurando qué CSS terminó cargando el plugin.

## `allowUntestedEngine`

`boolean`, default `false`.

El plugin carga **tu** motor de Tailwind — el `@tailwindcss/node` resuelto desde el proyecto
alrededor de cada entry point, por entry point (así los paquetes de un monorepo pueden estar en
versiones distintas de Tailwind). Evalúa ese motor contra la versión para la que fue construido:

- **Más viejo que Tailwind v4.1.15** → fatal (`designSystemUnavailable`). No lo afecta esta opción
  (las versiones anteriores no tienen una API del design system que el plugin necesita).
- **Un major más nuevo que el plugin** (p. ej. un futuro Tailwind 5), o un **drift de major** entre
  el motor y el `tailwindcss` que usa tu build → fatal por defecto.
- **Un minor más nuevo**, un **build insiders** de Tailwind (`0.0.0-insiders.*`), o un **drift a
  nivel de minor** respecto de tu build → un warning único en stderr; el plugin lintea best-effort.
- **En rango y alineado** → silencioso.

Ponlo en `true` para degradar los **fatales** de major futuro / drift de major a un warning y
lintear igual (los resultados pueden ser inexactos contra un motor no probado). Un motor más viejo
que v4.1.15 sigue siendo fatal de todos modos.

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

`attributes`, `callees` y `tags` coinciden por **nombre exacto**. Dos ejes coinciden por **regex**,
y su alcance difiere — fíjate cuál necesitas:

- **`attributePatterns`** coincide con **nombres de atributos JSX**. Úsalo para convenciones
  `*ClassName` sin listar cada prop — p. ej. `["ClassName$"]` captura `contentContainerClassName` y
  `tintColorClassName` en componentes de React Native / Uniwind. Es aditivo a la lista exacta de
  `attributes`; vacío por defecto, así que el match exacto sigue siendo el default.
- **`variablePatterns`** coincide con **solo nombres de declaración de variables**
  (`const fooClassName = "..."`), **no** atributos JSX. Su default `/^classNames?$/` coincide en
  escritura con el atributo `className`, pero son cosas distintas — una entrada de
  `variablePatterns` nunca afecta props JSX.

Agrega más sin perder los defaults:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "attributes": ["xyzClassName"],
      "attributePatterns": ["ClassName$"],
      "callees": ["myHelper"],
      "tags": ["css"],
      "variablePatterns": ["^tw[A-Z]"]
    }
  }
}
```

O quita de los defaults con `exclude`, que acepta `attributes`, `callees`, `tags` y
`variablePatterns`:

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

Las exclusiones de `variablePatterns` coinciden con `RegExp.source` literal.

### Wrappers estructurados (`calleeExtractors`)

`cva`, `tv` y `classed` se extraen con lógica dedicada que entiende la forma de config de cada
helper (`base`, `slots`, `variants`, `compoundVariants`, …). Si un paquete compartido re-exporta uno
de ellos con tu propio nombre, mapea ese nombre a la estructura que sigue para que reciba la misma
extracción profunda — sin renombrar imports en cada punto de llamada:

```jsonc
{
  "settings": {
    "tailwindcss": {
      "calleeExtractors": {
        "defineStyles": "tv",     // lee base / slots / variants / compoundVariants
        "makeVariants": "cva",    // lee base / variants / compoundVariants
        "styledEl": "classed",    // omite el primer argumento (tipo de elemento)
        "cnx": "flat"             // extracción plana estilo cn/clsx/twMerge
      }
    }
  }
}
```

Los nombres mapeados se registran como callees automáticamente — no hace falta listarlos también en
`callees`. El valor debe ser uno de `tv`, `cva`, `classed` o `flat`; cualquier otro valor se ignora
en vez de lanzar. Los nombres reservados `tv`, `cva` y `classed` siempre usan su extractor integrado
y no se pueden remapear.

## Variables de entorno

Para lo que no va en un archivo de config compartido — ajustes de CI y depuración puntual:

| Variable                                    | Efecto                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEBUG=oxlint-tailwindcss`                  | Igual que [`debug: true`](#debug), para todos los archivos.                                                                                                                                                                                            |
| `OXLINT_TAILWINDCSS_CACHE_DIR`              | Dónde vive la caché en disco del design system. Por defecto: un directorio por usuario en el temp del sistema (`oxlint-tailwindcss-<uid>`, el nombre de usuario en Windows). Defínela para conservar la caché entre jobs de CI — mira [En CI](/es/ci). |
| `OXLINT_TAILWINDCSS_WORKER_REQUEST_TIMEOUT` | Timeout por request de los servicios worker, en milisegundos (default `30000`). Mira [`timeout`](#timeout). Un valor que no sea un número positivo se ignora.                                                                                          |

Un directorio de caché que crea el plugin es privado para su dueño (`0700`). Si apuntas la variable
a un directorio que ya existe, asegúrate de que nadie más pueda escribir en él: lo que guarda la
caché alimenta los autofixes.

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
      "attributePatterns": [],             // opcional
      "callees": [],                       // opcional
      "calleeExtractors": {},              // opcional (nombre → tv|cva|classed|flat)
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
