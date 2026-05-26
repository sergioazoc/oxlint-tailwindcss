# enforce-canonical

> Enforce canonical Tailwind CSS class names using canonicalizeCandidates()

## Qué hace esta regla

Le pregunta al design system cuál es la forma canónica de cada
utility en tu código y reescribe las que no lo son. "Canónico" es lo
que devuelve `canonicalizeCandidates()` de `@tailwindcss/node` — la
misma fuente de verdad que usan prettier-plugin-tailwindcss, oxfmt y
las herramientas oficiales de Tailwind. Ejemplos: `-m-0` → `m-0` (no
necesitas el negativo para un cero), `bg-gradient-to-r` →
`bg-linear-to-r`, `break-words` → `wrap-break-word`, `start-2` →
`inset-s-2`, `flex-grow-1` → `grow`, `p-[2px]` → `p-0.5` (valor
arbitrario normalizado a un token con nombre vía tu escala
`--spacing`), `text-[var(--color-text)]/90` →
`text-(--color-text)/90`. El auto-fix corrige el primer hit, las
sugerencias cubren el resto en el mismo string.

Las clases con nombre resuelven contra un `canonicalMap` precomputado
en memoria (sub-microsegundo). Los valores arbitrarios (`p-[2px]`,
`bg-(--c)`) pasan por el worker `canonicalize-service` porque
necesitan una consulta viva al DS; los resultados se cachean a nivel
proceso por `(entryPoint, rem, class)`. El worker preserva la
posición del `!` (prefix vs suffix vs ninguno).

DS-dependiente — requiere `settings.tailwindcss.entryPoint`. Si el
design system no puede cargar, la regla emite un único diagnóstico
fatal `designSystemUnavailable` por archivo en vez de pasar en
silencio.

## Opciones

Esta regla no tiene opciones propias más allá del override estándar
`entryPoint` (string, defaultea a `settings.tailwindcss.entryPoint`).
Configura el entry point en `settings.tailwindcss.entryPoint` para
todo el proyecto en vez de por-regla cuando puedas.

## Ejemplos

### ✗ Incorrecto

```tsx
// El negativo-de-cero es simplemente cero
<div className="-m-0 -mt-0" />

// Spellings v3 que el canonicalize oficial reescribe
<div className="bg-gradient-to-r break-words" />

// Shorthand de inset lógico → canónico inset-s-* / inset-e-*
<div className="start-2 end-4" />

// Valores arbitrarios que matchean un token nombrado vía tu escala
<div className="p-[2px] max-w-[400px]" />

// Variants e important se preservan
<div className="hover:!break-words" />
```

### ✓ Correcto

```tsx
<div className="m-0 mt-0" />

<div className="bg-linear-to-r wrap-break-word" />

<div className="inset-s-2 inset-e-4" />

<div className="p-0.5 max-w-100" />

<div className="hover:!wrap-break-word" />
```

## Interacciones con otras reglas

- **`no-unnecessary-arbitrary-value`**: complementaria, no hay
  doble-fire. Esta regla reescribe valores arbitrarios a utilities
  con nombre solamente cuando la resolución canónica produce un CSS
  distinto (e.g. `p-[2px]` → `p-0.5` vía escala de spacing).
  `no-unnecessary-arbitrary-value` cubre los casos donde el arbitrario
  mapea directo a una utility con nombre produciendo el mismo CSS
  (e.g. `h-[auto]` → `h-auto`).
- **`prefer-theme-tokens`**: el tercer partner del trío
  arbitrario→nombrado. Atrapa referencias a variables CSS como
  `border-(--border)` → `border-border` donde ni `enforce-canonical`
  (el CSS difiere) ni `no-unnecessary-arbitrary-value` (no hay
  equivalente bracket compartido) se dispararían.
- **`no-deprecated-classes`**: un subconjunto estricto de lo que hace
  `enforce-canonical`. Correr ambas es seguro; los autofixes
  coinciden. Mantén `no-deprecated-classes` si quieres un pase
  rápido, hardcodeado y sin DS.
- **`enforce-consistent-important-position`**: esta regla preserva la
  posición del `!` que escribiste (prefix vs suffix vs ninguno).
  `enforce-consistent-important-position` es la única fuente de
  verdad para imponer una posición en particular.

## Cuándo desactivarla

- **No quieres ninguna reescritura de clases** — por ejemplo, en un
  archivo legacy que estás manteniendo literal para diffear.
- **Lint runs sensibles a la performance** donde el costo de
  inicializar el worker molesta. El cache hace que las corridas
  siguientes sean baratas, pero el primer hit paga el startup de
  `@tailwindcss/node`. La mayoría de proyectos no lo van a notar.
- **No migraste a Tailwind v4 todavía**: las formas canónicas
  producidas acá asumen semántica v4.

