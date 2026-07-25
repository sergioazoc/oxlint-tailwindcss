# no-unknown-classes

> Disallow classes that are not defined in the Tailwind CSS design system

## Qué hace esta regla

Recorre cada clase de Tailwind extraída de tu código y le pregunta al design system — construido a
partir del CSS que apuntas con `entryPoint` — si esa clase existe. Si no existe, la regla la
reporta. Cuando la clase parece un typo de una conocida (distancia Levenshtein ≤ 2), el diagnóstico
incluye una sugerencia y un quick-fix de editor para reemplazarla.

El design system aquí significa **todo lo que Tailwind generaría para tu stylesheet**: las utilities
core (`flex`, `bg-red-500`, `hover:underline`), cualquier token `@theme` que definiste (`bg-card`,
`text-brand-foreground`), cualquier clase registrada por plugins (`prose`, `animate-in`, etc.), y
cualquier CSS custom que escribiste inline.

DS-dependiente — requiere `settings.tailwindcss.entryPoint`. Cuando el design system no puede
cargar, la regla emite un único diagnóstico fatal `designSystemUnavailable` por archivo en vez de
pasar en silencio.

### La cadena de variants también se valida

Un typo en un variant no produce CSS ninguno, y antes pasaba en silencio: la validación descartaba
los variants antes de mirar nada. `hoverr:flex`, `darkk:size-4`, `peer-cheked:flex` y `@mdd:flex`
ahora se reportan, con una sugerencia **confirmada contra el design system antes de ofrecerla** —
así `group-hoverr` se corrige a `group-hover` (raíz intacta, cola arreglada) y un variant que define
tu propio CSS (`@custom-variant thumb (&::-webkit-slider-thumb)`) se revisa igual que uno nativo.

Esto no se puede hacer con una lista de nombres: los variants funcionales de Tailwind (`group-*`,
`data-*`, `@md`, `supports-[…]`, `min-[…]`, `nth-*`, `has-[…]`, `not-*`, `in-[…]`) tienen un espacio
de valores ilimitado, así que una lista reportaría como desconocidos a la mayoría de los variants
reales. En vez de eso se compila la cadena misma, una vez por cadena distinta del proyecto.

### Los valores fuera de escala se comprueban con Tailwind, no se adivinan

Tailwind acepta números fuera de la escala del tema (`w-45`, `gap-13`, `min-h-17.5`), así que la
regla aceptaba cualquier cosa con esa forma — lo que significaba que `bg-red-5000`, `bg-red-500/foo`
y `w-[]` pasaban exactamente por la misma razón por la que `w-45` pasa legítimamente. Las clases que
el precompute no puede enumerar ahora se resuelven contra el design system, por lotes y memoizadas,
así que la respuesta es la de Tailwind y no una conjetura.

`w-[garbage]` sigue siendo válida a propósito: Tailwind toma un valor arbitrario tal cual y emite
`width: garbage`. Si ese CSS tiene sentido o no, no es asunto de esta regla.

## Prefijo de proyecto (`prefix(...)`)

Si tu entry point declara un prefijo de Tailwind v4 — `@import "tailwindcss" prefix(tw)` — cada
utility debe escribirse con ese prefijo (`tw:flex`, `tw:hover:underline`). La regla es consciente
del prefijo:

- Una utility correctamente prefijada (`tw:flex`) es válida.
- Una utility de Tailwind escrita **sin** el prefijo (`flex`) no produce CSS, así que se reporta
  como que le falta el prefijo, con un quick-fix que lo agrega (`flex` → `tw:flex`).
- Las component classes de `@layer components` (`btn`, `card`) no llevan prefijo y siguen siendo
  válidas en cualquier caso — solo las utilities generadas por Tailwind lo requieren.

El prefijo se detecta automáticamente desde tu `entryPoint`; no hay nada extra que configurar.

## Opciones

### `allowlist`

`string[]`, default `[]`.

