---
title: "no-borrowed-component-styles — regla de lint para Tailwind CSS"
description: "Regla de oxlint que reporta un elemento que rearma uno de tus componentes con clases de Tailwind CSS: un Button, Card o Input hecho a mano."
---

# no-borrowed-component-styles

Regla de oxlint que reporta un elemento que rearma uno de tus componentes con clases de Tailwind
CSS: un Button, Card o Input hecho a mano.

::: warning Experimental

Sus heurísticas aún pueden cambiar en una versión minor, agregando o quitando reportes. Viene
apagada en la config recomendada.

:::

## De un vistazo

| Autofix | Sugerencias en el editor | Design system              | Opciones                   |
| ------- | ------------------------ | -------------------------- | -------------------------- |
| No      | No                       | Obligatorio (`entryPoint`) | `components`, `entryPoint` |

## Qué hace esta regla

Tus componentes guardan las decisiones del design system: `<Button>` es el color primario, el radio,
la altura y el anillo de foco, en un solo lugar. Un `<button>` que copia las clases de Button — o
las reescribe de memoria — se ve igual hoy y se desvía mañana: cuando Button cambia, él no, y nunca
tuvo el anillo de foco, el estado deshabilitado ni las variantes. Esta regla lee los componentes que
le indicas, y reporta un elemento simple cuyas clases rearman uno de ellos:

```text
<button> rebuilds Button: 9 of its 9 style declarations match. Use Button from
components/ui/button.tsx instead, so it follows your design system.
```

Compara lo que hacen las clases, no cómo están escritas:

- cada clase se convierte en sus declaraciones CSS, así que `px-4` y `pl-4 pr-4`, o `rounded-md` y
  `rounded-t-md rounded-b-md`, son el mismo estilo;
- el layout queda fuera — `flex`, `w-full`, `mt-4`, `gap-2`: dónde se ubica un elemento lo decides
  tú;
- y también las clases detrás de una variant (`hover:`, `md:`, `data-[state=open]:`), en ambos
  lados.

Un elemento se reporta cuando comparte al menos 4 declaraciones con un componente, esas son al menos
el 60% de todas las declaraciones que pone cualquiera de los dos (las que el elemento agrega cuentan
en contra), una de ellas estila la caja — fondo, borde, esquinas o sombra — y ninguno de sus colores
difiere de los del componente. La forma de un Button en otro color es otro estilo, y
`text-sm font-medium` por sí solo es cualquier texto.

Solo se comparan elementos nativos (`<button>`, `<div>`, `<span>`), a partir de su string en
`className` o de la llamada a `cn()` que tenga: el `className` de un componente se mezcla con sus
propios estilos, no es una copia de ellos. Los archivos de los componentes nunca se reportan.

DS-dependiente — necesita `settings.tailwindcss.entryPoint` para convertir clases en declaraciones.
Sin autofix: cambiar un elemento por un componente cambia sus props y su comportamiento.

## Cómo lee tus componentes

La regla lee cada archivo de `components` sin ejecutarlo, y toma:

- una definición con `cva()` o `tv()`: sus clases base más el default de cada grupo de variantes,
  como el componente (`Button`), y un estilo por cada valor de su primer grupo de variantes
  (`Button variant="outline"`);
- el primer `className` de un componente función con nombre en mayúscula — su elemento raíz — cuando
  es un string o una llamada a `cn()` / `clsx()`: `Card`, `CardHeader`.

Un estilo se compara solo si tiene al menos 4 declaraciones, un color y una caja. Se omiten los
componentes que pasan `className` tal cual, o que arman sus clases en runtime.

## Opciones

### `components`

`string[]`, default `[]`.

Los archivos y directorios con los componentes de tu design system. Un directorio se lee de forma
recursiva, sin los archivos `*.test.*`, `*.spec.*`, `*.stories.*` ni `*.d.ts`. Las rutas relativas
se resuelven como `entryPoint`: contra el directorio del `.oxlintrc.json` más cercano, y después
contra el directorio de trabajo de oxlint. Sin componentes, la regla no reporta nada.

```jsonc
{
  "tailwindcss/no-borrowed-component-styles": ["warn", { "components": ["src/components/ui"] }]
}
```

### `entryPoint`

`string`, opcional. Override por regla de `settings.tailwindcss.entryPoint`.

## Ejemplos

Con el Button y el Card de shadcn/ui en `components/ui`:

### ✗ Incorrecto

```tsx
// options: { "components": ["components/ui"] }
// Copiado de Button
<button className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground h-9 hover:bg-primary/90">
  Pagar
</button>
// reports: rebuilds Button

// Reescrito de memoria: otro orden, pl-4 pr-4 en vez de px-4, en un link
<a className="bg-primary text-primary-foreground pl-4 pr-4 py-2 h-9 rounded-md text-sm font-medium">
  Pagar
</a>

// Un Card, con sus clases mezcladas por cn()
<div className={cn("rounded-xl border bg-card py-6", "text-card-foreground shadow-sm")}>Plan</div>
// reports: rebuilds Card
```

### ✓ Correcto

```tsx
// options: { "components": ["components/ui"] }
// Los componentes mismos
<Button className="mt-4 w-full">Pagar</Button>

// Solo layout
<div className="flex items-center gap-2 p-4" />

// La forma de un Button en un color que ninguna de sus variantes usa es otro estilo
<div className="rounded-md bg-muted px-4 py-2 text-sm font-medium h-9" />

// Sin caja en común: los estilos de texto por sí solos son cualquier texto
<span className="h-9 px-4 py-2 text-sm font-medium text-primary-foreground" />
```

## Interacciones con otras reglas

- **`no-default-palette`** y **`no-hardcoded-colors`** mantienen los colores de un elemento en tu
  theme; esta regla mantiene en los componentes los estilos que ellos ya definen.
- **`max-class-count`**: un string de clases largo en un elemento simple suele ser un componente que
  espera ser extraído — o uno que ya existe, y esta regla lo nombra.
- **`no-restyle` de @shadcn/lint** reporta la dirección contraria: clases que reestilan un
  componente (`<Button className="bg-blue-600">`). Esta regla reporta un elemento simple reestilado
  para parecerse a uno. Mira [shadcn/ui y @shadcn/lint](/es/shadcn).

## Cuándo desactivarla

- **Un elemento que no puede ser el componente.** shadcn/ui dibuja un checkbox dentro de un ítem de
  menú de comandos con las clases de Checkbox, porque un Checkbox real — un botón — no puede ir
  dentro de una opción. Desactiva esa línea.
- **Código que muestra el markup de los componentes**, como stories o páginas de docs fuera de
  `components`.
- **Durante una migración** a los componentes: los reportes son la lista de pendientes; deja la
  regla en `warn`.
