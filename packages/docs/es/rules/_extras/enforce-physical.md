## Qué hace esta regla

El espejo de `enforce-logical`. Reescribe utilities lógicas
conscientes del writing direction (`ms-4`, `pe-2`, `start-0`,
`rounded-ss-md`, …) a sus equivalentes físicas (`ml-4`, `pr-2`,
`left-0`, `rounded-tl-md`, …). Usala en codebases LTR-only donde las
utilities lógicas agregan carga cognitiva sin payoff — `ml-4` es más
directo que `ms-4` cuando no hay historia de RTL. Autofix sobre el
primer ofensor por location, sugerencia de editor sobre los
siguientes.

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`.
Comparte la tabla estática de mapeo con `enforce-logical` y la
invierte.

`enforce-physical` y `enforce-logical` son reglas hermanas. Activá
**solo una a la vez** — correr las dos produce un loop de autofix.

## Opciones

### `direction`

`'inline' | 'block' | 'both'`, default `'both'`.

Restringe la conversión a un eje. Hoy todos los mapeos son del eje
inline, así que `'block'` desactiva la regla efectivamente.
Future-proofing para cuando Tailwind incluya utilities lógicas del
eje block.

```jsonc
{ "tailwindcss/enforce-physical": ["error", { "direction": "inline" }] }
```

### `allowlist`

`string[]`, default `[]`.

Patrones regex (compilados lazy, los inválidos se saltean en
silencio). Las clases cuyo string completo matchee algún patrón
bypassean el rewrite. Útil cuando una utility lógica específica es
intencional incluso en un codebase mayormente-LTR (e.g. un
componente que sí tiene que soportar RTL).

```jsonc
{ "tailwindcss/enforce-physical": ["error", { "allowlist": ["^ms-", "^pe-"] }] }
```

## Ejemplos

### ✗ Incorrecto

```tsx
// Márgenes/padding lógicos en un proyecto LTR-only
<div className="ms-4 pe-2" />
//              ~~~~ ~~~~  → ml-4 pr-2

// Posicionamiento lógico
<div className="start-0 end-0" />
//              ~~~~~~~ ~~~~~  → left-0 right-0

// Borders y radii lógicos
<div className="border-s rounded-ss-md" />
//              ~~~~~~~~ ~~~~~~~~~~~~~  → border-l rounded-tl-md
```

### ✓ Correcto

```tsx
// Equivalentes físicos
<div className="ml-4 pr-2" />
<div className="left-0 right-0" />
<div className="border-l rounded-tl-md" />

// Ya físico — variants e important hacen round-trip limpio
<div className="hover:ml-4 pl-(--gutter) mr-4!" />
```

## Interacciones con otras reglas

- **`enforce-logical`**: la inversa. Elegí **una**. Correr las dos
  simultáneamente reescribe en loop.
- **`enforce-canonical`**: ortogonal. Canonical normaliza la forma de
  la utility; esta regla swappea lógico por físico en un eje.
- **`enforce-shorthand`**: corre sobre shorthands `m-*` / `p-*`
  direction-neutral, así que no se solapan.

## Cuándo desactivarla

- **La app soporta RTL** (árabe, hebreo, farsi, …): usá
  `enforce-logical` en su lugar, si no el autofix de la regla rompe
  los layouts en RTL.
- **No tenés preferencia fuerte**: dejar las dos desactivadas está
  bien. Las dos reglas existen para expresar convenciones de team,
  no para enforzar correctness.
