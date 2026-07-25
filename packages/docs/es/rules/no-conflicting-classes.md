# no-conflicting-classes

> Disallow Tailwind CSS classes that generate conflicting CSS properties

## Qué hace esta regla

Detecta pares de clases de Tailwind en el mismo elemento, bajo la misma variante, cuyas
declaraciones CSS chocan — donde una de las dos se descarta en silencio. La comparación se hace
contra el CSS que el design system emite de verdad, valores incluidos: los nombres de propiedad por
sí solos no distinguen un conflicto de una composición.

Una propiedad compartida es conflicto solo cuando la declaración que PIERDE la cascada aporta algo
que la ganadora no reproduce. Es decir, esto **no** es conflicto, y ninguno de estos casos está
tratado a mano:

- **el mismo valor en ambos lados** — `mask-b-from-50% mask-b-from-black` comparten cuatro
  declaraciones byte a byte idénticas, así que gane quien gane el resultado es el mismo;
- **un reenviador `var()` y la clase que suministra la variable** — `outline-2` declara
  `outline-style: var(--tw-outline-style)` y no aporta valor propio; el match es por el nombre real
  de la variable, así que el `--scrollbar-*` de un plugin se comporta igual que el `--tw-*` de
  Tailwind;
- **una ganadora que sigue arrastrando a la perdedora** — `drop-shadow-indigo-500` lee el
  `--tw-drop-shadow-size` que escribe `drop-shadow-xl`, y la cadena se sigue transitivamente (así
  compone `from-*` / `via-*` / `to-*`);
- **una custom property reseteada a `initial`** — `animate-in` inicializa cada `--tw-enter-*` para
  que sus modificadores la sobrescriban;
- **declaraciones en cajas distintas** — `placeholder-*` estila `::placeholder`, `space-x-*` estila
  los hijos, y ninguna estila el elemento.

Dos clases que declaran la misma propiedad con el mismo valor se reportan como **`redundant`**: no
es un conflicto, pero una de las dos es peso muerto. Con `reportRedundant: false` se desactiva.

Cuál gana se le pregunta al design system, no se deduce del orden en que escribiste las clases — la
salida de Tailwind no depende de ese orden. Cuando la posición no se puede conocer (una clase cuyo
valor escribiste tú, como `w-[10px]`), el diagnóstico reporta el choque sin nombrar ganadora.

Solo dos composiciones no se pueden derivar del CSS, y quedan declaradas en el código con el motivo:
las variantes de tamaño de `prose` y `prose` + `max-w-*` (el plugin pretende el override y el CSS
emitido es indistinguible de un accidente), y los modos de `mask-composite`. Para una composición
que produzcan tus propios plugins, usa la opción **`allow`** en vez de esperar un release.

DS-dependiente — requiere `settings.tailwindcss.entryPoint`. Cuando el design system no puede
cargar, la regla emite un único diagnóstico fatal `designSystemUnavailable` por archivo en vez de
pasar en silencio.

## Opciones

| Opción            | Tipo                             | Por defecto | Descripción                                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reportRedundant` | `boolean`                        | `true`      | Reporta como `redundant` dos clases que declaran la misma propiedad con el mismo valor.                                                                                                                                                                     |
| `allow`           | `(string \| [string, string])[]` | `[]`        | Patrones a silenciar, comparados con la clase **tal como está escrita** (prefijo de variante y `!` incluidos). Uno simple silencia cualquier par que involucre una clase que haga match; uno de dos elementos silencia esa combinación, en cualquier orden. |
| `entryPoint`      | `string`                         | —           | Override por regla de `settings.tailwindcss.entryPoint`.                                                                                                                                                                                                    |

```jsonc
{
  "rules": {
    "tailwindcss/no-conflicting-classes": [
      "error",
      {
        // Tu plugin compone de una forma que el CSS emitido no puede mostrar.
        "allow": [["^gutter-thin$", "^gutter-(thumb|track)-"]],
      },
    ],
  },
}
```

## Ejemplos

### ✗ Incorrecto

```tsx
// Misma propiedad, valor distinto: una de las dos se descarta
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

```

## Interacciones con otras reglas

- **`no-duplicate-classes`**: complementaria. Los duplicados son la misma clase repetida; los
  conflictos son clases distintas que pegan en la misma propiedad. Mantén ambas activas.
- **`enforce-sort-order`**: aquí es cosmética. Quién gana lo decide el stylesheet generado, no el
  orden del atributo, así que ordenar no crea ni resuelve un conflicto — solo hace el par más fácil
  de leer.

- **`no-deprecated-classes`**: un alias deprecado y su equivalente moderno (`flex-grow` + `grow`)
  van a chocar a nivel de propiedad. Arreglar la deprecación suele resolver el conflicto.
- **`enforce-canonical`**: reescribir a la forma canónica colapsa pares trivialmente aliasados antes
  de que lleguen aquí.

## Cuándo desactivarla

- **Listas de clases generadas** donde el orden importa a propósito y dependes de la semántica de
  "gana la última" (e.g. patrón base + override en un primitive del design system). Prefiere extraer
  el override a un `cn()`/`twMerge()` para que el conflicto sea explícito.
- **Codebases cuyos propios plugins componen de una forma que el CSS emitido no puede mostrar**: usa
  la opción `allow` antes que desactivar la regla. Los patrones se comparan contra la clase tal como
  está escrita, así que incluye el prefijo de variante si también quieres silenciar formas `hover:`.
- **Tests / fixtures** que arman strings de clases en conflicto a propósito para ejercitar otro
  tooling.
