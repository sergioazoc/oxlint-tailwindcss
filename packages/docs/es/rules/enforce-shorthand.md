# enforce-shorthand

> Enforce shorthand Tailwind CSS classes when all axes have the same value

## Qué hace esta regla

Combina utilities por-eje de Tailwind en sus equivalentes shorthand
cuando todos los ejes llevan el mismo valor. El caso más común:
`mt-2 mr-2 mb-2 ml-2` colapsa a `m-2`. La regla cubre márgenes,
paddings, sizing de width/height, y radios de esquina — todas las
combinaciones donde Tailwind tiene un shorthand de una clase para la
forma multi-clase. El autofix corre sobre cada patrón que matchea.

DS-independiente — funciona sin `settings.tailwindcss.entryPoint`. La
tabla de mapeo es estática, y el parseo de valores viene de un solo
regex; no se necesita lookup en el design system.

Caso especial: `w-X h-X` → `size-X` solo dispara cuando ambos lados
resuelven a la misma dimensión CSS. Las unidades de viewport
(`screen`, `dvw`, `dvh`, `svw`, `svh`, `lvw`, `lvh`) se excluyen
porque `w-screen` y `h-screen` referencian ejes distintos (`100vw`
vs `100vh`) y no serían equivalentes a `size-screen`.

## Opciones

Esta regla no tiene opciones. El set de pares shorthand está fijado
por la superficie de utilities propia de Tailwind — cualquier cosa
que dejáramos configurable acá es más bien un laburo para el proyecto
upstream de Tailwind.

## Ejemplos

### ✗ Incorrecto

```tsx
// Margen en los cuatro lados
<div className="mt-2 mr-2 mb-2 ml-2" />
//              ~~~~ ~~~~ ~~~~ ~~~~  → m-2

// Dos ejes (vertical, horizontal)
<div className="mt-2 mb-2" />  →  my-2
<div className="ml-2 mr-2" />  →  mx-2

// Width + height con el mismo valor
<div className="w-full h-full" />
//              ~~~~~~ ~~~~~~  → size-full

// Lo mismo con important — los dos lados tienen que compartir el modificador
<div className="!mt-2 !mr-2 !mb-2 !ml-2" />
//              ~~~~~ ~~~~~ ~~~~~ ~~~~~  → !m-2
```

### ✓ Correcto

```tsx
// Ya es shorthand
<div className="m-2 p-4" />

// Valores distintos por eje — no se puede colapsar
<div className="mt-2 mb-4" />

// Unidades de viewport excluidas — w-screen ≠ h-screen
<div className="w-screen h-screen" />

// Cobertura parcial — necesita los cuatro lados para m-*
<div className="mt-2 mr-2" />

// Variants distintas — la regla no mergea cruzando cadenas de variants
<div className="hover:mt-2 focus:mb-2" />
```

## Interacciones con otras reglas

- **`enforce-sort-order`**: corré shorthand primero así el shorthand
  participa del sort con su propia prioridad. Si no, el sort ubica
  `mt-2 mr-2 mb-2 ml-2` en posiciones separadas y el fix del
  shorthand las colapsa después.
- **`enforce-logical` / `enforce-physical`**: los pares shorthand de
  acá (`m-*`, `p-*`, `size-*`, `rounded-*`) son direction-neutral,
  así que ninguna regla direccional interfiere.
- **`enforce-consistent-important-position`**: el shorthand respeta
  la convención de posición del `!` de las clases mergeadas. Si las
  cuatro usan prefijo, el shorthand queda con prefijo; lo mismo para
  sufijo.

## Cuándo desactivarla

- **Querés valores explícitos por eje para readability**, sobre todo
  en libraries de componentes de design system donde los reviewers
  encuentran `mt-2 mr-2 mb-2 ml-2` más claro que `m-2`.
- **Generación de código** donde cada utility se emite a propósito y
  colapsarlas escondería la intención.

