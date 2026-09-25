---
description: "Regla de oxlint que reporta clases de Tailwind CSS armadas en runtime, como `bg-${color}-500`, que Tailwind nunca ve escritas y por eso no genera CSS para ellas."
---

## Qué hace esta regla

Tailwind genera CSS para los nombres de clase que encuentra **escritos completos** en tu código. Una
clase armada en runtime — `` `bg-${color}-500` ``, `` `text-${size}` ``, `` `w-[${width}px]` `` —
nunca aparece completa en ningún lado, así que Tailwind no emite nada para ella y el elemento se
queda sin estilo sin avisar. En desarrollo solo funciona si esa misma clase está escrita completa en
otra parte.

La regla reporta cada una de esas clases una vez, cuando el texto pegado a un `${}` — o a un
operando de `+`, `"bg-" + color` — empieza con una utilidad de Tailwind (`bg-`, `grid-cols-`,
`-mt-`, `w-[`) o una variante (`hover:`, `md:`, `data-`). Una clase o lista completa que viene de
una variable (`` `${base} p-4` ``, `"p-4 " + extra`) está bien, y también un texto que no es de
Tailwind (`` `icon-${name}` ``, `` `${a}-${b}` ``). Una clase partida en dos strings
(`"bg-" + "red-500"`) también se reporta: Tailwind lee cada string por separado. No hay autofix: el
arreglo es escribir completa cada clase a la que puede corresponder el valor.

DS-opcional. Con un `entryPoint` también cuentan las utilidades y variantes de tu proyecto (un
namespace de `@theme` como `bar-*`); sin él, se usan las raíces de utilidades y variantes propias de
Tailwind.

Lo que no ve: una variante elegida en runtime después del texto estático
(`` `${breakpoint}:flex` ``).

## Opciones

### `entryPoint`

`string`, opcional. Override por regla de `settings.tailwindcss.entryPoint`, para leer las
utilidades y variantes de tu proyecto.

## Ejemplos

### ✗ Incorrecto

```tsx
<div className={`bg-${color}-500 p-2`} />
<div className={`text-${size} font-bold`} />
<div className={`w-[${width}px]`} />
<div className={`hover:${hoverClass}`} />
<div className={cn(`p-${padding}`)} />
<div className={"text-" + tone} />
```

### ✓ Correcto

```tsx
// Escribe completa cada clase a la que puede corresponder el valor
const bgByColor = { red: 'bg-red-500', blue: 'bg-blue-500' } as const
<div className={`${bgByColor[color]} p-2`} />

// Elige entre nombres de clase completos
<div className={cn(active ? 'bg-blue-500' : 'bg-gray-500')} />

// Un valor que de verdad es dinámico: una variable CSS, definida inline
<div className="w-(--width)" style={{ '--width': `${width}px` }} />
```

## Interacciones con otras reglas

- **`no-unknown-classes`** ignora los fragmentos pegados (`bg-`, `-500`) — no son clases, y es esta
  regla la que los reporta.
- **`no-arbitrary-value`**: el arreglo con variable CSS de arriba es un valor arbitrario; permítelo
  con `allowVariables: 'runtime'`.

## Cuándo desactivarla

- **Tus clases están en un safelist** (`@source inline(…)`), así que Tailwind las genera aparezcan o
  no en el código. Desactiva la regla en esos archivos, o en el proyecto si todo está en safelist.
