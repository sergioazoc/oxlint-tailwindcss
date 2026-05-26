# max-class-count

> Enforce a maximum number of Tailwind CSS classes per element

## Qué hace esta regla

Cuenta las clases de Tailwind sobre cada elemento (o adentro de cada
llamada `cn()`/`clsx()`/`tw\`\``) y reporta cuando el conteo supera
un máximo configurable. El diagnóstico sugiere extraer un componente
o utility — el supuesto es que cuando un elemento necesita más de
~20 clases, estás describiendo un _componente_ inline y lo correcto
es ponerle nombre.

El contador es tonto a propósito: cuenta clases separadas por
whitespace después de que el extractor estándar resolvió la
location. Sin deduplicación, sin agrupado semántico, sin lookup al
DS. Eso lo mantiene predecible: si tu `className` se lee como N
clases, la regla ve N. Strings multilínea reconstruidos por
`enforce-consistent-line-wrapping` se cuentan como el set de clases
subyacente, no por líneas visuales.

DS-independiente — no necesita `entryPoint`. Sin autofix: extraer un
componente requiere criterio que la regla no puede tomar por vos.

## Opciones

### `max`

`number`, default `20`.

El máximo de clases permitidas en un solo elemento / llamada. La
regla reporta cuando `classes.length > max` (es decir, el límite es
inclusivo: `max: 20` permite _exactamente_ 20). Ajustalo al umbral
de tu equipo para "esto ya es un componente".

```jsonc
{ "tailwindcss/max-class-count": ["warn", { "max": 15 }] }
```

Rangos sugeridos:

- **`max: 10-15`** — cultura estricta de extracción de componentes,
  muchos bloques chicos reusables.
- **`max: 20`** (default) — punto medio, dispara sobre outliers sin
  fastidiar markup utility-first genuinamente denso.
- **`max: 30+`** — apps tipo dashboard grandes donde layouts one-off
  densos son comunes y solo querés una guardia contra casos
  realmente exagerados.

## Ejemplos

### ✗ Incorrecto

```tsx
// 21 clases — sobre el default de 20
<div className="flex items-center p-4 m-2 bg-white text-black rounded shadow border w-full h-10 gap-2 justify-between font-bold text-sm overflow-hidden cursor-pointer transition duration-200 opacity-50 z-10" />
//
// Diagnóstico:
//   Too many Tailwind classes (21). Maximum allowed is 20.
//   Consider extracting into a component or utility.

// 6 clases con `max: 5`
<div className="flex items-center p-4 m-2 gap-2 w-full" />
```

### ✓ Correcto

```tsx
// Dentro del límite default
<div className="flex items-center p-4 m-2 gap-2" />

// Extraído en un componente — el conteo se reinicia por elemento
function Card({ children }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow">
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

// `cn()` cuenta igual — se cuenta a nivel de location
cn("flex items-center", "p-4 m-2 gap-2")
```

## Interacciones con otras reglas

- **`no-duplicate-classes`**: si una clase está repetida, ambas
  reglas ven el conteo inflado. Arreglá el duplicado primero — el
  conteo baja y esta regla puede dejar de disparar sola.
- **`enforce-sort-order`** / **`enforce-consistent-line-wrapping`**:
  primas cosméticas. El contador es insensible al whitespace, así
  que el line-wrapping no cambia el veredicto.
- **`enforce-canonical`**: colapsa pares redundantes (`-m-0` → `m-0`)
  antes de que esta regla corra, a veces empujando un elemento
  borderline de vuelta bajo el límite.
- **`no-arbitrary-value`**: ortogonal pero relacionada en espíritu
  — ambas empujan hacia extraer un componente cuando un solo
  elemento empieza a cargar demasiada lógica de markup.

## Cuándo desactivarla

- **Archivos inherentemente densos** (layouts top-level, hero
  sections de marketing, primitivos del design system que _son_ la
  abstracción). Preferí desactivar por línea o un `max` más alto en
  un bloque de override.
- **Markup generado** (codegen, componentes MDX) donde el conteo
  refleja al generador, no la intención del autor.
- **No estás de acuerdo con la heurística**: la regla es
  opinionada y no le sirve a todos los codebases. No hay vergüenza
  en apagarla — existe para equipos que quieren el empujoncito.

