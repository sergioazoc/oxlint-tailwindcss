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

Los porcentajes funcionan igual, y eran el caso más ruidoso: Tailwind enumera 21 de los 101 valores
que compila (`from-0%`, `from-5%`, …), así que `from-33%`, `via-51%`, `mask-b-from-70%` y
`font-stretch-57%` se reportaban como erratas — y el quick-fix ofrecía `from-35%`, que mueve la
parada del degradado y deja el lint en verde. Ahora se aceptan, en los mismos 22 prefijos a los que
Tailwind les admite un porcentaje; `p-4%` y `ms-33%` se siguen reportando, porque ahí no compila
ninguno.

### Las utilidades propias con tipo de valor abierto

`@utility` cubre tres tipos de espacio de valores, y solo dos se pueden enumerar:

```css
@utility brand-* {
  --brand: --value(--brand-*);
} /* acotado por el tema  → enumerable */
@utility align-* {
  --align: --value("a", "b");
} /* conjunto literal     → enumerable */
@utility step-* {
  --step: --value(integer);
} /* ABIERTO              → no enumerable */
```

Para el abierto, la lista de clases de Tailwind no devuelve nada — ni `step-1`, ni siquiera la raíz
`step` — porque no hay conjunto finito que devolver. Por eso la regla leía `step-1` como una errata.
Ahora se lo pregunta al design system, que compila la clase y lo dice, y esa misma respuesta sigue
rechazando lo que el tipo de valor rechaza: con `--value(integer)`, `step-abc`, `step-1.5` y
`step-[3]` se siguen reportando.

Una consecuencia que conviene conocer: para esta familia no hay sugerencia ortográfica. La
sugerencia sale de la lista de clases enumeradas y, por definición, tu utilidad abierta no está ahí
— así que una errata real en la raíz (`stepp-1`) se reporta como desconocida a secas.

### Los marcadores group/peer con nombre son válidos

`group/menu-item` y `peer/menu-button` son el idioma de v4 para atar una variante a **un** ancestro
o hermano concreto cuando hay varios en juego — el patrón sobre el que está construido el sidebar de
shadcn/ui. El marcador no emite CSS propio, y eso es justamente el punto: el CSS vive en el
consumidor que lo lee. `group-hover/menu-item:underline` compila a

```css
.group-hover\/menu-item\:underline:is(:where(.group\/menu-item):hover *) { text-decoration-line: underline; }
```

Un selector de clase CSS casa tokens completos del atributo `class`, así que `group` a secas **no**
satisface `:where(.group\/menu-item)`. El marcador es markup obligatorio: si lo quitas, todos sus
consumidores dejan de casar en silencio.

El nombre es tuyo y Tailwind nunca comprueba que exista, así que se acepta cualquier nombre no
vacío, incluidas formas que solo un modificador arbitrario en el consumidor puede alcanzar
(`group/*`, `group/a/b`, `peer//x`). La única grafía realmente muerta es el nombre **vacío**:
`peer/` no compila nada y se reporta.

Una clase nombrada por el selector de un `@custom-variant` funciona igual y sigue siendo válida:
`@custom-variant sidebar-open (&:where(.sidebar-open *))` hace que `sidebar-open` sea load-bearing
aunque nada la declare.

## Prefijo de proyecto (`prefix(...)`)

Si tu entry point declara un prefijo de Tailwind v4 — `@import "tailwindcss" prefix(tw)` — cada
utility debe escribirse con ese prefijo (`tw:flex`, `tw:hover:underline`). La regla es consciente
del prefijo:

- Una utility correctamente prefijada (`tw:flex`) es válida.
- Una utility de Tailwind escrita **sin** el prefijo (`flex`) no produce CSS, así que se reporta
  como que le falta el prefijo, con un quick-fix que lo agrega (`flex` → `tw:flex`).
- Las component classes de `@layer components` (`btn`, `card`) no llevan prefijo y siguen siendo
  válidas en cualquier caso — solo las utilities generadas por Tailwind lo requieren.
- Los marcadores con nombre también necesitan el prefijo, porque es lo que Tailwind pone en el
  selector: `tw:group-hover/menu-item:underline` compila a
  `:is(:where(.tw\:group\/menu-item):hover *)`, así que `tw:group/menu-item` es válida y un
  `group/menu-item` sin prefijo se reporta como que le falta.
- Tu propia `@utility` sigue la misma regla, incluida la de valor abierto de más arriba: al design
  system se le pregunta por la forma prefijada, así que `tw:step-1` es válida y un `step-1` pelado
  recibe el quick-fix.
- El prefijo solo se ofrece como arreglo cuando la forma prefijada compila de verdad. `bg-red-5000`
  tiene forma de utility, pero `tw:bg-red-5000` está tan muerta como la versión sin prefijo, así que
  esa se reporta como desconocida con una sugerencia ortográfica.

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
<div className="w-45 gap-13 min-h-17.5 from-33%" />

// Tu propia utility, sea cual sea su tipo de valor
// @utility step-* { --step: --value(integer) }
<div className="step-1 step-42" />

// Todas las formas de variant, funcionales y arbitrarias
<div className="group-hover:flex data-[state=open]:grid @md:block [&>svg]:size-4" />

// Marcadores group/peer con nombre, y los consumidores que los leen
<div className="group/menu-item peer/menu-button" />
<div className="group-hover/menu-item:underline peer-data-[size=sm]/menu-button:top-1" />

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
