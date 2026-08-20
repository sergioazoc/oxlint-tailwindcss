# no-dark-without-light

> Require a base (light) utility when using dark: (or other scheme) variant

## Qué hace esta regla

Atrapa el caso donde escribiste `dark:bg-gray-900` pero te olvidaste de la base correspondiente en
light mode (`bg-white`, `bg-zinc-50`, lo que sea). En el momento en que un theme switcher está
activo, ese elemento renderiza sin estilo en light mode — típicamente transparente o heredando del
padre, casi nunca lo que querías.

El chequeo es por grupo, no por valor exacto: por cada clase que usa una variante observada, ¿hay al
menos una clase del mismo grupo que NO usa una? Si no, la clase con variante no tiene contraparte en
light mode y se reporta.

Una clase cuenta como base de dos maneras:

- **Mismo prefijo de utility** — `bg-white` es la base de `dark:bg-black`, `text-gray-900` la de
  `dark:text-white`. Es la familia de propiedad inicial (`bg`, `text`, `border-t`, `from`,
  `rounded-tl`, …).
- **Misma propiedad CSS declarada**, cuando `settings.tailwindcss.entryPoint` (o el `entryPoint`
  propio de la regla) está configurado. `underline` y `no-underline` no comparten prefijo alguno,
  pero las dos escriben `text-decoration-line` — así que `underline dark:no-underline` es un par
  completo, no una base faltante. Lo mismo vale para `italic dark:not-italic`,
  `visible dark:invisible`, `uppercase dark:normal-case`, `truncate dark:text-clip` y
  `sr-only dark:not-sr-only`, que antes se reportaban todos.

El chequeo por propiedad es **aditivo**: todo lo que ya matcheaba por prefijo sigue matcheando, así
que configurar un entry point solo puede hacer que esta regla reporte menos, nunca más. Sin él cae
al chequeo por prefijo más una tabla interna pequeña para `display` y `position` (para que
`block dark:hidden` funcione), y por eso los pares de arriba siguen reportándose cuando no hay CSS
configurado.

El conjunto de "variantes observadas" es configurable. Por defecto es sólo `dark`, pero el mismo
shape aplica a cualquier otra variante estilo scheme (`contrast-more`, `motion-reduce`, `print`,
variantes custom de data-attribute que tengas registradas, etc.) — mira la opción `variants` abajo.

## Opciones

### `variants`

`string[]`, default `["dark"]`.

Lista de variantes que requieren una base sin variante en el mismo prefijo de utility.
Sobreescríbelo cuando tu app usa otro mecanismo para cambiar de theme (e.g. `contrast-more:` para un
tema de alto contraste, o una variante custom `theme-foo:` definida en tu CSS).

```jsonc
{ "tailwindcss/no-dark-without-light": ["error", { "variants": ["dark", "contrast-more"] }] }
```

Si seteas `variants` a un array vacío la regla se convierte en un no-op — prefiere desactivarla
directamente en ese caso.

### `entryPoint`

`string`, opcional. Un entry point CSS solo para esta regla, que pisa
`settings.tailwindcss.entryPoint`. Habilita el agrupamiento por propiedad declarada descrito arriba;
la regla funciona sin él.

## Ejemplos

### ✗ Incorrecto

```tsx
// Sin fondo en light mode — el elemento queda desnudo cuando dark no aplica
<div className="dark:bg-gray-900" />

// `bg-*` tiene base, pero `text-*` no
<div className="bg-white dark:bg-gray-900 dark:text-white" />
```

### ✓ Correcto

```tsx
// Ambos modos cubiertos
<div className="bg-white text-black dark:bg-gray-900 dark:text-white" />

// Misma propiedad con otro nombre — hace falta un entryPoint para reconocerlo
<div className="underline dark:no-underline" />
<div className="italic dark:not-italic" />
<div className="visible dark:invisible" />

// Mostrar en light, ocultar en dark: las dos escriben `display`
<div className="block dark:hidden" />

// No hay variante observada → la regla no se mete con la cobertura de base
<div className="hover:bg-blue-500" />

// Variante custom + base correspondiente
<div
  className="bg-white contrast-more:bg-black"
  // con options: [{ variants: ["contrast-more"] }]
/>

// Un string sólo-dark dentro de un helper de merge o en un componente custom es
// un fragmento de override — la base light vive en otro lado, así que NO se
// reporta. Mira "Composición y helpers de merge" abajo.
cn("dark:bg-gray-900")
;<Field className="dark:bg-transparent" />
```

## Interacciones con otras reglas

- **`no-contradicting-variants`**: forma inversa. Esta regla marca `dark:foo` sin base; esa marca
  `foo dark:foo` donde la base hace redundante a la variante. Nunca se contradicen sobre el mismo
  par de clases.
- **`no-conflicting-classes`**: ortogonal. Las clases en conflicto chocan en una propiedad; "missing
  base" es la ausencia de una propiedad para un modo determinado. Un elemento sólo-dark no va a
  romper `no-conflicting-classes` porque no entra en conflicto — simplemente no renderiza como
  querías.
- **`enforce-sort-order`**: no afecta la detección (la regla no mira el orden), pero al ordenar la
  base y la variante dark tienden a quedar pegadas, lo que hace evidente la que falta en review.

## Composición y helpers de merge (`cn` / `twMerge` / `cva`)

"No hay base para esta clase `dark:`" sólo se sostiene cuando el string que se revisa es la lista de
clases **final y autocontenida** del elemento. En una composición con `tailwind-merge` — el patrón
`cn`/`twMerge` + `cva` que usan los codebases estilo shadcn — un `className` suele ser un
**fragmento de override** que se fusiona en runtime con clases aportadas en otro lado, muchas veces
en otro módulo. Un override sólo-dark como `<Field className="dark:bg-transparent" />` no le falta
nada: la base light (`bg-white`) vive en el `cva` propio del componente, y `tailwind-merge` conserva
ambas porque están en scopes de modificador distintos. Reportarlo — y "arreglarlo" agregando una
base light al override — cambia en silencio el render en light mode (issue #117).

Como esa base vive en otro argumento o módulo, la redundancia no es decidible desde el fragmento
solo sin emular `tailwind-merge`. Por eso la regla sólo evalúa un string que puede asegurar que es
la lista final: un literal (o template) usado directamente como `class`/`className` en un **elemento
host nativo** (`<div>`, `<input>`, …). **No** reporta strings que sean:

- argumentos de una llamada merge-aware — `cn(...)`, `twMerge(...)`, `cva(...)`, `tv(...)`, etc.;
- el `className`/`class` de un **componente custom** (`<Field …>`, `<Card.Body …>`), que es opaco —
  el componente puede volver a fusionarlo internamente;
- asignados a una variable, o emitidos desde un tagged template.

El trade-off es deliberado: acepta algunos falsos negativos (una clase genuinamente sólo-dark
escondida en una de esas posiciones no se atrapa) para eliminar los falsos positivos, que se leen
como obviamente correctos e invitan a una regresión de render.

## Cuándo desactivarla

- **Apps con un único color scheme** que igual incluyen algunas clases `dark:` para overrides
  puntuales sobre una base ya correcta en un componente padre. Prefiere angostar `variants` (e.g.
  sacar `dark`) antes que desactivarla.
- **Strings de clases servidas desde el server** en un elemento nativo donde la base vive en CSS y
  sólo el override dark se emite desde JS. (Los fragmentos de override que pasan por `cn`/`twMerge`
  o por un componente custom ya se omiten — mira la sección de arriba.)
