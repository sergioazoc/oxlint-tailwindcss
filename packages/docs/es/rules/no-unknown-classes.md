# no-unknown-classes

> Disallow classes that are not defined in the Tailwind CSS design system

## Qué hace esta regla

Recorre cada clase de Tailwind extraída de tu código y le pregunta al
design system — construido a partir del CSS que apuntas con
`entryPoint` — si esa clase existe. Si no existe, la regla la
reporta. Cuando la clase parece un typo de una conocida (distancia
Levenshtein ≤ 2), el diagnóstico incluye una sugerencia y un quick-fix
de editor para reemplazarla.

El design system acá significa **todo lo que Tailwind generaría para
tu stylesheet**: las utilities core (`flex`, `bg-red-500`,
`hover:underline`), cualquier token `@theme` que definiste
(`bg-card`, `text-brand-foreground`), cualquier clase registrada por
plugins (`prose`, `animate-in`, etc.), y cualquier CSS custom que
escribiste inline.

DS-dependiente — requiere `settings.tailwindcss.entryPoint`. Cuando el
design system no puede cargar, la regla emite un único diagnóstico
fatal `designSystemUnavailable` por archivo en vez de pasar en
silencio.

## Opciones

### `allowlist`

`string[]`, default `[]`.

Nombres exactos de clases para whitelistear. Usa esto cuando la clase
se genera en runtime (template strings que el plugin no puede
resolver estáticamente) o cuando deliberadamente no es parte de tu
design system pero quieres que sobreviva al linting. Los matches son
literales — `"my-special"` no matchea `"hover:my-special"`.

```jsonc
{ "tailwindcss/no-unknown-classes": ["error", { "allowlist": ["my-runtime-class", "legacy-button"] }] }
```

### `ignorePrefixes`

`string[]`, default `[]`.

Omite cualquier clase cuyo nombre empiece con alguno de estos
prefijos. Usa esto para familias enteras de clases que manejas fuera
del design system a propósito — e.g. un namespace compilado de CSS
modules (`s-`), un UI kit de terceros (`ant-`, `chakra-`), o clases
inyectadas por un framework (`vue-enter`).

```jsonc
{ "tailwindcss/no-unknown-classes": ["error", { "ignorePrefixes": ["ant-", "swiper-"] }] }
```

Prefiere `ignorePrefixes` sobre `allowlist` cuando hay muchas clases
con el mismo stem — más fácil de mantener.

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
```

### ✓ Correcto

```tsx
// Utility core
<div className="flex items-center" />

// Token de theme (funciona luego de declararlo en @theme en tu CSS entryPoint)
<div className="bg-card text-card-foreground" />

// Clase registrada por un plugin
<article className="prose prose-invert" />

// Clase de runtime allowlisteada
<div className={"hover:" + dynamicSuffix} />
```

## Interacciones con otras reglas

- **`no-deprecated-classes`**: esta regla omite silenciosamente las
  clases marcadas por `no-deprecated-classes` (`flex-grow`,
  `space-y-reverse`, etc.) para que no veas dos diagnósticos por la
  misma clase. Mantén ambas activas.
- **`enforce-canonical`**: complementa a esta. `no-unknown-classes`
  atrapa typos y tokens faltantes; `enforce-canonical` reescribe
  formas válidas-pero-desactualizadas (`-m-0` → `m-0`).
- **`no-restricted-classes`**: ortogonal. Esa la usas para bloquear
  clases válidas que no quieres; esta para atrapar clases inválidas.

## Cuándo desactivarla

- **Uso intensivo de generación dinámica de clases** que el extractor
  no puede resolver (e.g. clases armadas desde data de servidor sin
  tipar). La regla reporta como unknown todo lo que no reconoce.
  Prefiere `allowlist` o `ignorePrefixes` antes que desactivarla.
- **Migrando un codebase existente**: déjala como `warn` hasta
  terminar el cleanup, después súbela a `error`.
- **Dentro de CSS-in-JS donde los strings no son Tailwind**: esto se
  resuelve mejor ajustando tu config de extractors (sacando el callee
  o attribute en conflicto vía `settings.tailwindcss.exclude`) antes
  que desactivar la regla.

