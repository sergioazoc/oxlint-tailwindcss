# enforce-consistent-line-wrapping

> Warn when a class string exceeds the configured print width

## Qué hace esta regla

Marca strings de clases largos para que no se desparramen más allá de un largo de línea razonable y,
cuando lo activas, los envuelve en varias líneas. Dos modos de formateo independientes: un re-wrap
basado en el width (opt-in vía `wrapLines`) y un budget de clases por línea (`classesPerLine`),
ambos con autofix en template literals (los string literals solo reportan — no pueden cruzar líneas
con seguridad).

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`. La regla opera sobre el string
crudo de clases y no le importa qué significan.

Ambos fixers envuelven los template literals en la **convención bloque**: el contenido empieza en su
propia línea, cada línea envuelta se indenta un nivel por debajo de la indentación del statement, y
el backtick de cierre queda en su propia línea. La indentación base se lee de la línea de código (no
de la columna del backtick), así que el bloque anida bien incluso dentro de JSX muy indentado. El
fix de `classesPerLine` y el fix de width en modo `"overWidth"` son **no destructivos** — un
template que ya está envuelto solo re-envuelve sus líneas que exceden el budget; las líneas
conformes quedan intactas. El fix de width en modo `"all"` es un **re-layout completo**: reacomoda
el template entero en la forma canónica agrupada por variantes, reemplazando cualquier layout hecho
a mano (por eso es un modo aparte y explícito). Las otras reglas (`no-unnecessary-whitespace`,
`enforce-sort-order`, …) están al tanto de esta forma multilínea y no la colapsan de vuelta.

## Opciones

### `printWidth`

`number`, default `80`.

Largo máximo de cualquier **línea individual** del string de clases. Para un string de una línea es
su largo completo; para un template multilínea es la línea individual más larga, así que partir un
string largo en varias líneas sí puede satisfacer la regla. Una línea cuya única clase excede por sí
sola el width no se reporta — no hay forma de wrappearla más corta.

Por sí solo, `printWidth` es **solo warning**: reporta `tooLong` y nunca reescribe tu código. El
autofix es opt-in vía `wrapLines`.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "printWidth": 100 }] }
```

### `wrapLines`

`"overWidth" | "all"`, opcional. Sin default — igual que `classesPerLine`, dejarlo sin setear
significa que el fixer está apagado y `printWidth` solo reporta.

Activa el **autofix basado en el width** para template literals. Los dos modos difieren tanto en
alcance como en layout:

- `"overWidth"`: solo se re-envuelven las **líneas** que realmente exceden `printWidth` — cada una
  se empaqueta de forma greedy en las menos líneas que caben en el budget (sin agrupar por
  variantes), reusando la indentación de la propia línea. Todo lo demás queda intacto: los templates
  cuyas líneas caben todas, y las líneas conformes de un template que sí se toca, conservan su
  layout hecho a mano. Un template de una sola línea no tiene layout que preservar, así que se
  convierte a la convención bloque.
- `"all"`: **todo** template multilínea (o con una línea que excede) se normaliza a un layout
  canónico, espejando el fixer de `eslint-plugin-better-tailwindcss`: las clases se agrupan en runs
  que comparten la cadena de variantes (`hover:`, `md:hover:`, o ninguna), y dentro de un run las
  clases se empaquetan en una línea hasta que agregar la siguiente excedería `printWidth`
  (indentación incluida). Cómo se separan los runs lo controla `group` (abajo). Los templates dentro
  del budget que no siguen ese layout reportan `inconsistentWrapping`.

En string literals la regla reporta `tooLong` sin fix sin importar `wrapLines` — partir un string
literal en un template multilínea es una decisión de criterio (extraer un componente vs. solo
wrappearlo), así que la regla saca el warning y te deja decidir. Un fragmento de template **pegado**
a un `${}` sin whitespace (`` `${a}flex …` `` — una sola clase en runtime) tampoco se autofixea
nunca: cualquier whitespace introducido en ese borde partiría esa clase en dos.

