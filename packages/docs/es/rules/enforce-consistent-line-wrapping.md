# enforce-consistent-line-wrapping

> Warn when a class string exceeds the configured print width

## Qué hace esta regla

Marca strings de clases largos para que no se desparramen más allá de
un largo de línea razonable y, opcionalmente, los parte en varias
líneas cuando contienen más clases de las que tu team acuerda que una
sola línea debería cargar. Dos triggers independientes: un print
width basado en caracteres (solo warn) y un budget de clases por
línea (autofix en template literals).

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`. La
regla opera sobre el string crudo de clases y no le importa qué
significan.

El path de autofix preserva la indentación del nodo host — al partir
un template literal en varias líneas, la regla inserta `\n` + el
offset de columna del backtick de apertura. Las otras reglas
(`no-unnecessary-whitespace`, `enforce-sort-order`, …) están al tanto
de esta forma multilínea y no la colapsan de vuelta.

## Opciones

### `printWidth`

`number`, default `80`.

Largo total máximo del string de clases. Cuando se excede, la regla
reporta `tooLong` pero **no** autofixea — partir un string largo en
un literal multilínea es una decisión de criterio (extraer un
componente vs. solo wrappearlo), así que la regla saca el warning y
te deja decidir.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "printWidth": 100 }] }
```

### `classesPerLine`

`number`, opcional. Sin default.

Cantidad máxima de clases en una sola línea. Cuando se excede dentro
de un template literal (`` `…` ``), la regla autofixea partiendo las
clases en chunks de `classesPerLine` separados por `\n` + indent.
Dentro de string literals (`"…"`) la regla reporta `tooManyPerLine`
pero no autofixea — los string literals no pueden cruzar líneas con
seguridad sin intervención manual.

```jsonc
{ "tailwindcss/enforce-consistent-line-wrapping": ["error", { "classesPerLine": 5 }] }
```

## Ejemplos

### ✗ Incorrecto

```tsx
// Excede el printWidth default de 80 caracteres
<div className="flex items-center justify-between p-4 m-2 bg-white text-black rounded shadow-lg border w-full" />
//              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ tooLong

// 6 clases con classesPerLine: 3 — el template literal autofixea
const className = `flex items-center justify-between p-4 m-2 bg-white`
// → `flex items-center justify-between\n        p-4 m-2 bg-white`

// Mismo conteo, string literal — reporta pero no autofixea
<div className="flex items-center justify-between p-4 m-2 bg-white" />
```

### ✓ Correcto

```tsx
// Cabe dentro del printWidth
<div className="flex items-center p-4" />

// Ya wrappeado al classesPerLine
const className = `flex items-center p-4
                   bg-white text-black`
```

## Interacciones con otras reglas

- **`no-unnecessary-whitespace`**: preserva a propósito el
  `\n` + indent que introduce esta regla. Las dos están diseñadas
  para coexistir; sin esa preservación, los fixers oscilarían (issue
  #14).
- **`enforce-sort-order`**: rearma los strings de clases desde una
  lista de tokens vía `rebuildClassString`, que mantiene los
  separadores multilínea. El fixer del sort y el del wrap corren
  sobre el mismo string sin pelearse.
- **Todas las reglas manejadas por el extractor**:
  `splitClassesWithSeparators` es multiline-aware, así que toda otra
  regla (`enforce-canonical`, `enforce-shorthand`, …) reporta sobre
  strings multilínea igual que sobre los de una sola línea.

## Cuándo desactivarla

- **Dejas que `prettier` maneje el line wrapping de JSX**: prettier
  rompe a nivel del atributo JSX, no dentro del string. Son
  complementarias, pero si no quieres wrapping in-string en absoluto,
  desactivala.
- **Trabajando con generadores de código** que emiten strings de
  clases muy largos a propósito (e.g. clases para contenido manejado
  por CMS).
- **Usas otra convención** del estilo "siempre una clase por línea":
  el wrapping por chunks de esta regla no modela eso.

