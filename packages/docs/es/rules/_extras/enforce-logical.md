## Qué hace esta regla

Reescribe utilities de dirección física de Tailwind (`ml-4`, `pr-2`,
`left-0`, `rounded-tl-md`, …) a sus equivalentes lógicos, conscientes
del writing direction (`ms-4`, `pe-2`, `start-0`, `rounded-ss-md`,
…). Las utilities lógicas resuelven a `margin-inline-start` /
`padding-inline-end` / … en CSS, lo que significa que se flipean
automáticamente en contextos RTL sin código extra. Necesaria si tu
app se distribuye en árabe, hebreo, farsi, o cualquier otro idioma
RTL. Autofix sobre el primer ofensor por location, sugerencia de
editor sobre los siguientes.

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`. La
tabla de mapeo es estática y vive en el código de la regla; no se
necesita lookup en el design system.

`enforce-logical` y `enforce-physical` son reglas hermanas —
comparten una tabla de mapeo que una invierte. Activa **solo una a
la vez**.

## Opciones

### `direction`

`'inline' | 'block' | 'both'`, default `'both'`.

Restringe la conversión a un eje. Hoy todos los mapeos de la tabla
son del eje inline (left/right pasan a start/end), así que `'block'`
desactiva la regla efectivamente y `'inline'` / `'both'` se comportan
idéntico. La opción queda lista para cuando Tailwind incluya
utilities lógicas del eje block.

```jsonc
{ "tailwindcss/enforce-logical": ["error", { "direction": "inline" }] }
```

### `allowlist`

`string[]`, default `[]`.

Patrones regex (compilados lazy, los inválidos se saltean en
silencio). Las clases cuyo string completo matchee algún patrón
bypassean el rewrite. Úsalo para casos puntuales donde genuinamente
quieres dirección física — e.g. un ícono que siempre tiene que estar
a la izquierda visual sin importar el writing direction.

```jsonc
{ "tailwindcss/enforce-logical": ["error", { "allowlist": ["^ml-icon$", "^rounded-tl-special$"] }] }
```

## Ejemplos

### ✗ Incorrecto

```tsx
// Márgenes/padding físicos
<div className="ml-4 pr-2" />
//              ~~~~ ~~~~  → ms-4 pe-2

// Posicionamiento
<div className="left-0 right-0" />
//              ~~~~~~ ~~~~~~~  → start-0 end-0

// Borders y radii
<div className="border-l rounded-tl-md" />
//              ~~~~~~~~ ~~~~~~~~~~~~~  → border-s rounded-ss-md
```

### ✓ Correcto

```tsx
// Equivalentes lógicos
<div className="ms-4 pe-2" />
<div className="start-0 end-0" />
<div className="border-s rounded-ss-md" />

// Ya lógico — variants e important hacen round-trip limpio
<div className="hover:ms-4 ps-(--gutter) me-4!" />
```

## Interacciones con otras reglas

- **`enforce-physical`**: la inversa. Comparten la tabla de mapeo;
  activar las dos al mismo tiempo va a autofixear en loop. Elige una
  según si tu app soporta RTL (usa `enforce-logical`) o es LTR-only
  (usa `enforce-physical`).
- **`enforce-canonical`**: ortogonal. Canonical normaliza la forma de
  la utility; esta regla swappea físico por lógico en un eje.
- **`enforce-shorthand`**: corre sobre shorthands `m-*` / `p-*` que
  ya son direction-neutral, así que las dos no se solapan.

## Cuándo desactivarla

- **Aplicaciones LTR-only** donde estás seguro de que nunca vas a
  necesitar RTL. Usa `enforce-physical` en su lugar si quieres
  consistencia en la otra dirección.
- **Layouts pixel-perfect donde la dirección física es parte del
  diseño** (raro, pero pasa con íconos o decoración). Tira del
  `allowlist` antes que desactivar globalmente.
