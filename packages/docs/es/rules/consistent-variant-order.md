---
title: "consistent-variant-order — regla de lint para Tailwind CSS"
description: "Regla de oxlint que escribe las cadenas de variantes de Tailwind CSS de afuera hacia adentro — dark:hover:, no hover:dark: — y reescribe el resto, con autofix."
---

# consistent-variant-order

Regla de oxlint que escribe las cadenas de variantes de Tailwind CSS de afuera hacia adentro —
`dark:hover:`, no `hover:dark:` — y reescribe el resto, con autofix.

## De un vistazo

| Autofix | Sugerencias en el editor | Design system                         | Opciones              |
| ------- | ------------------------ | ------------------------------------- | --------------------- |
| Sí      | Sí                       | Opcional — se usa si hay `entryPoint` | `entryPoint`, `order` |

## Qué hace esta regla

Reordena los prefijos de variants dentro de una sola clase para que la cadena se escriba siempre
igual. `hover:dark:bg-red` y `dark:hover:bg-red` producen el mismo CSS en Tailwind v4, pero un orden
inconsistente ensucia grep, code reviews y diffs. Esta regla elige un orden canónico y reescribe
todo para que coincida, con autofix sobre el primer ofensor y sugerencias de editor sobre el resto.

El orden va de afuera hacia adentro, como escriben las cadenas las docs de Tailwind y shadcn/ui:

1. **Dónde está la página**: breakpoints (`sm` … `2xl`, `min-*`, `max-*`), `supports-*`, `motion-*`,
   `contrast-*`, `forced-colors`, `pointer-*`, `portrait` / `landscape`, `dark`, container queries
   (`@md`, `@min-*`), `print`, `starting`, `ltr` / `rtl`.
2. **En qué ancestro o hermano está el elemento**: `group-*`, `peer-*`, `in-*`.
3. **Qué es el elemento**: `aria-*`, `data-*`, `has-*`, `not-*`.
4. **Cómo se está usando**: `visited`, `target`, `hover`, `focus`, `focus-within`, `focus-visible`,
   `active`.
5. **Su estado de formulario**: `enabled`, `disabled`, `checked`, … `read-only`, `open`, `inert`.
6. **Dónde está entre sus hermanos**: `first`, `last`, `only`, `odd`, `even`, `*-of-type`, `nth-*`,
   `empty`.

Los breakpoints entre sí, las container queries entre sí y las variants dentro del paso 2 o dentro
del paso 3 conservan el orden en que las escribiste, así que `data-[a]:data-[b]:` y
`data-[b]:data-[a]:` quedan como están. `not-X` se ordena como X (`not-sm:hover:`). Una variant para
la que la regla no tiene lugar — una que define tu proyecto con `@custom-variant` — nunca se mueve,
y nada se mueve a través de ella.

Los pseudo-elements (`before`, `after`, `file`, `placeholder`, `selection`, `marker`, `backdrop`,
`first-line`, `first-letter`, `details-content`) quedan siempre pinneados innermost — lo más cerca
posible de la utility — porque en Tailwind v4 un pseudo-element puesto antes de una variant que
selecciona elemento produce CSS roto del estilo `&::before { &>svg { … } }`. Las variants que
apuntan el selector a otro elemento (`*`, `**`, `[&>svg]`) son barreras: nada se reordena a través
de ellas, porque `hover:[&>svg]:` (`&:hover > svg`) y `[&>svg]:hover:` (`& > svg:hover`) estilan
elementos distintos.

DS-opcional — el orden es el mismo con o sin `settings.tailwindcss.entryPoint`. Lo que aporta el
design system es qué son las variants propias de tu proyecto, a partir de los selectores que genera:
`@custom-variant thumb (&::-webkit-slider-thumb)` queda pinneada innermost como `before:`,
`@custom-variant child (& > *)` se vuelve una barrera, y un breakpoint que agregas con
`--breakpoint-3xl` se ordena con los demás. Sin él, la regla usa las listas fijas de arriba, y un
entry point faltante se tolera silenciosamente (`no-contradicting-variants` es la otra regla que
hace esto).

## Opciones

### `order`

`string[]`, opcional.

Lista de prioridad personalizada, que reemplaza el orden built-in. Los variants aparecen en el orden
que listas; lo que no listas ordena después, en su posición original. Úsalo cuando tu team tiene un
house style distinto al default (por ejemplo, quieres los estados antes que los breakpoints). El pin
de pseudo-elements y las barreras siguen aplicando sin importar tu lista.

```jsonc
{
  "tailwindcss/consistent-variant-order": ["error", { "order": ["hover", "focus", "sm", "md"] }]
}
```

### `entryPoint`

`string`, opcional.

Override por regla de `settings.tailwindcss.entryPoint`. Misma semántica que el setting a nivel
proyecto; casi nunca se necesita.

## Ejemplos

### ✗ Incorrecto

```tsx
// estado antes que breakpoint
<div className="hover:sm:flex" />
// → <div className="sm:hover:flex" />

// estado antes que color scheme
<div className="hover:dark:text-white" />
// → <div className="dark:hover:text-white" />

// cómo se usa antes que qué es
<div className="focus:data-[state=open]:bg-accent" />
// → <div className="data-[state=open]:focus:bg-accent" />

// pseudo-element antes que variant de elemento — roto en Tailwind v4
<div className="before:[&>svg]:text-red-500" />
// → <div className="[&>svg]:before:text-red-500" />
```

### ✓ Correcto

```tsx
<div className="sm:hover:flex" />
<div className="dark:hover:text-white" />
<div className="md:peer-data-[variant=inset]:m-2" />
<div className="data-[state=open]:focus:bg-accent" />

// Pseudo-element innermost
<div className="[&>svg]:before:text-red-500" />
<div className="dark:has-[.active]:before:text-red-500" />

// Barreras: los dos órdenes apuntan a elementos distintos, así que los dos quedan
<div className="hover:[&>svg]:w-4" />
<div className="[&>svg]:hover:w-4" />
```

## Interacciones con otras reglas

- **`enforce-sort-order`**: complementaria. `enforce-sort-order` ordena clases enteras entre sí;
  `consistent-variant-order` ordena los prefijos dentro de una clase. Ejecuta las dos.
- **`sortTailwindcss` de oxfmt**: ordena clases enteras y deja la cadena de variants de cada clase
  tal como está escrita, así que no reemplaza esta regla.
- **`enforce-canonical`**: ortogonal. Canonical normaliza la forma de la utility (`m-0`,
  `bg-red-500/50`), no la cadena de variants.
- **`no-unknown-classes`**: cuando se reordena una variant la clase resultante sigue siendo
  semánticamente equivalente, así que la detección de clases unknown no ve diferencia.

## Cuándo desactivarla

- **Orden personalizado de variants que es difícil de expresar como una lista plana** (por ejemplo,
  el orden depende de la utility): desactívala y confía en el review.
- **Código generado** donde el orden de variants codifica un significado que no quieres que se
  reescriba.
