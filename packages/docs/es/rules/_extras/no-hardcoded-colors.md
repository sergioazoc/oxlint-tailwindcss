## Qué hace esta regla

Marca cualquier clase cuyo arbitrary value lleve un literal de color hardcodeado — cualquier cosa
que escribirías con un paint chip en la mano: hex (`bg-[#ff5733]`, `text-[#000]`), `rgb()`/`rgba()`,
`hsl()`/`hsla()`, más los espacios de color modernos `oklch()`, `oklab()`, `lab()`, `lch()`,
`hwb()`, y `color()`. La intención es la misma que `no-arbitrary-value` pero acotada exclusivamente
al color, que es donde suele empezar el drift del design system.

El valor se **escanea**, no se matchea desde su primer carácter, y la utility de la que cuelga es
irrelevante. Eso importa más de lo que parece:

- un color en medio de un shorthand cuenta — `shadow-[0_1px_2px_#000]` es un negro hardcodeado;
- también las utilities que ninguna lista de prefijos mantuvo al día — `inset-ring-[#000]`,
  `inset-shadow-[#000]`;
- y también las propiedades arbitrarias, que ningún prefijo podría matchear — `[color:#f00]`,
  `[--brand:#f00]`.

Hay dos exclusiones deliberadas, y son la razón de que esto sea un escáner y no un regex: un `#`
dentro de un **string entre comillas** es texto (`content-['#fff']`), y un `#` dentro de **`url()`**
es una referencia a un nodo SVG (`fill-[url(#gradient)]`) — el `#` no-color más común en una clase
de Tailwind. Los arbitrary no-color como `w-[200px]` o `tracking-[0.5em]` no llevan literal, así que
pasan como antes y puedes activar esta regla incluso donde _sí_ quieres permitir dimensiones
arbitrarias.

Los colores con nombre (`bg-[red]`) no están cubiertos: `currentColor`, `transparent` e `inherit`
hacen de eso un juicio de valor y no un escaneo.

Los valores que referencian una variable CSS se tratan como indirección del design system y pasan:
`bg-[var(--primary)]`, `text-[hsl(var(--fg))]`, `bg-[oklch(var(--bg))]`, incluso
`bg-[var(--primary,#fff)]` (un fallback adentro de `var()` sigue contando como referencia a una
variable). El chequeo de `var()` no es recursivo — `bg-[linear-gradient(hsl(var(--a)),#fff)]` _no_
se marca porque hay al menos un `var()` presente. Es comportamiento documentado y testeado.

DS-independiente — no se carga ningún design system. No hay autofix: elegir el token correcto es una
decisión humana.

## Opciones

### `allow`

`string[]`, default `[]`.

Strings exactos de clases para whitelistear. Los matches son literales (no hay prefix match ni
regex), así que puedes permitir escapes puntuales sin abrir más la puerta. Útil para el hex
ocasional mandado por brand en un único componente de assets.

```jsonc
{
  "tailwindcss/no-hardcoded-colors": ["error", {
    "allow": ["bg-[#000]", "text-[#fff]"]
  }]
}
```

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

// El color no tiene que ser todo el valor
<div className="shadow-[0_1px_2px_#000]" />

// Utilities que una lista de prefijos no cubría
<div className="inset-ring-[#000] inset-shadow-[#111]" />

// Propiedades arbitrarias, incluida una custom property
<div className="[color:#f00] [--brand:#f00]" />
```

### ✓ Correcto

```tsx
// Colores nombrados del theme
<div className="bg-blue-500 text-white" />

// Indirección por variable CSS pasa
<div className="bg-[var(--primary)] border-[hsl(var(--border))]" />

// Los arbitrary no-color no son asunto de esta regla
<div className="w-[200px] tracking-[0.5em]" />

// Un `#` dentro de un string entre comillas es texto
<div className="content-['#fff']" />

// Un `#` dentro de url() referencia un nodo SVG
<svg className="fill-[url(#gradient)]" />

// String exacto allowlisteado
<div className="bg-[#000]" /> // con allow: ["bg-[#000]"]
```

## Interacciones con otras reglas

- **`no-arbitrary-value`**: superset. Si activas esa regla, cada color hardcodeado ya está marcado.
  Usa `no-hardcoded-colors` sola cuando quieres el mensaje específico de color y toleras otros
  arbitrary values; usa ambas para un diagnóstico más claro sobre el drift de color.
- **`prefer-theme-tokens`**: complementaria. `prefer-theme-tokens` le pregunta al design system si
  existe un color `@theme` que matchee y lo sugiere; esta regla dispara igual exista o no el token,
  así que atrapa el drift más temprano (antes de definir el token).
- **`no-unknown-classes`**: ortogonal. Los arbitrary hardcodeados son sintaxis _válida_ de Tailwind,
  así que `no-unknown-classes` no los va a marcar. Deberían estar ambas activas.

## Cuándo desactivarla

- **Páginas de marketing/brand** con hex pinzados a mano que genuinamente no pertenecen al design
  system compartido. Prefiere `allow` con los strings de clase específicos.
- **Contenido generado** (e.g. avatares inline coloreados desde un hash) donde el color se determina
  en runtime y se renderiza como inline style igual — esos no van a aparecer aquí, pero si aparecen,
  desactiva la línea.
- **Librerías de componentes que publican ejemplos** que deliberadamente demuestran uso de colores
  arbitrarios en su doc.
