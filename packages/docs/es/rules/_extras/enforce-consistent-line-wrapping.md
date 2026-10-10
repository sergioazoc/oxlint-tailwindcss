---
description: "Regla de oxlint que reporta strings de clases de Tailwind CSS que pasan un ancho o un límite de clases por línea, y puede partirlos en varias líneas."
---

## Qué hace esta regla

Marca strings de clases largos para que no se desparramen más allá de un largo de línea razonable y,
cuando lo activas, los envuelve en varias líneas. Dos modos de formateo independientes: un re-wrap
basado en el width (opt-in vía `wrapLines`) y un budget de clases por línea (`classesPerLine`),
ambos con autofix en template literals y, con `wrapStrings`, también en string literals: el string
propio de un atributo JSX en su lugar (`"jsx"`), y un string de JS convertido en template (`"all"`).
Si no, los string literals solo reportan — un string de JS no puede cruzar líneas.

DS-opcional — funciona sin `settings.tailwindcss.entryPoint`. La regla opera sobre el string crudo
de clases y no le importa qué significan, con una excepción: cuando **sí** hay un design system
disponible, el agrupado de `wrapLines: "all"` le consulta el prefix de proyecto de Tailwind v4
(`@import "tailwindcss" prefix(tw)`) para que el prefix sea transparente al agrupar — `tw:flex`
agrupa como utility base y `tw:hover:x` como `hover:`. Sin entry point la regla cae silenciosamente
a tratar el prefix como parte de la cadena de variantes (nunca reporta un design system faltante).

Ambos fixers envuelven los template literals en la **convención bloque**: el contenido empieza en su
propia línea, cada línea envuelta se indenta un nivel por debajo de la indentación del statement, y
el backtick de cierre (o la comilla, en un string de atributo JSX) queda en su propia línea. La
indentación base se lee de la línea de código (no de la columna del backtick), así que el bloque
anida bien incluso dentro de JSX muy indentado. El fix de `classesPerLine` y el fix de width en modo
`"overWidth"` son **no destructivos** — un template que ya está envuelto solo re-envuelve sus líneas
que exceden el budget; las líneas conformes quedan intactas. El fix de width en modo `"all"` es un
**re-layout completo**: reacomoda el template entero en la forma canónica agrupada por variantes,
reemplazando cualquier layout hecho a mano (por eso es un modo aparte y explícito). Las otras reglas
(`no-unnecessary-whitespace`, `enforce-sort-order`, …) están al tanto de esta forma multilínea y no
la colapsan de vuelta.

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

`"overWidth" | "all"`, opcional. Sin default — igual que `classesPerLine`, dejarlo sin establecer
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

En un string literal de JS (`cn("…")`, `className={"…"}`, una variable) la regla reporta `tooLong`
sin fix por default: un string de JS no puede contener un salto de línea real, y convertirlo en un
template multilínea cambia el valor del string, así que eso es opt-in — mira `wrapStrings`, que
también puede envolver tal cual el string propio de un atributo JSX. Un fragmento de template
**pegado** a un `${}` sin whitespace (`` `${a}flex …` `` — una sola clase en runtime) no se
autofixea nunca: cualquier whitespace introducido en ese borde partiría esa clase en dos.

Alrededor de una interpolación, el layout `"all"` pone el run de clases que bordea un `${}` en su
**propia línea nueva** (nunca colgando inline después de la expresión), así que toda línea reescrita
queda dentro de `printWidth`. Una salvedad: el ancho de la expresión `${…}` en sí es opaco para la
regla, que mide cada fragmento estático por separado. Por eso una sola línea física que escribas a
mano con un fragmento corto junto a una interpolación ancha puede exceder `printWidth` sin ser
reportada.

`wrapLines` solo aplica cuando `classesPerLine` **no** está establecido — si no, `classesPerLine` es
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
`classesPerLine` por línea. Dentro de un string literal la regla reporta `tooManyPerLine` sin fix, a
menos que `wrapStrings` lo cubra.

Establecer `classesPerLine` cambia el fixer de template literals a este modo por chunks y apaga el
fixer basado en el width (agrupado por variantes) — `printWidth` entonces solo reporta, y
`wrapLines` se ignora.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "classesPerLine": 5 }] }
```

### `wrapStrings`

`"never" | "jsx" | "all"`, default `"never"`.

Qué string literals pueden envolver los fixers, además de los template literals. Aplican tanto
`wrapLines` como `classesPerLine`, y un archivo con finales de línea CRLF recibe saltos CRLF.

Con `"jsx"`, el string propio de un atributo JSX — `className="…"`, o cualquier atributo que el
plugin lee — se envuelve en su lugar en la convención bloque, con la comilla de cierre en la
indentación de la línea del atributo:

```tsx
<div
  className="
    flex items-center justify-between rounded-md px-3 py-1
    text-sm shadow-md
  "