`wrapLines` solo aplica cuando `classesPerLine` **no** está seteado — si no, `classesPerLine` es
dueño del layout.

```jsonc
{
  "tailwindcss/enforce-consistent-line-wrapping": [
    "error",
    { "printWidth": 100, "wrapLines": "overWidth" },
  ],
}
```

### `group`

`"newLine" | "emptyLine" | "never"`, default `"newLine"`.

Cómo separa los grupos de variantes el layout de `wrapLines: "all"`. Coincide con la opción `group`
de `eslint-plugin-better-tailwindcss` (mismo nombre, valores y default), así que una config migrada
se traslada sin cambios.

- `"newLine"` (default): cada run de variantes arranca su propia línea.
- `"emptyLine"`: además, una **línea en blanco** separa los runs (las líneas en blanco no llevan
  whitespace colgando, y `no-unnecessary-whitespace` las preserva).
- `"never"`: sin agrupado — las clases se empaquetan de forma greedy a través de los límites de los
  runs, en las menos líneas que caben en `printWidth`.

`group` solo da forma al layout de `"all"`: `"overWidth"` a propósito nunca reagrupa (solo parte las
líneas que exceden), y el fixer de `classesPerLine` corta por conteo, así que ambos lo ignoran.

```jsonc
{
  "tailwindcss/enforce-consistent-line-wrapping": [
    "error",
    { "printWidth": 100, "wrapLines": "all", "group": "emptyLine" },
  ],
}
```

### `classesPerLine`

`number`, opcional. Sin default.

Cantidad máxima de clases en una sola línea. Cuando se excede dentro de un template literal
(`` `…` ``), la regla autofixea envolviendo las clases en la convención bloque, en chunks de
`classesPerLine` por línea. Dentro de string literals (`"…"`) la regla reporta `tooManyPerLine` pero
no autofixea — los string literals no pueden cruzar líneas con seguridad sin intervención manual.

Setear `classesPerLine` cambia el fixer de template literals a este modo por chunks y apaga el fixer
basado en el width (agrupado por variantes) — `printWidth` entonces solo reporta, y `wrapLines` se
ignora.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "classesPerLine": 5 }] }
```

## Ejemplos

### ✗ Incorrecto

```tsx
// Excede el printWidth default de 80 caracteres — reporta; sin `wrapLines` no hay autofix
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

// printWidth: 40 con wrapLines: "overWidth" — SOLO se re-envuelve la
// línea que excede; las líneas conformes alrededor quedan tal como estaban
const cardClass = `
  flex hover:underline
  items-center justify-between gap-4 rounded-lg p-6
  focus:outline-none
`
// → const cardClass = `
//     flex hover:underline
//     items-center justify-between gap-4
//     rounded-lg p-6
//     focus:outline-none
//   `

// printWidth: 40 con wrapLines: "all" — re-layout completo, agrupado por variante
const buttonClass = `flex items-center gap-2 hover:bg-red-500 hover:underline focus:outline-none`
// → const buttonClass = `
//     flex items-center gap-2
//     hover:bg-red-500 hover:underline
//     focus:outline-none
//   `
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

// Template multilínea formateado a mano, cada línea dentro del printWidth —
// con wrapLines sin setear o en "overWidth"; solo "all" lo reagrupa
const cardClass = `
  flex hover:underline
  items-center
`
```

## Interacciones con otras reglas

- **`no-unnecessary-whitespace`**: preserva a propósito el `\n` + indent que introduce esta regla.
  Las dos están diseñadas para coexistir; sin esa preservación, los fixers oscilarían (issue #14).
- **`enforce-sort-order`**: rearma los strings de clases desde una lista de tokens vía
  `rebuildClassString`, que mantiene los separadores multilínea. El fixer del sort y el del wrap
  corren sobre el mismo string sin pelearse. El fixer del width nunca reordena clases — solo elige
  dónde van los saltos de línea — así que el ordenamiento sigue siendo trabajo exclusivo de
  `enforce-sort-order`.
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
