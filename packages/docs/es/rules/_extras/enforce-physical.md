---
description: "Regla de oxlint para proyectos solo LTR que reescribe utilidades lógicas de Tailwind CSS a físicas, como `ms-4` → `ml-4` — el espejo de `enforce-logical`."
---

## Qué hace esta regla

El espejo de `enforce-logical`. Reescribe utilities lógicas conscientes del writing direction
(`ms-4`, `pe-2`, `inset-s-0`, `rounded-ss-md`, y en el eje block `mbs-4`, `inset-bs-0`, `border-be`,
…) a sus equivalentes físicas (`ml-4`, `pr-2`, `left-0`, `rounded-tl-md`, `mt-4`, `top-0`,
`border-b`, …). Úsala en codebases LTR-only donde las utilities lógicas agregan carga cognitiva sin
payoff — `ml-4` es más directo que `ms-4` cuando no hay historia de RTL. Autofix sobre el primer
ofensor por location, sugerencia de editor sobre los siguientes. El mapeo es la tabla de
`enforce-logical`, invertida.

Convierte **las dos** formas de los insets lógicos: `inset-s-2` (la que escriben `enforce-logical` y
`enforce-canonical` en Tailwind 4.2+, la grafía que el design system considera canónica) y `start-2`
(la forma anterior, la que usaban los docs de Tailwind y la que `enforce-logical` sigue escribiendo
sin design system).

También refleja las tres utilities donde la dirección es el VALOR: `float-start` → `float-left`,
`clear-start` → `clear-left`, `text-start` → `text-left`.

DS-independiente en lo que importa: comparte la tabla estática de mapeo con `enforce-logical` y la
invierte, así que funciona sin `settings.tailwindcss.entryPoint` — cada clase física que escribe
existe en todo Tailwind v4. Cuando SÍ hay un entry point configurado, la regla además comprueba que
la clase que sugiere exista, así que una reescritura nunca puede introducir una clase que no emita
nada.

`enforce-physical` y `enforce-logical` son reglas hermanas. Activa **solo una a la vez** — correr
las dos produce un loop de autofix.

## Opciones

### `direction`

`'inline' | 'block' | 'both'`, default `'both'`.

Restringe la conversión a un eje: `'inline'` convierte las utilities de start/end (`ms-*`,
`inset-s-*`, `border-e`, …), `'block'` las de block-start/end (`mbs-*`, `inset-bs-*`, `border-be`,
…).

```jsonc
{ "tailwindcss/enforce-physical": ["error", { "direction": "inline" }] }
```

### `sizing`

`boolean`, default `false`.

Convierte también los tamaños lógicos de vuelta: `inline-*` → `w-*`, `block-*` → `h-*`, y sus formas
`min-` / `max-`, un eje a la vez (`inline-4 block-4` → `w-4 h-4`). `inline`, `block` e
`inline-{block,flex,grid,table}` son utilities de display y nunca se tocan.

```jsonc
{ "tailwindcss/enforce-physical": ["error", { "sizing": true }] }
```

### `allowlist`

`string[]`, default `[]`.

Patrones regex (compilados lazy, los inválidos se saltean en silencio). Las clases cuyo string
completo coincida con algún patrón bypassean el rewrite. Útil cuando una utility lógica específica
es intencional incluso en un codebase mayormente-LTR (e.g. un componente que sí tiene que soportar
RTL).

```jsonc
{ "tailwindcss/enforce-physical": ["error", { "allowlist": ["^ms-", "^pe-"] }] }
```

### `entryPoint`

`string`, opcional. Un entry point CSS solo para esta regla, que pisa
`settings.tailwindcss.entryPoint`. Se usa únicamente para confirmar que la clase sugerida exista; la
regla funciona sin él.

## Ejemplos

### ✗ Incorrecto

```tsx
// La dirección como VALOR
<div className="float-start clear-end text-start" />
//              ~~~~~~~~~~~ ~~~~~~~~~ ~~~~~~~~~~ → float-left clear-right text-left

// Las dos formas de los insets lógicos
<div className="start-2 inset-s-4" />
//              ~~~~~~~ ~~~~~~~~~  → left-2 left-4

// Márgenes/padding lógicos en un proyecto LTR-only
<div className="ms-4 pe-2" />
//              ~~~~ ~~~~  → ml-4 pr-2

// Posicionamiento lógico
<div className="inset-s-0 inset-e-0" />
//              ~~~~~~~~~ ~~~~~~~~~  → left-0 right-0

// Borders y radii lógicos
<div className="border-s rounded-ss-md" />
//              ~~~~~~~~ ~~~~~~~~~~~~~  → border-l rounded-tl-md

// El eje block
<div className="mbs-4 inset-bs-0 border-be" />
//              ~~~~~ ~~~~~~~~~~ ~~~~~~~~~  → mt-4 top-0 border-b

// options: { "sizing": true }
// Tamaños lógicos
<div className="inline-full block-screen" />
//              ~~~~~~~~~~~ ~~~~~~~~~~~~  → w-full h-screen
```

### ✓ Correcto

```tsx
// Equivalentes físicos
<div className="ml-4 pr-2" />
<div className="left-0 right-0" />
<div className="border-l rounded-tl-md" />
<div className="mt-4 top-0 border-b" />

// options: { "sizing": true }
// Las utilities de display no son tamaños
<div className="inline-flex block" />

// Ya físico — variants e important hacen round-trip limpio
<div className="hover:ml-4 pl-(--gutter) mr-4!" />
```

## Interacciones con otras reglas

- **`enforce-logical`**: la inversa. Elige **una**. Correr las dos simultáneamente reescribe en
  loop.
- **`enforce-canonical`**: reescribe `start-2` → `inset-s-2`. Inofensivo aquí: esta regla convierte
  las dos formas a `left-2`.
- **`enforce-shorthand`**: las dos reescriben pares de lados. `mbs-2 mbe-2` son dos clases del eje
  block para esta regla y `my-2` para aquella, y `enforce-shorthand` pliega igual el par físico que
  escribe esta regla (`mt-2 mb-2`), así que aplique primero el fix que sea, el string termina en
  `my-2`.

## Cuándo desactivarla

- **La app soporta RTL** (árabe, hebreo, farsi, …): usa `enforce-logical` en su lugar, si no el
  autofix de la regla rompe los layouts en RTL.
- **No tienes preferencia fuerte**: dejar las dos desactivadas está bien. Las dos reglas existen
  para expresar convenciones de team, no para enforzar correctness.
