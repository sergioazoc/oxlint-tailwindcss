# no-unnecessary-whitespace

> Disallow unnecessary whitespace in Tailwind CSS class strings

## Qué hace esta regla

Normaliza el whitespace dentro de strings de clases Tailwind: las corridas de espacios o tabs
colapsan a un espacio, el whitespace leading y trailing se trimea (con una excepción en los
boundaries de expresiones de template — mira abajo), y la regla autofixea todo en una sola pasada.

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`. Transformación pura de
whitespace.

La regla es **multiline-aware**: a propósito preserva `\n` + la indentación que sigue a cada
newline. Ese es el formato que produce `enforce-consistent-line-wrapping` con `classesPerLine`, y
colapsarlo de vuelta armaría un ciclo no fixeable entre las dos reglas (issue #14). Dentro de una
línea, tabs y dobles espacios siguen colapsando normalmente.

Los template literals tienen una regla extra: un único espacio trailing antes de una expresión
(`` `flex ${x}` ``) o un único espacio leading después de una (`` `${x} flex` ``) se preserva — esos
son espacios intencionales que previenen que las clases se fusionen en runtime.

## Opciones

Esta regla no tiene opciones. El comportamiento es "colapsar corridas a espacios únicos, preservar
newlines intencionales y espacios de boundary de templates" — no hay eje útil para configurar.

## Ejemplos

### ✗ Incorrecto

```tsx
// Leading + trailing + dobles espacios internos
<div className="  flex   items-center  " />
//              ~~~~~~~~~~~~~~~~~~~~~~~~  → "flex items-center"

// Doble espacio interno
<div className="flex  items-center" />
//              ~~~~~~~~~~~~~~~~~~  → "flex items-center"

// Tab como separador dentro de una sola línea
const className = `flex\titems-center`
//                 ~~~~~~~~~~~~~~~~~  → "flex items-center"
```

### ✓ Correcto

```tsx
// Espacios únicos
<div className="flex items-center" />

// Template literal: espacios de boundary preservados
<div className={`flex ${x}`} />
<div className={`${x} flex`} />

// Multilínea (e.g. de enforce-consistent-line-wrapping): preservado
const className = `bg-red-500 text-white
                   hover:bg-red-600 focus:ring-2`
```

## Interacciones con otras reglas

- **`enforce-consistent-line-wrapping`**: diseñadas para coexistir. Esta regla preserva el `\n` +
  indent que inserta el wrapping; sin eso, las dos se pelearían en cada pasada de autofix.
- **`enforce-sort-order`** y toda otra regla que reescriba clases: esas rearman el string vía
  `rebuildClassString`, que siempre emite separadores canónicos de un solo espacio — correrlas
  primero hace que `no-unnecessary-whitespace` sea un no-op.
- **Todas las reglas manejadas por el extractor**: el string limpio es lo que ve toda otra regla en
  la próxima pasada, así que correr esta regla temprano en el ciclo de fix mantiene legibles los
  errores downstream.

## Cuándo desactivarla

- **Confías en un formatter** como `prettier` u `oxfmt` para manejar el whitespace global. Cubren el
  mismo terreno, y desactivar la regla de lint elimina trabajo redundante.
- **Strings de clases que usan whitespace inusual a propósito** (muy raro — casi siempre es un bug
  en la config del extractor más que intención).
