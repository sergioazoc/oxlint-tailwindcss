---
title: "enforce-logical — regla de lint para Tailwind CSS"
description: "Regla de oxlint que reescribe utilidades físicas de Tailwind CSS a lógicas, compatibles con RTL, como ml-4 → ms-4 y pr-2 → pe-2, con autofix."
---

# enforce-logical

Regla de oxlint que reescribe utilidades físicas de Tailwind CSS a lógicas, compatibles con RTL,
como `ml-4` → `ms-4` y `pr-2` → `pe-2`, con autofix.

## De un vistazo

| Autofix | Sugerencias en el editor | Design system                         | Opciones                                         |
| ------- | ------------------------ | ------------------------------------- | ------------------------------------------------ |
| Sí      | Sí                       | Opcional — se usa si hay `entryPoint` | `allowlist`, `direction`, `sizing`, `entryPoint` |

## Qué hace esta regla

Reescribe utilities de dirección física de Tailwind a sus equivalentes lógicos, conscientes del modo
de escritura: `ml-4` → `ms-4`, `pr-2` → `pe-2`, `left-0` → `inset-s-0`, `rounded-tl-md` →
`rounded-ss-md`, y en el eje block `mt-4` → `mbs-4`, `top-0` → `inset-bs-0`, `border-b` →
`border-be`. Las utilities lógicas resuelven a `margin-inline-start` / `padding-block-end` / … en
CSS, así que siguen la dirección de escritura sin código extra: necesaria si tu app se distribuye en
árabe, hebreo, farsi o cualquier otro idioma RTL, y el eje block además sigue un modo de escritura
vertical. Autofix sobre el primer ofensor por location, sugerencia de editor sobre los siguientes.

| Física                                                          | Lógica                                                          | Eje                  |
| --------------------------------------------------------------- | --------------------------------------------------------------- | -------------------- |
| `ml` / `mr`, `pl` / `pr`                                        | `ms` / `me`, `ps` / `pe`                                        | inline               |
| `scroll-ml` / `scroll-mr`, `scroll-pl` / `scroll-pr`            | `scroll-ms` / `scroll-me`, `scroll-ps` / `scroll-pe`            | inline               |
| `left` / `right`                                                | `inset-s` / `inset-e` (`start` / `end` antes de 4.2)            | inline               |
| `border-l` / `border-r`                                         | `border-s` / `border-e`                                         | inline               |
| `rounded-l` / `rounded-r`, `rounded-tl` / `-tr` / `-bl` / `-br` | `rounded-s` / `rounded-e`, `rounded-ss` / `-se` / `-es` / `-ee` | inline               |
| `float-`, `clear-`, `text-` `left` / `right`                    | `float-`, `clear-`, `text-` `start` / `end`                     | inline               |
| `mt` / `mb`, `pt` / `pb`                                        | `mbs` / `mbe`, `pbs` / `pbe`                                    | block                |
| `scroll-mt` / `scroll-mb`, `scroll-pt` / `scroll-pb`            | `scroll-mbs` / `scroll-mbe`, `scroll-pbs` / `scroll-pbe`        | block                |
| `top` / `bottom`                                                | `inset-bs` / `inset-be`                                         | block                |
| `border-t` / `border-b`                                         | `border-bs` / `border-be`                                       | block                |
| `w`, `min-w`, `max-w`                                           | `inline`, `min-inline`, `max-inline`                            | inline, con `sizing` |
| `h`, `min-h`, `max-h`                                           | `block`, `min-block`, `max-block`                               | block, con `sizing`  |
| `size`                                                          | `inline` + `block`                                              | ambos, con `sizing`  |

`rounded-t-*` / `rounded-b-*` no tienen equivalente en el eje block (Tailwind no tiene
`rounded-bs`), así que se dejan como están.

La tabla también cubre las tres utilities donde la dirección es el VALOR y no parte de la propiedad:
`float-left` → `float-start` (`float: inline-start`), `clear-left` → `clear-start` y `text-left` →
`text-start` (`text-align: start`). Si esas faltan, un codebase puede estar "totalmente convertido"
y seguir flotando cosas a la izquierda en RTL.

El eje block, los tamaños lógicos e `inset-s-*` / `inset-e-*` llegaron en Tailwind 4.2. Con design
system la regla comprueba que tu Tailwind los tenga: en 4.1 deja el eje block como está y escribe
`start-0` para `left-0`. Sin `settings.tailwindcss.entryPoint` no hay contra qué comprobarlo, así
que escribe `start-0` y solo **sugiere** las reescrituras del eje block, nunca las autofixea.

DS-independiente en lo que importa: la tabla de mapeo es estática y la regla funciona sin entry
point. Cuando SÍ hay uno configurado, la regla además comprueba que la clase que sugiere exista — un
proyecto con su propia `@utility ml-huge` recibía un autofix a `ms-huge`, que no emite CSS ninguno,
así que el fix se aplicaba y el margen desaparecía en silencio.

`enforce-logical` y `enforce-physical` son reglas hermanas — comparten una tabla de mapeo que una
invierte. Activa **solo una a la vez**.

## Opciones

### `direction`

`'inline' | 'block' | 'both'`, default `'both'`.

Restringe la conversión a un eje. `'inline'` convierte izquierda y derecha (`ml-*`, `left-*`,
`border-r`, `float-left`, …), la parte que importa para RTL. `'block'` convierte arriba y abajo
(`mt-*`, `top-*`, `border-b`, …), que solo difieren de su forma lógica en un modo de escritura
vertical. Un codebase convertido para RTL que nunca pone texto en vertical puede quedarse en
`'inline'`.

