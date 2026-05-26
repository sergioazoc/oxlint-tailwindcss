# no-contradicting-variants

> Disallow variant-prefixed classes that are redundant because the base class already applies unconditionally

## Qué hace esta regla

Marca clases con variant que son redundantes porque la misma utility
ya está aplicada sin condiciones en el mismo elemento. El caso
canónico es `flex hover:flex`: `flex` siempre aplica, así que el
prefijo `hover:` no aporta nada — bajo hover ya estaba, y fuera de
hover la base igual gana. La variante es ruido puro (y suele ser un
indicio de que alguien quiso escribir otra utility, como
`hover:inline-flex`).

La regla NO reporta cuando la variante apunta a un elemento distinto
del de la base. Pseudo-elementos (`after`, `before`, `placeholder`,
`marker`, `backdrop`, `selection`, `first-line`, `first-letter`,
`file`), selectores de hijos (`*:`, `**:`) y selectores arbitrarios
(`[&>svg]`, `[&_div]`) cambian el target del selector, así que
`absolute after:absolute` o `shrink-0 [&>svg]:shrink-0` están bien —
la base aplica al elemento y la variante a un descendiente o
pseudo-elemento.

El match es por identidad exacta de la utility, así que
`bg-white hover:bg-blue-500` queda intacto (valores distintos), igual
que `flex hover:items-center` (utilities distintas).

## Opciones

(sin opciones)

## Ejemplos

### ✗ Incorrecto

```tsx
// `flex` ya aplica — `dark:flex` es peso muerto
<div className="flex dark:flex" />

// Mismo patrón con `hover`
<div className="hidden hover:hidden" />

// Múltiples variantes redundantes sobre la misma base
<div className="flex hover:flex dark:flex" />
```

### ✓ Correcto

```tsx
// Valores distintos bajo variantes distintas
<div className="bg-white hover:bg-blue-500" />

// Utilities distintas — sin redundancia
<div className="text-white dark:text-black" />

// Sólo clases con variant, sin base — nada es redundante
<div className="hover:flex dark:flex" />

// El pseudo-elemento apunta a otro elemento que la base
<div className="absolute after:absolute" />
<div className="shrink-0 [&>svg]:shrink-0" />
<div className="flex *:data-[slot=select-value]:flex" />
```

## Interacciones con otras reglas

- **`no-duplicate-classes`**: complementaria. Los duplicados son la
  misma string repetida (`hover:flex hover:flex`); esta regla
  atrapa el caso más sutil donde la base subsume a la variante sin
  condiciones.
- **`no-conflicting-classes`**: una utility base que sombrea a una
  variante no es un conflicto a nivel de propiedad CSS (ambas
  resuelven al mismo valor), así que `no-conflicting-classes` no la
  marca. Ese es el hueco que cubre esta regla.
- **`no-dark-without-light`**: forma inversa. Esta regla marca
  `base + variant:misma-utility`; esa marca `dark:foo` sin ninguna
  contraparte en light.

## Cuándo desactivarla

- **Generadores de código / class-name builders** que a propósito
  emiten una base y una variante con la misma utility (raro, pero
  pasa cuando un framework mergea listas de clases de distintas
  fuentes y prefiere no deduplicar).
- **Snapshots / fixtures** que necesitan el par redundante para
  ejercitar tooling downstream.

