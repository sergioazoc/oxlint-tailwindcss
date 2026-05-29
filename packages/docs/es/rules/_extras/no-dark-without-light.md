## Qué hace esta regla

Atrapa el caso donde escribiste `dark:bg-gray-900` pero te olvidaste de la base correspondiente en
light mode (`bg-white`, `bg-zinc-50`, lo que sea). En el momento en que un theme switcher está
activo, ese elemento renderiza sin estilo en light mode — típicamente transparente o heredando del
padre, casi nunca lo que querías.

El chequeo es por prefijo de utility, no por valor exacto. La regla agrupa las clases por la familia
de propiedad inicial (`bg`, `text`, `border-t`, `from`, `rounded-tl`, etc.), y después pregunta: por
cada clase que usa una variante observada, ¿hay al menos una clase con el mismo prefijo que NO usa
una variante observada? Si no, la clase con variante no tiene contraparte en light mode y se
reporta.

El conjunto de "variantes observadas" es configurable. Por defecto es sólo `dark`, pero el mismo
shape aplica a cualquier otra variante estilo scheme (`contrast-more`, `motion-reduce`, `print`,
variantes custom de data-attribute que tengas registradas, etc.) — mira la opción `variants` abajo.

## Opciones

### `variants`

`string[]`, default `["dark"]`.

Lista de variantes que requieren una base sin variante en el mismo prefijo de utility.
Sobreescribilo cuando tu app usa otro mecanismo para cambiar de theme (e.g. `contrast-more:` para un
tema de alto contraste, o una variante custom `theme-foo:` definida en tu CSS).

```jsonc
{ "tailwindcss/no-dark-without-light": ["error", { "variants": ["dark", "contrast-more"] }] }
```

Si seteas `variants` a un array vacío la regla se convierte en un no-op — prefiere desactivarla
directamente en ese caso.

## Ejemplos

### ✗ Incorrecto

```tsx
// Sin fondo en light mode — el elemento queda desnudo cuando dark no aplica
<div className="dark:bg-gray-900" />

// `bg-*` tiene base, pero `text-*` no
<div className="bg-white dark:bg-gray-900 dark:text-white" />

// Dentro de un helper de class-names — mismo problema, menos visible
cn("dark:bg-gray-900")
```

### ✓ Correcto

```tsx
// Ambos modos cubiertos
<div className="bg-white text-black dark:bg-gray-900 dark:text-white" />

// No hay variante observada → la regla no se mete con la cobertura de base
<div className="hover:bg-blue-500" />

// Variante custom + base correspondiente
<div
  className="bg-white contrast-more:bg-black"
  // con options: [{ variants: ["contrast-more"] }]
/>
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

## Cuándo desactivarla

- **Apps con un único color scheme** que igual incluyen algunas clases `dark:` para overrides
  puntuales sobre una base ya correcta en un componente padre. Prefiere angostar `variants` (e.g.
  sacar `dark`) antes que desactivarla.
- **Design systems / primitives** donde el consumidor se espera que aporte la base vía `className`.
  Desactiva por archivo y documenta el contrato; si no, cada primitive va a romper la regla.
- **Strings de clases servidas desde el server** donde la base vive en CSS y sólo el override dark
  se emite desde JS. Tratalo como el patrón anterior.
