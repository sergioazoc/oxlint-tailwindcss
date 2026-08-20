# no-contradicting-variants

> Disallow variant-prefixed classes that are redundant because the base class already applies
> unconditionally

## Qué hace esta regla

Marca clases con variant que son redundantes porque la misma utility ya está aplicada sin
condiciones en el mismo elemento. El caso canónico es `flex hover:flex`: `flex` siempre aplica, así
que el prefijo `hover:` no aporta nada — bajo hover ya estaba, y fuera de hover la base igual gana.
La variante es ruido puro (y suele ser un indicio de que alguien quiso escribir otra utility, como
`hover:inline-flex`).

La regla NO reporta cuando la variante apunta a un elemento distinto del de la base.
Pseudo-elementos (`after`, `before`, `placeholder`, `marker`, `backdrop`, `selection`, `first-line`,
`first-letter`, `file`), selectores de hijos (`*:`, `**:`) y selectores arbitrarios (`[&>svg]`,
`[&_div]`) cambian el target del selector, así que `absolute after:absolute` o
`shrink-0 [&>svg]:shrink-0` están bien — la base aplica al elemento y la variante a un descendiente
o pseudo-elemento.

Con `settings.tailwindcss.entryPoint` configurado, ese criterio sale del selector que el design
system genera de verdad para cada variante, así que cubre variantes que define el propio proyecto:
`@custom-variant thumb (&::-webkit-slider-thumb)` hace válido `size-4 thumb:size-4`, algo que
ninguna lista de nombres podría saber. Sin entry point la regla usa los nombres de arriba y se
comporta igual que antes — nunca reporta que falte el design system.

El match es por identidad exacta de la utility, así que `bg-white hover:bg-blue-500` queda intacto
(valores distintos), igual que `flex hover:items-center` (utilities distintas).

## Opciones

| Opción       | Tipo     | Por defecto | Descripción                                              |
| ------------ | -------- | ----------- | -------------------------------------------------------- |
| `entryPoint` | `string` | —           | Override por regla de `settings.tailwindcss.entryPoint`. |

El entry point es opcional: con uno configurado la regla clasifica las variantes según los
selectores que genera el design system, y sin él usa la lista interna. Nunca reporta que falte el
design system.

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

- **`no-duplicate-classes`**: complementaria. Los duplicados son la misma string repetida
  (`hover:flex hover:flex`); esta regla atrapa el caso más sutil donde la base subsume a la variante
  sin condiciones.
- **`no-conflicting-classes`**: una utility base que sombrea a una variante no es un conflicto a
  nivel de propiedad CSS (ambas resuelven al mismo valor), así que `no-conflicting-classes` no la
  marca. Ese es el hueco que cubre esta regla.
- **`no-dark-without-light`**: forma inversa. Esta regla marca `base + variant:misma-utility`; esa
  marca `dark:foo` sin ninguna contraparte en light.

## Composición y helpers de merge (`cn` / `twMerge` / `cva`)

"`hover:flex` es redundante porque `flex` ya aplica" sólo se sostiene cuando el string que se revisa
es la lista de clases **final y autocontenida** del elemento. En una composición con
`tailwind-merge` — el patrón `cn`/`twMerge` + `cva` que usan los codebases estilo shadcn — un
`className` suele ser un **fragmento de override** que se fusiona en runtime con clases aportadas en
otro lado, muchas veces en otro módulo. Ahí la variante suele ser **load-bearing**: existe para
ganarle a una clase del mismo grupo que el componente mergea desde su propio `cva`.

Toma `<Button className="bg-transparent hover:bg-transparent" />`, donde `Button` hace
`twMerge(buttonVariants(), className)` y `buttonVariants()` aporta `hover:bg-accent`.
`bg-transparent` (sin modificador) y `hover:bg-accent` (un modificador `hover`) están en grupos de
conflicto distintos de `tailwind-merge`, así que el `bg-transparent` incondicional **no** desaloja a
`hover:bg-accent` — sólo `hover:bg-transparent` lo hace. Quitar el "redundante"
`hover:bg-transparent` restaura entonces el hover con accent. La clase parece redundante en
aislamiento pero es necesaria en contexto (issue #117).

Como la base a la que le gana la variante vive en otro argumento o módulo, la redundancia no es
decidible desde el fragmento solo sin emular `tailwind-merge`. Por eso la regla sólo evalúa un
string que puede asegurar que es la lista final: un literal (o template) usado directamente como
`class`/`className` en un **elemento host nativo** (`<div>`, `<button>`, …). **No** reporta strings
que sean:

- argumentos de una llamada merge-aware — `cn(...)`, `twMerge(...)`, `cva(...)`, `tv(...)`, etc.;
- el `className`/`class` de un **componente custom** (`<Button …>`, `<Field.Root …>`), que es opaco
  — el componente puede volver a fusionarlo internamente;
- asignados a una variable, o emitidos desde un tagged template.

El trade-off es deliberado: acepta algunos falsos negativos (un par genuinamente redundante
escondido en una de esas posiciones no se atrapa) para eliminar los falsos positivos, que se leen
como obviamente correctos e invitan a una regresión de render.

## Cuándo desactivarla

- **Generadores de código / class-name builders** en un elemento nativo que a propósito emiten una
  base y una variante con la misma utility. (Los fragmentos de override que pasan por `cn`/`twMerge`
  o por un componente custom ya se omiten — mira la sección de arriba.)
- **Snapshots / fixtures** que necesitan el par redundante para ejercitar tooling downstream.
