# no-unnecessary-arbitrary-value

> Disallow arbitrary values when a named Tailwind class produces the same CSS

## Qué hace esta regla

Detecta utilities escritas con un valor arbitrario (`w-[200px]`, `h-[auto]`,
`bg-[var(--color-red-500)]`) cuando el design system ya expone una utility con nombre que produce
exactamente el mismo CSS, y reescribe la forma arbitraria a la nombrada. El lookup pasa por el mapa
precomputado `arbitraryEquivalents` (armado una sola vez por `@theme` — para cada utility con
nombre, el paso de precompute enumera cada punto de corte por guión, así utilities multi-segmento
como `bg-red-500` registran tanto `bg-[<value>]` como `bg-red-[<value>]`). El auto-fix corrige el
primer hit, las sugerencias cubren el resto en el mismo string. Variants e `!` (important) se
preservan.

El chequeo se dispara solo cuando hay un valor arbitrario en la utility (`hasArbitraryValue(cls)` es
true) Y el cache devuelve un match en `getNamedEquivalent`. Eso mantiene la regla barata y enfocada
— sin resolución fuzzy, sin round-trip al DS por cada clase.

DS-dependiente — requiere `settings.tailwindcss.entryPoint`. Si el design system no puede cargar, la
regla emite un único diagnóstico fatal `designSystemUnavailable` por archivo en vez de pasar en
silencio.

## Opciones

Esta regla no tiene opciones propias más allá del override estándar `entryPoint` (string, defaultea
a `settings.tailwindcss.entryPoint`). Configura el entry point en `settings.tailwindcss.entryPoint`
para todo el proyecto en vez de por-regla cuando puedas.

## Ejemplos

### ✗ Incorrecto

```tsx
// `h-[auto]` es simplemente `h-auto`
<div className="h-[auto] w-[auto]" />

// Referencia var() a un color del theme que tiene utility con nombre
<div className="bg-[var(--color-red-500)] text-[var(--color-blue-700)]" />

// El prefijo de variant y el important se preservan
<div className="hover:h-[auto] !w-[auto]" />
```

### ✓ Correcto

```tsx
// Las utilities con nombre producen el mismo CSS
<div className="h-auto w-auto" />

<div className="bg-red-500 text-blue-700" />

<div className="hover:h-auto !w-auto" />

// Valor arbitrario sin equivalente nombrado — déjalo
<div className="w-[200px] bg-[#custom]" />
```

## Interacciones con otras reglas

- **`enforce-canonical`**: complementaria, no hay doble-fire. Las dos actúan solo cuando la forma
  arbitraria y su reemplazo nombrado emiten CSS **idéntico**; se reparten por forma. Esta regla es
  dueña del caso directo arbitrario→nombrado (`h-[auto]` → `h-auto`, `bg-[var(--color-red-500)]` →
  `bg-red-500`); `enforce-canonical` es dueña de los renombres canónicos y la normalización de
  sintaxis de variables CSS. Las dos parten el espacio arbitrario→nombrado de forma limpia.
- **`prefer-scale-token`**: dueña de lo que ninguna de las anteriores toca — un valor que solo es
  _numéricamente_ igual a un paso de la escala o a un token de tema (`p-[2px]` → `p-0.5`), cuyo
  texto CSS difiere (`calc(var(--spacing) * 0.5)` vs `2px`). Solo-reporte, apagada por defecto.
- **`prefer-theme-tokens`**: también complementaria. Se dispara para referencias a variables CSS en
  el shorthand de paréntesis `prefix-(--name)` / `prefix-[var(--name)]` cuando no existe un
  equivalente bracket — ese es el caso solo-heurístico que esta regla rechaza explícitamente (ver el
  guard de `getNamedEquivalent`).
- **`no-deprecated-classes`**: ortogonal. Los nombres deprecados como `flex-grow` no tienen valores
  arbitrarios, así que las dos reglas nunca tocan la misma clase.

## Cuándo desactivarla

- **A propósito mantienes valores arbitrarios por legibilidad** — algunos equipos prefieren
  `w-[200px]` a un alias de token cuando el valor es one-off o pixel-precise. Desactiva la regla y
  apóyate en `prefer-theme-tokens` + `enforce-canonical` para los casos que sí quieres marcar.
- **Migrando desde otro toolchain** que generaba valores arbitrarios para todo — corrila como `warn`
  hasta terminar el cleanup, después súbela a `error`.
