## Qué hace esta regla

Marca strings de clases largos para que no se desparramen más allá de un largo de línea razonable y,
opcionalmente, los parte en varias líneas cuando contienen más clases de las que tu team acuerda que
una sola línea debería cargar. Dos triggers independientes: un print width basado en caracteres
(solo warn) y un budget de clases por línea (autofix en template literals).

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`. La regla opera sobre el string
crudo de clases y no le importa qué significan.

El autofix envuelve los template literals en la **convención bloque**: el contenido empieza en su
propia línea, cada línea envuelta se indenta un nivel por debajo de la indentación del statement, y
el backtick de cierre queda en su propia línea. La indentación base se lee de la línea de código (no
de la columna del backtick), así que el bloque anida bien incluso dentro de JSX muy indentado. El
fix es **no destructivo** — un template que ya está envuelto solo re-envuelve sus líneas que exceden
el budget; las líneas conformes quedan intactas. Las otras reglas (`no-unnecessary-whitespace`,
`enforce-sort-order`, …) están al tanto de esta forma multilínea y no la colapsan de vuelta.

## Opciones

### `printWidth`

`number`, default `80`.

Largo máximo de cualquier **línea individual** del string de clases. Para un string de una línea es
su largo completo; para un template multilínea es la línea individual más larga, así que partir un
string largo en varias líneas sí puede satisfacer la regla. Cuando se excede, la regla reporta
`tooLong` pero **no** autofixea — partir un string largo en un literal multilínea es una decisión de
criterio (extraer un componente vs. solo wrappearlo), así que la regla saca el warning y te deja
decidir.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "printWidth": 100 }] }
```

### `classesPerLine`

`number`, opcional. Sin default.

Cantidad máxima de clases en una sola línea. Cuando se excede dentro de un template literal
(`` `…` ``), la regla autofixea envolviendo las clases en la convención bloque, en chunks de
`classesPerLine` por línea. Dentro de string literals (`"…"`) la regla reporta `tooManyPerLine` pero
no autofixea — los string literals no pueden cruzar líneas con seguridad sin intervención manual.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "classesPerLine": 5 }] }
```

## Ejemplos

### ✗ Incorrecto

```tsx
// Excede el printWidth default de 80 caracteres
<div className="flex items-center justify-between p-4 m-2 bg-white text-black rounded shadow-lg border w-full" />
//              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ tooLong

// 6 clases con classesPerLine: 3 — el template literal autofixea a un bloque
const className = `flex items-center justify-between p-4 m-2 bg-white`
// → const className = `
//     flex items-center justify-between
//     p-4 m-2 bg-white
//   `

// Mismo conteo, string literal — reporta pero no autofixea
<div className="flex items-center justify-between p-4 m-2 bg-white" />
```

### ✓ Correcto

```tsx
// Cabe dentro del printWidth
<div className="flex items-center p-4" />

// Ya wrappeado al classesPerLine (convención bloque)
const className = `
  flex items-center p-4
  bg-white text-black
`
```

## Interacciones con otras reglas

- **`no-unnecessary-whitespace`**: preserva a propósito el `\n` + indent que introduce esta regla.
  Las dos están diseñadas para coexistir; sin esa preservación, los fixers oscilarían (issue #14).
- **`enforce-sort-order`**: rearma los strings de clases desde una lista de tokens vía
  `rebuildClassString`, que mantiene los separadores multilínea. El fixer del sort y el del wrap
  corren sobre el mismo string sin pelearse.
- **Todas las reglas manejadas por el extractor**: `splitClassesWithSeparators` es multiline-aware,
  así que toda otra regla (`enforce-canonical`, `enforce-shorthand`, …) reporta sobre strings
  multilínea igual que sobre los de una sola línea.

## Cuándo desactivarla

- **Dejas que `prettier` maneje el line wrapping de JSX**: prettier rompe a nivel del atributo JSX,
  no dentro del string. Son complementarias, pero si no quieres wrapping in-string en absoluto,
  desactívala.
- **Trabajando con generadores de código** que emiten strings de clases muy largos a propósito (e.g.
  clases para contenido manejado por CMS).
- **Usas otra convención** del estilo "siempre una clase por línea": el wrapping por chunks de esta
  regla no modela eso.