/>
```

Eso es JSX válido tal cual: en un atributo de clases los saltos de línea son espacio en blanco
común, así que no se convierte nada — es el layout que escribe `eslint-plugin-better-tailwindcss`.
Un string de JS — `className={"…"}`, `cn("…")`, una variable — no puede contener un salto de línea
real, así que con `"jsx"` sigue reportando sin fix.

Con `"all"`, el string JSX se envuelve igual, y un string de JS se convierte en un template literal
con el layout en bloque, como hace `eslint-plugin-better-tailwindcss`: en una llamada (`cn("…")`),
en `className={"…"}`, en un array, como valor de un objeto (`cva`, `tv`), en una rama de un ternario
o de un `&&`, y como valor de una variable.

```tsx
const card = cn(`
  flex items-center justify-between rounded-md px-3 py-1
  text-sm shadow-md
`)
```

Una clave de objeto (`cn({ "…": isActive })`) y un operando de `+` nunca se convierten en template,
y tampoco un string que tenga una secuencia de escape, un backtick o `${`, que un template lee
distinto: esos siguen reportando sin fix. El valor del string gana los saltos de línea y la
indentación. En una lista de clases eso es espacio en blanco, pero si tu código usa un string de
clases como otra cosa — divide o compara una variable que coincide con `variablePatterns` — quédate
en `"jsx"`.

Si oxfmt formatea tus archivos con `sortTailwindcss`, pon su `preserveWhitespace: true`: por default
colapsa el espacio en blanco de los strings de clases, tanto el de un atributo JSX como el template
de un helper, saltos de línea del bloque incluidos, y cada uno deshace lo del otro (mira
[/interop](/interop)).

```jsonc
{
  "tailwindcss/enforce-consistent-line-wrapping": [
    "error",
    { "printWidth": 100, "wrapLines": "overWidth", "wrapStrings": "all" },
  ],
}
```

### `entryPoint`

`string`, opcional.

Override por-regla de `settings.tailwindcss.entryPoint`. La regla consulta el design system solo
para el prefix de proyecto de Tailwind v4, y solo bajo `wrapLines: "all"` con `group` `"newLine"` o
`"emptyLine"` (ver arriba); en cualquier otro caso no tiene efecto. Casi nunca hace falta.

## Ejemplos

### ✗ Incorrecto

```tsx
// Excede el printWidth default de 80 caracteres — reporta; sin `wrapLines` no hay autofix
<div className="flex items-center justify-between p-4 m-2 bg-white text-black rounded shadow-lg border w-full" />
//              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ tooLong

// 6 clases con classesPerLine: 3 — el template literal autofixea a un bloque
// options: { "classesPerLine": 3 }
const className = `flex items-center justify-between p-4 m-2 bg-white`
// → const className = `
//     flex items-center justify-between
//     p-4 m-2 bg-white
//   `

// Mismo conteo en un string JSX — reporta; sin wrapStrings: "jsx" no hay autofix
// options: { "classesPerLine": 3 }
<div className="flex items-center justify-between p-4 m-2 bg-white" />

// El mismo string JSX con wrapStrings: "jsx" — se envuelve en su lugar, entre las comillas
// options: { "classesPerLine": 3, "wrapStrings": "jsx" }
<div className="flex items-center justify-between p-4 m-2 bg-white" />
// → <div className="
//     flex items-center justify-between
//     p-4 m-2 bg-white
//   " />

// Un string de JS con wrapStrings: "all" — se convierte en un template literal
// options: { "classesPerLine": 3, "wrapStrings": "all" }
const card = cn("flex items-center justify-between p-4 m-2 bg-white")
// → const card = cn(`
//     flex items-center justify-between
//     p-4 m-2 bg-white
//   `)

// printWidth: 40 con wrapLines: "overWidth" — SOLO se re-envuelve la
// línea que excede; las líneas conformes alrededor quedan tal como estaban
// options: { "printWidth": 40, "wrapLines": "overWidth" }
const className = `
  flex hover:underline
  items-center justify-between gap-4 rounded-lg p-6
  focus:outline-none
`
// → const className = `
//     flex hover:underline
//     items-center justify-between gap-4
//     rounded-lg p-6
//     focus:outline-none
//   `

// printWidth: 40 con wrapLines: "all" — re-layout completo, agrupado por variante
// options: { "printWidth": 40, "wrapLines": "all" }
const className = `flex items-center gap-2 hover:bg-red-500 hover:underline focus:outline-none`
// → const className = `
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
const className = `
  flex hover:underline
  items-center
`

// Un string JSX que ya está en la convención bloque
// options: { "classesPerLine": 3, "wrapStrings": "jsx" }
<div className="
  flex items-center p-4
  bg-white text-black
" />
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
