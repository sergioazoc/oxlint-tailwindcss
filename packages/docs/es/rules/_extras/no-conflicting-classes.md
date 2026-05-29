## Qué hace esta regla

Detecta pares de clases de Tailwind en el mismo elemento que escriben sobre las mismas propiedades
CSS bajo la misma variante — la clase de conflicto donde la segunda clase gana en silencio y la
primera queda como peso muerto. El chequeo es a nivel de propiedad CSS (no por patrón textual): la
regla le pregunta al design system qué produce cada clase y compara los sets de propiedades.

Para evitar falsos positivos en utilities que comparten propiedades a propósito, la regla tiene dos
escape hatches:

- **`COMPLEMENTARY_GROUPS`** — familias por regex cuyos miembros están diseñados para componerse,
  e.g. stops de gradiente (`from-*` / `via-*` / `to-*` comparten `--tw-gradient-stops`), piezas de
  transition, ejes de transform, gradientes de máscara, modificadores de tamaño de `prose`.
- **`COMPOSITION_PAIRS`** — pares explícitos que componen a pesar de superponerse en una propiedad
  (e.g. `text-*` y `leading-*`, ancho `border-*` y estilo `border-{solid,dashed,…}`, `divide-*`
  estilando hijos mientras `border-*` estila el elemento, `animate-in` inicializando las vars
  `--tw-enter-*` que sus modificadores sobrescriben).

También reconoce dos patrones estructurales automáticamente: composición vía custom properties CSS
disjuntas (por eso `shadow-*` y `ring-*` conviven en el mismo `box-shadow` sin chocar) y narrowing
overrides, donde el set de propiedades de la clase posterior es subconjunto estricto del de la
anterior (`size-4 h-6`, `rounded-t-lg rounded-tl-sm`, `truncate text-clip`).

DS-dependiente — requiere `settings.tailwindcss.entryPoint`. Cuando el design system no puede
cargar, la regla emite un único diagnóstico fatal `designSystemUnavailable` por archivo en vez de
pasar en silencio.

## Opciones

(no tiene opciones más allá de `entryPoint`, que también puedes setear globalmente vía
`settings.tailwindcss.entryPoint`.)

## Ejemplos

### ✗ Incorrecto

```tsx
// Misma propiedad, gana la segunda
<div className="text-red-500 text-blue-500" />

// El conflicto sobrevive bajo la misma variante
<div className="hover:bg-red-500 hover:bg-blue-500" />

// `!important` no salva — misma propiedad, sigue siendo conflicto
<div className="!text-red-500 !text-blue-500" />

// Mismo rol de gradiente entra en conflicto; roles distintos componen
<div className="from-red-500 from-blue-500" />

// Asimetría del narrowing: la clase más amplia DESPUÉS de la angosta la pisa
<div className="h-6 size-4" />
```

### ✓ Correcto

```tsx
// Propiedades distintas
<div className="flex items-center" />

// Variantes distintas — se aplican bajo condiciones distintas
<div className="hover:bg-red-500 focus:bg-blue-500" />

// Stops de gradiente son complementarios
<div className="from-blue-500 via-purple-500 to-pink-500" />

// `shadow-*` + `ring-*` componen vía custom properties --tw-* disjuntas
<div className="shadow-lg ring-1 ring-offset-2" />

// Narrowing: `size-4` y después `h-6` refina un eje
<div className="size-4 h-6" />
```

## Interacciones con otras reglas

- **`no-duplicate-classes`**: complementaria. Los duplicados son la misma clase repetida; los
  conflictos son clases distintas que pegan en la misma propiedad. Mantén ambas activas.
- **`enforce-sort-order`**: el orden define quién gana, pero no hace desaparecer los conflictos.
  Ejecuta esta regla primero así el diagnóstico apunta al solapamiento real y no a la que quedó
  última.
- **`no-deprecated-classes`**: un alias deprecado y su equivalente moderno (`flex-grow` + `grow`)
  van a chocar a nivel de propiedad. Arreglar la deprecación suele resolver el conflicto.
- **`enforce-canonical`**: reescribir a la forma canónica colapsa pares trivialmente aliasados antes
  de que lleguen acá.

## Cuándo desactivarla

- **Listas de clases generadas** donde el orden importa a propósito y dependes de la semántica de
  "gana la última" (e.g. patrón base + override en un primitive del design system). Prefiere extraer
  el override a un `cn()`/`twMerge()` para que el conflicto sea explícito.
- **Codebases donde la mayoría de los falsos positivos vienen de entradas faltantes en
  `COMPLEMENTARY_GROUPS` / `COMPOSITION_PAIRS`**: abrí un issue antes que desactivar — esas tablas
  son el punto de extensión soportado.
- **Tests / fixtures** que arman strings de clases en conflicto a propósito para ejercitar otro
  tooling.
