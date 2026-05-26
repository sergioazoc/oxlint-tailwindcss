# enforce-consistent-important-position

> Enforce consistent position of the important (!) modifier. Default: suffix (Tailwind v4 canonical form). Note: using "prefix" may conflict with enforce-canonical which normalizes to suffix.

## Qué hace esta regla

Tailwind v4 soporta dos sintaxis para el modificador `!important`:
prefijo (`!flex`, la forma de la era v3) y sufijo (`flex!`, la forma
canónica de v4). Las dos producen el mismo CSS, pero mezclarlas
dentro de un proyecto deja el codebase inconsistente y rompe el
copy-paste entre archivos. Esta regla elige una posición y reescribe
cada ofensor para que matchee. Autofix sobre el primer hit por
location, sugerencia de editor sobre los siguientes.

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`. Es
una transformación de string pura, así que corre en todos lados,
incluyendo proyectos que todavía no cablearon el design system.

## Opciones

### `position`

`'prefix' | 'suffix'`, default `'suffix'`.

`'suffix'` es la forma canónica de Tailwind v4 (`flex!`,
`hover:text-red!`) y matchea lo que produciría `enforce-canonical`,
así que es la elección recomendada para proyectos nuevos. `'prefix'`
mantiene la forma de v3 (`!flex`, `hover:!text-red`) — elegila solo
si tu codebase todavía está en el spelling de v3 y no querés migrar
todavía.

```jsonc
{ "tailwindcss/enforce-consistent-important-position": ["error", { "position": "suffix" }] }
```

Nota: setear `position: 'prefix'` va a entrar en conflicto con
`enforce-canonical`, que normaliza a sufijo. Usá una o la otra.

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

- **`enforce-canonical`**: con `position: 'suffix'` (el default) las
  dos reglas concuerdan. Con `position: 'prefix'` se pelean —
  canonical reescribe a sufijo en cada pasada del fix. Quedate con
  sufijo a menos que tengas una razón fuerte.
- **`enforce-sort-order`**: independiente de la posición del
  important. Tanto la forma prefijo como la sufijo ordenan igual.
- **`no-unknown-classes`**: hace lookup de la utility bare, sacando
  `!` de cualquier lado, así que ninguna forma la dispara.

## Cuándo desactivarla

- **El codebase mezcla las dos formas a propósito** (e.g. archivos
  legacy de v3 conviviendo con archivos frescos de v4 durante una
  migración). Reactivala cuando termine la migración.
- **Ya estás corriendo `enforce-canonical`** y confiás en que
  normalice la posición del `!` como parte de la canonicalización —
  dejar esta regla activada es inocuo pero redundante.

