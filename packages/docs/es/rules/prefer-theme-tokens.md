# prefer-theme-tokens

> Prefer named theme-token utilities over raw CSS variable references when a matching utility exists

## Qué hace esta regla

Detecta utilities escritas como referencia cruda a una variable CSS — `border-(--border)`,
`bg-[var(--primary)]`, `text-(--background)/80` — y las reescribe a la utility de theme-token con
nombre cuando existe en tu design system. Así `border-(--border)` se convierte en `border-border`,
`hover:bg-[var(--primary)]/50` en `hover:bg-primary/50`, y `bg-(--red-500)` (cuando el usuario
omitió el prefijo `--color-`) en `bg-red-500`. Tanto el shorthand de paréntesis (`prefix-(--name)`)
como la forma bracket (`prefix-[var(--name)]`) se reconocen, y los modificadores de opacidad
(`/80`), variants y `!` (important) se preservan.

El candidato `${prefix}-${varName}` tiene que ser una utility real en tu DS — la regla consulta
`cache.isValid(candidate)`. Después omite explícitamente cualquier candidato que
`cache.getNamedEquivalent` también resolvería, porque ese caso es propiedad de
`no-unnecessary-arbitrary-value` (mismo CSS, sin doble-fire). Lo que queda es exactamente el espacio
solo-heurístico: la utility con nombre existe en tu theme pero no comparte una shape bracket-
equivalente con el original.

DS-dependiente — requiere `settings.tailwindcss.entryPoint`. Si el design system no puede cargar, la
regla emite un único diagnóstico fatal `designSystemUnavailable` por archivo en vez de pasar en
silencio.

## Opciones

Esta regla no tiene opciones propias más allá del override estándar `entryPoint` (string, defaultea
a `settings.tailwindcss.entryPoint`). Configura el entry point en `settings.tailwindcss.entryPoint`
para todo el proyecto en vez de por-regla cuando puedas.

## Ejemplos

### ✗ Incorrecto

Asumiendo un theme estilo shadcn con tokens como `--border`, `--primary`, `--background`:

```tsx
// Shorthand de paréntesis — el caso canónico
<div className="border-(--border) bg-(--primary)" />

// Forma bracket
<div className="bg-[var(--primary)]/50" />

// Variants, important y modificadores de opacidad se preservan
<div className="hover:!border-(--border) dark:bg-(--primary)/80" />

// Sub-utility direccional
<div className="border-l-(--border)" />
```

### ✓ Correcto

```tsx
<div className="border-border bg-primary" />

<div className="bg-primary/50" />

<div className="hover:!border-border dark:bg-primary/80" />

<div className="border-l-border" />

// Variable sin utility nombrada que matchee — déjala
<div className="border-(--no-such-token)" />
```

## Interacciones con otras reglas

- **`no-unnecessary-arbitrary-value`**: emparejadas a propósito. Cuando la forma bracket es
  CSS-equivalente a una utility con nombre, esa regla gana y esta se queda en silencio (guard de
  `getNamedEquivalent`). Así `bg-[var(--color-red-500)]` → `bg-red-500` es propiedad de aquella;
  `border-(--border)` → `border-border` vive aquí.
- **`enforce-canonical`**: también parte del trío arbitrario→nombrado. Maneja casos donde la
  canonicalización produce una shape CSS distinta vía tus tokens. Las tres reglas parten el espacio
  para que cada forma arbitraria tenga exactamente un dueño.
- **`enforce-consistent-variable-syntax`**: ortogonal — esa regla decide entre la forma de
  paréntesis y la de bracket cuando te quedas sobre la representación con variable CSS. Esta te
  empuja fuera de las variables CSS hacia un token con nombre cuando se puede.

## Cuándo desactivarla

- **A propósito quieres referenciar variables por nombre en el markup** para que la dependencia del
  theme sea explícita en el call site. En ese caso mantén `no-unnecessary-arbitrary-value` activa
  (casos CSS-equivalentes) pero desactiva esta.
- **Tu design system usa variables CSS que no están registradas como utilities con nombre** en
  `@theme` — la regla no se va a disparar con esas, pero si tu codebase mezcla los dos patrones y no
  quieres presión gradual para exponer más tokens, desactívala.
