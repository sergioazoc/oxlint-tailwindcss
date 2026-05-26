# no-arbitrary-value

> Disallow arbitrary values in Tailwind CSS classes

## Qué hace esta regla

Marca cualquier utility de Tailwind que use un arbitrary value — la
escotilla `[...]` — para forzar al equipo a usar un token del design
system o extender el theme en vez de literales sueltos. Cualquier cosa
que el parser reconozca como arbitrary value califica: dimensiones
(`w-[200px]`, `text-[14px]`), colores (`bg-[#ff0000]`), expresiones
calc (`p-[calc(1rem+2px)]`), gradients, y lo mismo dentro de variants
(`hover:w-[200px]`) o con el modificador `!` (`!w-[200px]`,
`w-[200px]!`).

DS-independiente — no se carga ningún design system, no necesitas
`entryPoint`. La regla es un chequeo puramente sintáctico, lo que la
hace barata de correr en repos grandes. No hay autofix: reemplazar un
arbitrary value por un token requiere criterio humano, así que la
regla solo reporta.

Los _variants_ arbitrarios (`[&>svg]:w-4`) no son _values_
arbitrarios y la regla los deja tranquilos. Mira el lado del valor de
la utility, no el prefijo de selector.

## Opciones

### `allow`

`string[]`, default `[]`.

Una lista de prefijos de utilities donde los arbitrary values están
tolerados. El match es un `String.prototype.startsWith` literal
contra la forma bare de la utility (después de sacar `!` y los
variants), así que entradas como `"grid-cols-"` permiten
`grid-cols-[18rem_1fr]` sin habilitar `grid-rows-[...]`. Candidatos
típicos: container queries (`@container`), grid templates
(`grid-cols-`, `grid-rows-`), y transforms genuinamente a medida
(`bg-[url(`).

```jsonc
{
  "tailwindcss/no-arbitrary-value": ["error", {
    "allow": ["grid-cols-", "grid-rows-", "bg-[url("]
  }]
}
```

Tip: arrancá con `[]` para ver dónde tu codebase realmente necesita
escapes, después promové los legítimos a `allow` en vez de desactivar
la regla entera.

## Ejemplos

### ✗ Incorrecto

```tsx
// Dimensión one-off en vez de un token de spacing
<div className="w-[200px] p-[10px]" />

// Literal hex en vez de un color del theme
<div className="bg-[#ff0000] text-white" />

// El variant no cambia el veredicto
<div className="hover:w-[200px]" />

// El modificador `!` tampoco
<div className="!w-[200px]" />
```

### ✓ Correcto

```tsx
// Usa tokens de spacing
<div className="w-64 p-2.5" />

// Usa un color de theme declarado en @theme
<div className="bg-brand text-white" />

// Los variants arbitrarios están bien — apuntan a selectores, no a valores
<div className="[&>svg]:w-4" />

// Permitido vía `allow: ["grid-cols-"]`
<div className="grid grid-cols-[18rem_1fr]" />
```

## Interacciones con otras reglas

- **`no-hardcoded-colors`**: un subset estricto enfocado en utilities
  de color (`bg-[#ff0]`, `text-[rgb(...)]`). Activa esa si quieres el
  mensaje granular específico de colores; activa ambas para
  enforcement por capas. Las dos van a disparar sobre la misma
  clase, lo cual suele ser deseable durante una migración.
- **`no-unnecessary-arbitrary-value`**: esta regla prohibe los
  arbitrary values directamente; `no-unnecessary-arbitrary-value` es
  más suave — solo marca arbitraries que tienen equivalente nombrado
  exacto (`w-[100%]` → `w-full`). Pueden coexistir: la suave
  autofixea los casos triviales y esta atrapa lo que queda.
- **`prefer-theme-tokens`**: misma intención, pero DS-dependiente.
  `prefer-theme-tokens` consulta tu `@theme` y sugiere el token que
  matchea. Combinalas: esta regla es tu freno de mano cuando todavía
  no existe el token.

## Cuándo desactivarla

- **Prototipos / branches de spike** donde la velocidad le gana a la
  disciplina. Reactivala antes de mergear.
- **Archivos que genuinamente necesitan un arbitrary value** (landing
  pages one-off, shims de CSS-in-JS dinámico). Prefiere `allow` con
  una lista corta de prefijos, o desactiva por línea con
  `// oxlint-disable-next-line tailwindcss/no-arbitrary-value`.
- **Librerías que publican utilities de Tailwind que el consumidor
  re-skinea**: a veces la forma arbitraria es el contrato más
  limpio. Documenta la decisión y desactiva la regla en ese paquete.