Nombres exactos de clases para whitelistear. Usa esto cuando la clase se genera en runtime (template
strings que el plugin no puede resolver estáticamente) o cuando deliberadamente no es parte de tu
design system pero quieres que sobreviva al linting. Los matches son literales — `"my-special"` no
matchea `"hover:my-special"`.

```jsonc
{ "tailwindcss/no-unknown-classes": ["error", { "allowlist": ["my-runtime-class", "legacy-button"] }] }
```

### `ignorePrefixes`

`string[]`, default `[]`.

Omite cualquier clase cuyo nombre empiece con alguno de estos prefijos. Usa esto para familias
enteras de clases que manejas fuera del design system a propósito — e.g. un namespace compilado de
CSS modules (`s-`), un UI kit de terceros (`ant-`, `chakra-`), o clases inyectadas por un framework
(`vue-enter`).

```jsonc
{ "tailwindcss/no-unknown-classes": ["error", { "ignorePrefixes": ["ant-", "swiper-"] }] }
```

Prefiere `ignorePrefixes` sobre `allowlist` cuando hay muchas clases con el mismo stem — más fácil
de mantener.

## Ejemplos

### ✗ Incorrecto

```tsx
// Typo
<div className="flx items-cetner" />
//             ~~~  ~~~~~~~~~~~~~ ambas reportadas con sugerencias:
//             flx → flex
//             items-cetner → items-center

// La clase no existe (no hay plugin / no hay token @theme)
<div className="text-brrrand" />

// Variant sobre una clase inexistente
<div className="hover:foo-500" />

// Typo en el VARIANT — la utility está bien, la clase no emite nada
<div className="hoverr:flex peer-cheked:underline" />
//              ~~~~~~      ~~~~~~~~~~~ → hover: / peer-checked:

// Tienen forma de valor fuera de escala, pero Tailwind no compila ninguna
<div className="bg-red-5000 bg-blue-500/foo" />
```

### ✓ Correcto

```tsx
// Utility core
<div className="flex items-center" />

// Token de theme (funciona luego de declararlo en @theme en tu CSS entryPoint)
<div className="bg-card text-card-foreground" />

// Clase registrada por un plugin
<article className="prose prose-invert" />

// Valores fuera de escala que Tailwind sí compila
<div className="w-45 gap-13 min-h-17.5" />

// Todas las formas de variant, funcionales y arbitrarias
<div className="group-hover:flex data-[state=open]:grid @md:block [&>svg]:size-4" />

// Clase de runtime allowlisteada
<div className={"hover:" + dynamicSuffix} />
```

## Interacciones con otras reglas

- **`no-deprecated-classes`**: esta regla omite silenciosamente los renombres de v3 que esa posee
  (`flex-grow`, `bg-gradient-to-r`, `break-words`, …) para que no veas dos diagnósticos por la misma
  clase. La lista sale del design system, no de una copia dentro de esta regla, así que las dos no
  pueden desincronizarse. Mantén ambas activas.
- **`enforce-canonical`**: complementa a esta. `no-unknown-classes` atrapa typos y tokens faltantes;
  `enforce-canonical` reescribe formas válidas-pero-desactualizadas (`-m-0` → `m-0`).
- **`no-restricted-classes`**: ortogonal. Esa la usas para bloquear clases válidas que no quieres;
  esta para atrapar clases inválidas.

## Cuándo desactivarla

- **Uso intensivo de generación dinámica de clases** que el extractor no puede resolver (e.g. clases
  armadas desde data de servidor sin tipar). La regla reporta como unknown todo lo que no reconoce.
  Prefiere `allowlist` o `ignorePrefixes` antes que desactivarla.
- **Migrando un codebase existente**: déjala como `warn` hasta terminar el cleanup, después súbela a
  `error`.
- **Dentro de CSS-in-JS donde los strings no son Tailwind**: esto se resuelve mejor ajustando tu
  config de extractors (sacando el callee o attribute en conflicto vía
  `settings.tailwindcss.exclude`) antes que desactivar la regla.
