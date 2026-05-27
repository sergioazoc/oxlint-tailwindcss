## Qué hace esta regla

Tailwind v4 agregó un shorthand para valores arbitrarios de variables
CSS: `bg-(--primary)` es azúcar para `bg-[var(--primary)]`. Las dos
producen el mismo CSS. Esta regla elige una de las dos sintaxis y
reescribe cada clase que usa la otra. Autofix sobre el primer ofensor
por location, sugerencia de editor sobre los siguientes.

La regla solo toca el par simple `something-[var(--name)]` ↔
`something-(--name)`. Expresiones complejas como
`bg-[color-mix(in_srgb,var(--primary),transparent)]` se dejan
tranquilas — no tienen forma shorthand. El modificador important
(`!flex` / `flex!`) y las cadenas de variants (`hover:`, `dark:`)
hacen round-trip correctamente.

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`.
Transformación pura de string sobre la forma de la utility; sin
lookup en el design system.

## Opciones

### `syntax`

`'shorthand' | 'explicit'`, default `'shorthand'`.

`'shorthand'` reescribe `bg-[var(--primary)]` → `bg-(--primary)`. Es
la forma idiomática de Tailwind v4 y la elección recomendada para
proyectos nuevos. `'explicit'` reescribe en la dirección contraria —
`bg-(--primary)` → `bg-[var(--primary)]` — útil si todavía apuntas a
tooling más viejo o si tu team prefiere la forma larga por
grepability.

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

- **`enforce-canonical`**: no toca la sintaxis de variables. Canonical
  normaliza nombres de utility; esta regla normaliza la forma de la
  variable. Las dos corren juntas sin problemas.
- **`no-unnecessary-arbitrary-value`**: también apunta a valores
  arbitrarios pero para el caso del equivalente nombrado
  (`bg-[#ff0000]` → `bg-red-500`). Disjunta de esta regla.
- **`prefer-theme-tokens`**: cuando una variable CSS matchea un token
  `@theme`, esa regla swappea a la utility nombrada
  (`bg-(--primary)` → `bg-primary` si `--primary` está declarado en
  `@theme`). Ejecuta esa antes que esta si quieres las dos
  transformaciones.

## Cuándo desactivarla

- **Apuntas a tooling más viejo que Tailwind v4**: la forma shorthand
  no está soportada. Seteá `syntax: 'explicit'` en vez de
  desactivarla, así obtienes el rewrite en la dirección segura.
- **Codebase con sintaxis mixta en plena migración** donde la
  consistencia todavía no es el objetivo.
