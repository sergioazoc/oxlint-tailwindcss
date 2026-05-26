# no-hardcoded-colors

> Disallow hardcoded color values in Tailwind CSS classes

## Qué hace esta regla

Marca utilities de color de Tailwind cuyo arbitrary value es un
literal de color hardcodeado — cualquier cosa que escribirías con un
paint chip en la mano: hex (`bg-[#ff5733]`, `text-[#000]`),
`rgb()`/`rgba()`, `hsl()`/`hsla()`, más los espacios de color
modernos `oklch()`, `oklab()`, `lab()`, `lch()`, `hwb()`, y
`color()`. La intención es la misma que `no-arbitrary-value` pero
acotada exclusivamente al color, que es donde suele empezar el drift
del design system.

La regla revisa _únicamente_ los prefijos de utility que llevan color
(`bg-`, `text-`, `border-*`, `outline-`, `ring-*`, `shadow-`,
`accent-`, `caret-`, `fill-`, `stroke-`, `decoration-`, `divide-`,
`placeholder-`, gradient stops `from-`/`via-`/`to-`). Los arbitrary
no-color como `w-[200px]` o `tracking-[0.5em]` se ignoran
explícitamente, así que puedes activar esta regla incluso donde _sí_
quieres permitir dimensiones arbitrarias.

Los valores que referencian una variable CSS se tratan como
indirección del design system y pasan: `bg-[var(--primary)]`,
`text-[hsl(var(--fg))]`, `bg-[oklch(var(--bg))]`, incluso
`bg-[var(--primary,#fff)]` (un fallback adentro de `var()` sigue
contando como referencia a una variable). El chequeo de `var()` no
es recursivo — `bg-[linear-gradient(hsl(var(--a)),#fff)]` _no_ se
marca porque hay al menos un `var()` presente. Es comportamiento
documentado y testeado.

DS-independiente — no se carga ningún design system. No hay autofix:
elegir el token correcto es una decisión humana.

## Opciones

### `allow`

`string[]`, default `[]`.

Strings exactos de clases para whitelistear. Los matches son
literales (no hay prefix match ni regex), así que puedes permitir
escapes puntuales sin abrir más la puerta. Útil para el hex ocasional
mandado por brand en un único componente de assets.

```jsonc
{
  "tailwindcss/no-hardcoded-colors": ["error", {
    "allow": ["bg-[#000]", "text-[#fff]"]
  }]
}
```

### `entryPoint`

`string`, opcional. Está en el schema por compatibilidad futura pero
la regla todavía no lo usa — `no-hardcoded-colors` corre sin design
system. Lo puedes ignorar.

## Ejemplos

### ✗ Incorrecto

```tsx
// Hex literales sobre utilities de color
<div className="bg-[#ff5733] text-[#000]" />

// rgb/rgba/hsl/oklch dan la misma respuesta
<div className="border-[rgba(0,0,0,0.5)] text-[hsl(120,100%,50%)]" />
<div className="bg-[oklch(0.5_0.2_240)]" />

// Variants y el modificador `!` no salvan
<div className="hover:bg-[#ff5733] !bg-[#ff5733]" />
```

### ✓ Correcto

```tsx
// Colores nombrados del theme
<div className="bg-blue-500 text-white" />

// Indirección por variable CSS pasa
<div className="bg-[var(--primary)] border-[hsl(var(--border))]" />

// Los arbitrary no-color no son asunto de esta regla
<div className="w-[200px] tracking-[0.5em]" />

// String exacto allowlisteado
<div className="bg-[#000]" /> // con allow: ["bg-[#000]"]
```

## Interacciones con otras reglas

- **`no-arbitrary-value`**: superset. Si activas esa regla, cada
  color hardcodeado ya está marcado. Usa `no-hardcoded-colors` sola
  cuando quieres el mensaje específico de color y toleras otros
  arbitrary values; usa ambas para un diagnóstico más claro sobre el
  drift de color.
- **`prefer-theme-tokens`**: complementaria. `prefer-theme-tokens` le
  pregunta al design system si existe un color `@theme` que matchee
  y lo sugiere; esta regla dispara igual exista o no el token, así
  que atrapa el drift más temprano (antes de definir el token).
- **`no-unknown-classes`**: ortogonal. Los arbitrary hardcodeados son
  sintaxis _válida_ de Tailwind, así que `no-unknown-classes` no los
  va a marcar. Deberían estar ambas activas.

## Cuándo desactivarla

- **Páginas de marketing/brand** con hex pinzados a mano que
  genuinamente no pertenecen al design system compartido. Prefiere
  `allow` con los strings de clase específicos.
- **Contenido generado** (e.g. avatares inline coloreados desde un
  hash) donde el color se determina en runtime y se renderea como
  inline style igual — esos no van a aparecer acá, pero si aparecen,
  desactiva la línea.
- **Librerías de componentes que publican ejemplos** que
  deliberadamente demuestran uso de colores arbitrarios en su doc.

