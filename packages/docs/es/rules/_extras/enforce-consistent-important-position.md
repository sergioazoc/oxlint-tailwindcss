---
description: "Regla de oxlint que pone el modificador important de Tailwind CSS en una sola posición — sufijo `flex!` (la forma de v4) o prefijo `!flex` — y corrige el resto."
---

## Qué hace esta regla

Tailwind v4 soporta dos sintaxis para el modificador `!important`: prefijo (`!flex`, la forma de la
era v3) y sufijo (`flex!`, la forma canónica de v4). Las dos producen el mismo CSS, pero mezclarlas
dentro de un proyecto deja el codebase inconsistente y rompe el copy-paste entre archivos. Esta
regla elige una posición y reescribe cada ofensor para que coincida. Autofix sobre el primer hit por
location, sugerencia de editor sobre los siguientes.

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`. Es una transformación de string
pura, así que corre en todos lados, incluyendo proyectos que todavía no cablearon el design system.

## Opciones

### `position`

`'prefix' | 'suffix'`, default `'suffix'`.

`'suffix'` es la forma canónica de Tailwind v4 (`flex!`, `hover:text-red!`), así que es la elección
recomendada para proyectos nuevos. `'prefix'` mantiene la forma de v3 (`!flex`, `hover:!text-red`) —
elígela solo si tu codebase todavía está en la grafía de v3 y no quieres migrar todavía.

```jsonc
{ "tailwindcss/enforce-consistent-important-position": ["error", { "position": "suffix" }] }
```

Nota: `enforce-canonical` preserva la posición del `!` que escribiste (no la normaliza), así que
cualquier valor de `position` compone con él sin problemas. Esta regla es la única fuente de verdad
para la posición del `!`.

## Ejemplos

### ✗ Incorrecto

```tsx
// Default suffix: el prefijo se reporta
<div className="!font-bold" />
//              ~~~~~~~~~~  → font-bold!

// Lo mismo con cadena de variants
<div className="hover:!text-red" />
//              ~~~~~~~~~~~~~~~  → hover:text-red!

// Varios ofensores en un mismo string
<div className="!font-bold !text-red" />
//              ~~~~~~~~~~ ~~~~~~~~~  → font-bold! text-red!
```

### ✓ Correcto

```tsx
// Default (suffix)
<div className="font-bold!" />
<div className="hover:text-red!" />
<div className="font-bold! text-red!" />

// Sin important — la regla no toca clases normales
<div className="flex items-center" />
```

## Interacciones con otras reglas

- **`enforce-canonical`**: preserva la posición del `!` que escribiste (prefijo, sufijo o ninguno)
  en vez de normalizarla, así que nunca se pelea con esta regla sin importar el `position` que
  elijas. Esta regla es la única fuente de verdad para la posición del `!`.
- **`enforce-sort-order`**: independiente de la posición del important. Tanto la forma prefijo como
  la sufijo ordenan igual.
- **`no-unknown-classes`**: hace lookup de la utility bare, sacando `!` de cualquier lado, así que
  ninguna forma la dispara.

## Cuándo desactivarla

- **El codebase mezcla las dos formas a propósito** (e.g. archivos legacy de v3 conviviendo con
  archivos frescos de v4 durante una migración). Reactívala cuando termine la migración.
- **No te importa la consistencia de la posición del `!`.** Ninguna otra regla la impone —
  `enforce-canonical` preserva la posición que hayas escrito — así que desactivar esta deja la
  posición del `!` sin chequear.
