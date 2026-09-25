---
description: "Regla de oxlint que escribe las cadenas de variantes de Tailwind CSS en un solo orden — `hover:dark:` o `dark:hover:` — y reescribe el resto, con autofix."
---

## Qué hace esta regla

Reordena los prefijos de variants dentro de una sola clase para que la cadena se escriba siempre
igual. `hover:dark:bg-red` y `dark:hover:bg-red` producen el mismo CSS en Tailwind v4, pero un orden
inconsistente ensucia grep, code reviews y diffs. Esta regla elige un orden canónico y reescribe
todo para que coincida, con autofix sobre el primer ofensor y sugerencias de editor sobre el resto.

Los pseudo-elements (`before`, `after`, `file`, `placeholder`, `selection`, `marker`, `backdrop`,
`first-line`, `first-letter`, `details-content`) quedan siempre pinneados innermost — lo más cerca
posible de la utility — porque en Tailwind v4 un pseudo-element puesto antes de una variant que
selecciona elemento produce CSS roto del estilo `&::before { &>svg { … } }`.

Con un entry point configurado, qué variants son esas surge de los selectores que genera el design
system en lugar de esa lista fija, así que una variant que define tu proyecto también se maneja:
`@custom-variant thumb (&::-webkit-slider-thumb)` queda pinneada innermost como `before:`, y
`@custom-variant child (& > *)` se vuelve una barrera de reordenamiento porque mover una variant de
estado a través de un combinador cambia qué elemento se selecciona.

DS-opcional — cuando `settings.tailwindcss.entryPoint` está configurado, la regla usa la tabla de
prioridad de variants del design system y el comportamiento derivado de variants de arriba. Cuando
no, cae a un orden estático built-in y la lista fija. Ambos caminos son determinísticos, y un entry
point faltante se tolera silenciosamente (`no-contradicting-variants` es la otra regla que hace
esto).

## Opciones

### `order`

`string[]`, opcional.

Lista de prioridad personalizada. Los variants aparecen en el orden que listas; lo que no listas
ordena después, en su posición original. Úsalo cuando tu team tiene un house style distinto al
default de Tailwind (e.g. prefieres `dark:` outermost en toda cadena). El pin de pseudo-elements
sigue aplicando sin importar dónde los pongas en tu lista.

```jsonc
{
  "tailwindcss/consistent-variant-order": [
    "error",
    { "order": ["dark", "sm", "md", "lg", "xl", "hover", "focus"] }
  ]
}
```

### `entryPoint`

`string`, opcional.

Override por regla de `settings.tailwindcss.entryPoint`. Misma semántica que el setting a nivel
proyecto; casi nunca se necesita.

## Ejemplos

### ✗ Incorrecto

```tsx
// hover antes que responsive
<div className="hover:sm:flex" />
//              ~~~~~~~~~~~~~  → sm:hover:flex

// hover antes que dark
<div className="hover:dark:text-white" />
//              ~~~~~~~~~~~~~~~~~~~~~  → dark:hover:text-white

// pseudo-element antes que variant de elemento — roto en Tailwind v4
<div className="before:[&>svg]:text-red-500" />
//              ~~~~~~~~~~~~~~~~~~~~~~~~~~~  → [&>svg]:before:text-red-500
```

### ✓ Correcto

```tsx
// Responsive → state
<div className="sm:hover:flex" />

// Color scheme → state
<div className="dark:hover:text-white" />

// Pseudo-element innermost
<div className="[&>svg]:before:text-red-500" />
<div className="dark:has-[.active]:before:text-red-500" />
```

## Interacciones con otras reglas

- **`enforce-sort-order`**: complementaria. `enforce-sort-order` ordena clases enteras entre sí;
  `consistent-variant-order` ordena los prefijos dentro de una clase. Ejecuta las dos.
- **`enforce-canonical`**: ortogonal. Canonical normaliza la forma de la utility (`m-0`,
  `bg-red-500/50`), no la cadena de variants.
- **`no-unknown-classes`**: cuando se reordena una variant la clase resultante sigue siendo
  semánticamente equivalente, así que la detección de clases unknown no ve diferencia.

## Cuándo desactivarla

- **Confías en `prettier-plugin-tailwindcss` también para ordenar variants**: el formatter lo hace,
  la regla es redundante. Dejar ambas activadas es seguro pero es trabajo extra.
- **Orden personalizado de variants que es difícil de expresar como una lista plana** (e.g. el orden
  depende de la utility): desactívala y confía en el review.
- **Código generado** donde el orden de variants codifica un significado que no quieres que se
  reescriba.
