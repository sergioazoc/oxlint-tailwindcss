## Qué hace esta regla

Combina utilities por-eje de Tailwind en sus equivalentes shorthand cuando todos los ejes llevan el
mismo valor. El caso más común: `mt-2 mr-2 mb-2 ml-2` colapsa a `m-2`. Familias cubiertas:

| Familia                 | Colapsa                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| margin / padding        | cuatro lados → `m-*`, ejes → `my-*`/`mx-*`, `mx-*`+`my-*` → `m-*`, `ms-*`+`me-*` → `mx-*`                                                     |
| `scroll-m*`/`scroll-p*` | las mismas formas                                                                                                                             |
| sizing                  | `w-*`+`h-*` → `size-*`                                                                                                                        |
| radios                  | esquinas → bordes → `rounded-*`, incluidas las esquinas lógicas (`rounded-ss-*`+`rounded-es-*` → `rounded-s-*`)                               |
| borders                 | lados → `border-*`, ejes → `border-x-*`/`border-y-*` — anchos **y** colores                                                                   |
| inset                   | `top`/`right`/`bottom`/`left` → `inset-*`, ejes → `inset-x-*`/`inset-y-*`, `start-*`+`end-*` → `inset-x-*`                                    |
| pares de una propiedad  | `gap-x`+`gap-y`, `overflow-x`+`overflow-y`, `overscroll-x`+`overscroll-y`, `border-spacing-x`+`border-spacing-y`, `translate-x`+`translate-y` |

Un diagnóstico por grupo colapsable: los cuatro lados reportan `m-2` una vez, no `m-2` más las
mitades `my-2`/`mx-2`.

`scale-x-*`+`scale-y-*` deliberadamente **no** es una familia. `scale-110` además escribe
`--tw-scale-z`, que `scale-3d` lee, así que mergear cambiaría cómo renderiza
`scale-x-110 scale-y-110 scale-3d`.

### Con un `entryPoint`, el merge se comprueba contra el CSS

Tailwind v4 tiene namespaces de tema por eje: `w-*` lee `--width-*` (y `--container-*`), `h-*` lee
`--height-*`, `size-*` lee `--size-*`. Con este tema

```css
@theme {
  --width-brand: 10rem;
  --height-brand: 20rem;
}
```

`w-brand h-brand` → `size-brand` es destructivo: `size-brand` no existe, y el elemento pierde el
ancho y el alto. Si configuras `settings.tailwindcss.entryPoint` (o el `entryPoint` propio de la
regla), la regla compara las declaraciones que Tailwind emite — las partes tienen que resolver al
mismo valor y el reemplazo tiene que reproducirlo — así que ese merge no se ofrece.

Los tokens de tema con nombre en la familia de sizing solo se mergean cuando los valores son
literalmente idénticos. `w-card h-card` se deja como está incluso si los tres namespaces definen
`card` como `30rem`, porque cada lado lee una variable distinta y un override en `:root` de una de
ellas las separa — el mismo razonamiento que [`enforce-canonical`](./enforce-canonical) aplica a
`rounded-[0.5rem]` → `rounded-lg`.

Sin entry point la regla mantiene los merges que son seguros diga lo que diga el tema: números y
fracciones (la escala de spacing compartida), valores arbitrarios (el mismo literal a los dos
lados), las keywords del core (`full`, `auto`, `min`, `max`, `fit`, `px` y las unidades de
viewport), y todas las familias que no son sizing — esas beben de un único namespace.

## Opciones

### `entryPoint`

`string`, opcional. Un entry point CSS solo para esta regla, que pisa
`settings.tailwindcss.entryPoint`. Se usa únicamente para verificar los merges contra el CSS
emitido; la regla funciona sin él.

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

// Lados y ejes de cualquier familia cubierta
<div className="border-t-2 border-r-2 border-b-2 border-l-2" />  →  border-2
<div className="top-0 right-0 bottom-0 left-0" />                →  inset-0
<div className="rounded-tl-lg rounded-tr-lg" />                  →  rounded-t-lg
<div className="gap-x-4 gap-y-4" />                              →  gap-4

// Pares lógicos inline — `ms-*`+`me-*` ES `margin-inline`
<div className="ms-4 me-4" />  →  mx-4

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

// w-screen es 100vw y h-screen es 100vh; size-screen no existe
<div className="w-screen h-screen" />

// Tokens de tema por eje: `size-brand` dejaría el elemento sin dimensiones
// (hace falta un entryPoint para detectarlo — ver arriba)
<div className="w-brand h-brand" />

// scale-110 además escribe --tw-scale-z, que scale-3d lee
<div className="scale-x-110 scale-y-110" />

// Cobertura parcial — necesita los cuatro lados para m-*
<div className="mt-2 mr-2" />

// Dos lados adyacentes no son un eje
<div className="top-0 right-0" />

// Variants distintas — la regla no mergea cruzando cadenas de variants
<div className="hover:mt-2 focus:mb-2" />
```

## Interacciones con otras reglas

- **`enforce-sort-order`**: ejecuta shorthand primero así el shorthand participa del sort con su
  propia prioridad. Si no, el sort ubica `mt-2 mr-2 mb-2 ml-2` en posiciones separadas y el fix del
  shorthand las colapsa después.
- **`enforce-logical` / `enforce-physical`**: la mayoría de las familias de aquí son
  direction-neutral. Los pares lógicos que sí colapsan (`ms-*`+`me-*` → `mx-*`,
  `border-s-*`+`border-e-*` → `border-x-*`, `start-*`+`end-*` → `inset-x-*`) caen en utilities de
  eje que ninguna regla direccional convierte, así que las dos nunca se pelean.
- **`enforce-consistent-important-position`**: el shorthand respeta la convención de posición del
  `!` de las clases mergeadas. Si las cuatro usan prefijo, el shorthand queda con prefijo; lo mismo
  para sufijo.

## Cuándo desactivarla

- **Quieres valores explícitos por eje para readability**, sobre todo en libraries de componentes de
  design system donde los reviewers encuentran `mt-2 mr-2 mb-2 ml-2` más claro que `m-2`.
- **Generación de código** donde cada utility se emite a propósito y colapsarlas escondería la
  intención.
