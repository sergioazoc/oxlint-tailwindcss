---
description: "Regla de oxlint que escribe las variables CSS en clases de Tailwind de una sola forma — `bg-(--primary)` o `bg-[var(--primary)]` — y reescribe la otra."
---

## Qué hace esta regla

Tailwind v4 agregó un shorthand para valores arbitrarios de variables CSS: `bg-(--primary)` es
azúcar para `bg-[var(--primary)]`. Las dos producen el mismo CSS. Esta regla elige una de las dos
sintaxis y reescribe cada clase que usa la otra. Autofix sobre el primer ofensor por location,
sugerencia de editor sobre los siguientes.

La regla solo toca el par simple `something-[var(--name)]` ↔ `something-(--name)`. Expresiones
complejas como `bg-[color-mix(in_srgb,var(--primary),transparent)]` se dejan tranquilas — no tienen
forma shorthand. El modificador important (`!flex` / `flex!`) y las cadenas de variants (`hover:`,
`dark:`) hacen round-trip correctamente.

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`. Transformación pura de string
sobre la forma de la utility; sin lookup en el design system.

## Opciones

### `syntax`

`'shorthand' | 'explicit'`, default `'shorthand'`.

`'shorthand'` reescribe `bg-[var(--primary)]` → `bg-(--primary)`. Es la forma idiomática de Tailwind
v4 y la elección recomendada para proyectos nuevos. `'explicit'` reescribe en la dirección contraria
— `bg-(--primary)` → `bg-[var(--primary)]` — útil si todavía apuntas a tooling más viejo o si tu
team prefiere la forma larga por grepability.

```jsonc
{ "tailwindcss/enforce-consistent-variable-syntax": ["error", { "syntax": "shorthand" }] }
```

## Ejemplos

### ✗ Incorrecto

```tsx
// Default shorthand — la forma explícita se reporta
<div className="bg-[var(--primary)]" />
//              ~~~~~~~~~~~~~~~~~~~  → bg-(--primary)

// Con cadena de variants
<div className="dark:hover:text-[var(--color)]" />
//              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  → dark:hover:text-(--color)

// Con modificador important
<div className="!bg-[var(--primary)]" />
//              ~~~~~~~~~~~~~~~~~~~~  → !bg-(--primary)
```

### ✓ Correcto

```tsx
// Shorthand (default)
<div className="bg-(--primary) text-(--text-color)" />

// Variants e important hacen round-trip limpio
<div className="hover:bg-(--primary) font-bold!" />

// Expresiones complejas NO se reescriben
<div className="bg-[color-mix(in_srgb,var(--primary),transparent)]" />
```

## Interacciones con otras reglas

- **`enforce-canonical`**: esta regla es la única dueña de la sintaxis de variables. Como `bg-(--x)`
  es la forma canónica de Tailwind, `enforce-canonical` reportaría el mismo swap `bg-[var(--x)]` →
  `bg-(--x)`; en cambio, **cede** la conversión pura bracket↔paren a esta regla (igual que cede los
  renombres de v3 a `no-deprecated-classes`). Eso evita un diagnóstico duplicado y, cuando esta
  regla está en modo `explicit`, una pelea de autofix. `enforce-canonical` sigue manejando las
  canonicalizaciones de variables que _no_ son un swap simple: un valor que mapea a un token
  nombrado (`rounded-[var(--radius-sm)]` → `rounded-sm`) o una forma con modificador de opacidad
  (`text-[var(--color-text)]/90` → `text-(--color-text)/90`).
- **`no-unnecessary-arbitrary-value`**: en su mayoría disjunta — convierte un valor arbitrario a su
  equivalente nombrado (`bg-[#ff0000]` → `bg-red-500`). Solo se solapan cuando el valor de una
  variable coincide con una utility nombrada: sobre `bg-[var(--color-red-500)]` esa regla dispara (→
  `bg-red-500`) y esta también (→ `bg-(--color-red-500)`). Proponen destinos distintos, así que
  activa la que refleje tu política — o ejecuta `no-unnecessary-arbitrary-value` primero si
  prefieres la utility nombrada.
- **`prefer-theme-tokens`**: cuando una variable CSS coincide con un token `@theme`, esa regla
  cambia a la utility nombrada (`bg-(--primary)` → `bg-primary` si `--primary` está declarado en
  `@theme`). Ejecuta esa antes que esta si quieres las dos transformaciones.

## Cuándo desactivarla

- **Apuntas a tooling más viejo que Tailwind v4**: la forma shorthand no está soportada. Configura
  `syntax: 'explicit'` en vez de desactivarla, así obtienes el rewrite en la dirección segura.
- **Codebase con sintaxis mixta en plena migración** donde la consistencia todavía no es el
  objetivo.