```jsonc
{ "tailwindcss/enforce-logical": ["error", { "direction": "inline" }] }
```

### `sizing`

`boolean`, default `false`.

Convierte también anchos y altos: `w-*` → `inline-*`, `h-*` → `block-*`, sus formas `min-` / `max-`,
y `size-*` → `inline-* block-*`. Viene apagada: los tamaños están en casi todos los strings de
clases, y un ancho es igual a un inline size en cualquier modo de escritura horizontal, RTL
incluido. Sigue a `direction` — `w-*` es inline, `h-*` block, y `size-*` necesita los dos.

Algunos tamaños no tienen equivalente lógico y se dejan como están: un ancho en altos de viewport
(`w-dvh`) o un alto en anchos de viewport (`h-dvw`), `max-w-prose` y `max-w-screen-*`. Con design
system, un valor con nombre se convierte solo si las dos clases declaran lo mismo: `w-*` lee primero
`--width-*` e `inline-*` solo `--container-*`, así que si tu theme define `--width-xs`, `w-xs` e
`inline-xs` difieren y `w-xs` se queda como está.

```jsonc
{ "tailwindcss/enforce-logical": ["error", { "sizing": true }] }
```

### `allowlist`

`string[]`, default `[]`.

Patrones regex (compilados lazy, los inválidos se saltean en silencio). Las clases cuyo string
completo coincida con algún patrón bypassean el rewrite. Úsalo para casos puntuales donde
genuinamente quieres dirección física — e.g. un ícono que siempre tiene que estar a la izquierda
visual sin importar el writing direction.

```jsonc
{ "tailwindcss/enforce-logical": ["error", { "allowlist": ["^ml-icon$", "^rounded-tl-special$"] }] }
```

### `entryPoint`

`string`, opcional. Un entry point CSS solo para esta regla, que pisa
`settings.tailwindcss.entryPoint`. Se usa únicamente para confirmar que la clase sugerida exista y
que tu Tailwind tenga las utilities de 4.2; la regla funciona sin él.

## Ejemplos

### ✗ Incorrecto

```tsx
// Márgenes/padding físicos
<div className="ml-4 pr-2" />
//              ~~~~ ~~~~  → ms-4 pe-2

// La dirección como VALOR
<div className="float-left clear-right text-left" />
//              ~~~~~~~~~~ ~~~~~~~~~~~ ~~~~~~~~~ → float-start clear-end text-start

// Posicionamiento
<div className="left-0 right-0" />
//              ~~~~~~ ~~~~~~~  → inset-s-0 inset-e-0

// Borders y radii
<div className="border-l rounded-tl-md" />
//              ~~~~~~~~ ~~~~~~~~~~~~~  → border-s rounded-ss-md

// El eje block
<div className="mt-4 top-0 border-b" />
//              ~~~~ ~~~~~ ~~~~~~~~  → mbs-4 inset-bs-0 border-be

// options: { "sizing": true }
// Tamaños
<div className="w-full h-screen size-4" />
//              ~~~~~~ ~~~~~~~~ ~~~~~~  → inline-full block-screen inline-4 block-4
```

### ✓ Correcto

```tsx
// Equivalentes lógicos
<div className="ms-4 pe-2" />
<div className="inset-s-0 inset-e-0" />
<div className="border-s rounded-ss-md" />
<div className="mbs-4 inset-bs-0 border-be" />

// Ya lógico — variants e important hacen round-trip limpio
<div className="hover:ms-4 ps-(--gutter) me-4!" />

// options: { "direction": "inline" }
// Solo el eje inline: el eje block se deja como está
<div className="mt-4 top-0" />
```

## Interacciones con otras reglas

- **`enforce-physical`**: la inversa. Comparten la tabla de mapeo; activar las dos al mismo tiempo
  va a autofixear en loop. Elige una según si tu app soporta RTL (usa `enforce-logical`) o es
  LTR-only (usa `enforce-physical`).
- **`enforce-canonical`**: coincide en los insets lógicos. En Tailwind 4.2+ esta regla escribe
  `inset-s-2`, la grafía que el design system reporta como canónica; `start-2` (lo que escribe sin
  design system, o en 4.1) lo reescribe `enforce-canonical` a `inset-s-2`. El CSS es el mismo en
  ambos casos, y `enforce-physical` convierte las dos grafías de vuelta.
- **`enforce-shorthand`**: las dos reescriben pares de lados. `mt-2 mb-2` es un par del eje block
  para esta regla y `my-2` para aquella; `enforce-shorthand` además pliega los pares lógicos que
  escribe esta regla (`mbs-2 mbe-2` → `my-2`, `inset-s-0 inset-e-0` → `inset-x-0`), así que aplique
  primero el fix que sea, el string termina en `my-2`, que ya es lógico (`margin-block`). Con
  `sizing`, `w-4 h-4` termina en `inline-4 block-4` en ambos casos: `enforce-shorthand` nunca pliega
  ese par en `size-4`. La única combinación que puede terminar de dos formas es
  `direction: 'inline'` con `sizing`: `w-4 h-4` queda en `size-4` o en `inline-4 h-4` según qué fix
  corra primero.

## Cuándo desactivarla

- **Aplicaciones LTR-only** donde estás seguro de que nunca vas a necesitar RTL. Usa
  `enforce-physical` en su lugar si quieres consistencia en la otra dirección.
- **Layouts pixel-perfect donde la dirección física es parte del diseño** (raro, pero pasa con
  íconos o decoración). Tira del `allowlist` antes que desactivar globalmente.
