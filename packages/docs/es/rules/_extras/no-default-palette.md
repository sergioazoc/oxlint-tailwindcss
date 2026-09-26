---
description: "Regla de oxlint que reporta colores de la paleta por defecto de Tailwind CSS, como `bg-red-500`, en un proyecto con colores propios, y nombra los que usar."
---

## Qué hace esta regla

Tailwind trae una paleta por defecto — `red-500`, `gray-100`, `white`, 288 colores en total — y tu
theme agrega los suyos: `brand`, o los `primary`, `muted` y `destructive` de shadcn/ui. Cuando un
proyecto ya tiene colores propios, un color de la paleta suele ser una fuga del design system: no
sigue al theme, y `bg-white` sigue blanco en modo oscuro, donde `bg-background` no. Esta regla
reporta cada clase que lee un color de la paleta, y nombra tus colores en el mensaje:

```text
"bg-red-500" uses red-500 from Tailwind's default palette, not one of your theme colors: brand,
brand-light.
```

Lee lo que hace cada clase, no su nombre: cualquier utility que pone un color (`bg-`, `text-`,
`border-`, `ring-`, `from-`, `fill-`, …), con variants y modificadores de opacidad
(`hover:bg-red-500/50`), y un valor arbitrario que lee una variable de la paleta
(`bg-[var(--color-red-500)]`). Un color de la paleta que tu theme redefine (`--color-red-500: …` en
tu `@theme`) es tuyo, y no se reporta. `transparent`, `current` e `inherit` no son colores de la
paleta.

Sin colores propios — Tailwind tal cual — la paleta _es_ el design system del proyecto, y la regla
no reporta nada.

DS-dependiente — necesita `settings.tailwindcss.entryPoint` para distinguir la paleta de tus
colores. Sin autofix: a cuál de tus colores debe pasar un color de la paleta es una decisión de
diseño.

## Opciones

### `allow`

`string[]`, default `[]`.

Colores de la paleta que se permiten, por nombre, o por prefijo con un `*` al final. `white` y
`black` también son colores de la paleta, y se reportan salvo que los permitas.

```jsonc
{ "tailwindcss/no-default-palette": ["error", { "allow": ["white", "black", "gray-*"] }] }
```

### `entryPoint`

`string`, opcional. Override por regla de `settings.tailwindcss.entryPoint`.

## Ejemplos

Con un theme que declara `--color-brand` y `--color-brand-light`:

### ✗ Incorrecto

```tsx
<div className="bg-red-500" />
// reports: "bg-red-500" uses red-500 from Tailwind's default palette

// Variants, modificadores de opacidad y cualquier utility de color leen la misma variable
<div className="hover:text-blue-600 bg-gray-900/50 from-emerald-400" />

// Un valor arbitrario que lee una variable de la paleta
<div className="bg-[var(--color-red-500)]" />

// white y black son colores de la paleta
<div className="bg-white" />
```

### ✓ Correcto

```tsx
<div className="bg-brand text-brand-light hover:bg-brand/90" />

// No son colores de la paleta
<div className="bg-transparent text-current" />

// Permitidos por nombre o prefijo
// options: { "allow": ["white", "gray-*"] }
<div className="bg-white text-gray-900" />
```

## Interacciones con otras reglas

- **`no-hardcoded-colors`**: la otra mitad. Reporta literales de color (`bg-[#f00]`); esta regla
  reporta colores de la paleta (`bg-red-500`). Juntas dejan solo los colores de tu theme.
- **`no-unknown-classes`**: un color del theme mal escrito (`bg-brnd`) no es de la paleta; esa regla
  lo reporta, junto al nombre que querías.
- **`no-raw-colors` de @shadcn/lint** reporta los mismos colores de la paleta en un proyecto
  shadcn/ui; usa una de las dos. Mira [shadcn/ui y @shadcn/lint](/es/shadcn).

## Cuándo desactivarla

- **La paleta es tu design system**, o parte de él, a propósito: permite esos colores con `allow`, o
  deja la regla apagada.
- **Código que no es tuyo**, como componentes vendorizados estilados con la paleta.
