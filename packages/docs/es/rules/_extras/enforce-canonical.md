## Qué hace esta regla

Le pregunta al design system cuál es la forma canónica de cada utility en tu código y reescribe las
que no lo son. "Canónico" es lo que devuelve `canonicalizeCandidates()` de `@tailwindcss/node` — la
misma fuente de verdad que usan prettier-plugin-tailwindcss, oxfmt y las herramientas oficiales de
Tailwind. Ejemplos: `-m-0` → `m-0` (no necesitas el negativo para un cero), `bg-gradient-to-r` →
`bg-linear-to-r`, `break-words` → `wrap-break-word`, `start-2` → `inset-s-2`, `flex-grow-1` →
`grow`, `flex-grow-[2]` → `grow-2` (un valor arbitrario cuya forma nombrada emite el mismo CSS),
`text-[var(--color-text)]/90` → `text-(--color-text)/90`. El auto-fix corrige el primer hit, las
sugerencias cubren el resto en el mismo string.

Las clases con nombre resuelven contra un `canonicalMap` precomputado en memoria (sub-microsegundo).
Los valores arbitrarios (`p-[2px]`, `bg-(--c)`) pasan por el worker `canonicalize-service` porque
necesitan una consulta viva al DS; los resultados se cachean a nivel proceso por
`(entryPoint, rem, class)`. El worker preserva la posición del `!` (prefix vs suffix vs ninguno).

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
// El negativo-de-cero es simplemente cero
<div className="-m-0 -mt-0" />

// Spellings v3 que el canonicalize oficial reescribe
<div className="bg-gradient-to-r break-words" />

// Shorthand de inset lógico → canónico inset-s-* / inset-e-*
<div className="start-2 end-4" />

// Un valor arbitrario cuya forma nombrada emite el mismo CSS
<div className="flex-grow-[2]" />

// Variants e important se preservan
<div className="hover:!break-words" />
```

### ✓ Correcto

```tsx
<div className="m-0 mt-0" />

<div className="bg-linear-to-r wrap-break-word" />

<div className="inset-s-2 inset-e-4" />

<div className="grow-2" />

<div className="hover:!wrap-break-word" />
```

## Interacciones con otras reglas

- **`no-unnecessary-arbitrary-value`**: complementaria, no hay doble-fire. Las dos actúan solo
  cuando el valor arbitrario y su reemplazo nombrado emiten CSS **idéntico**; se reparten por forma.
  `no-unnecessary-arbitrary-value` es dueña de los casos donde el arbitrario mapea directo a una
  única utility con nombre (e.g. `h-[auto]` → `h-auto`). Un valor que solo es _numéricamente_ igual
  a un paso de la escala (`p-[2px]` → `p-0.5`, cuyo texto CSS difiere) no es asunto de ninguna de
  las dos — eso es `prefer-scale-token`, solo-reporte.
- **`prefer-theme-tokens`**: el tercer partner del trío arbitrario→nombrado. Atrapa referencias a
  variables CSS como `border-(--border)` → `border-border` donde ni `enforce-canonical` (el CSS
  difiere) ni `no-unnecessary-arbitrary-value` (no hay equivalente bracket compartido) se
  dispararían.
- **`no-deprecated-classes`**: **es la dueña de los renombres de v3, y esta regla los omite.**
  Tailwind también los canonicaliza, así que `bg-gradient-to-r` → `bg-linear-to-r` antes se
  reportaba dos veces con el mismo fix; el mensaje de la otra regla ("deprecada en v4") es el más
  accionable de los dos. Acá queda todo lo que es actual-pero-no-canónico: `-m-0` → `m-0`, `start-2`
  → `inset-s-2`, y las formas con valor arbitrario como `flex-grow-[2]` → `grow-2` (la lista de
  renombres tiene spellings, no valores). Mantén ambas activas — con solo esta los renombres quedan
  sin reportar.
- **`prefer-scale-token`**: la mitad solo-reporte de lo que esta regla cedió en #78. Una reescritura
  cuyo CSS emitido difiere textualmente (`p-[10px]` → `p-2.5`, donde el token llega por
  `var(--spacing)`) no se autofixea aquí y no lo hará nunca; esa regla lo reporta con una
  sugerencia. Las dos no pueden disparar juntas: esta solo reescribe pares byte-idénticos, que es
  exactamente lo que la otra salta.
- **`enforce-consistent-important-position`**: esta regla preserva la posición del `!` que
  escribiste (prefix vs suffix vs ninguno). `enforce-consistent-important-position` es la única
  fuente de verdad para imponer una posición en particular.

## Cuándo desactivarla

- **No quieres ninguna reescritura de clases** — por ejemplo, en un archivo legacy que estás
  manteniendo literal para diffear.
- **Lint runs sensibles a la performance** donde el costo de inicializar el worker molesta. El cache
  hace que las corridas siguientes sean baratas, pero el primer hit paga el startup de
  `@tailwindcss/node`. La mayoría de proyectos no lo van a notar.
- **No migraste a Tailwind v4 todavía**: las formas canónicas producidas aquí asumen semántica v4.
