## Qué hace esta regla

Ordena cada string de clases Tailwind en tu código para que matchee el orden oficial de Tailwind —
el mismo orden que Tailwind usa al generar CSS, y el mismo que aplican `prettier-plugin-tailwindcss`
y `oxfmt`. La regla tiene autofix: correr `oxlint --fix` reescribe el string in-place.

DS-dependiente — requiere `settings.tailwindcss.entryPoint`. El sort exacto lo computa la API de
class-order de `@tailwindcss/node` contra tu stylesheet, así que tokens de theme, plugins y
agregados de `@layer` participan todos. Cuando el design system no puede cargar, la regla emite un
único diagnóstico fatal `designSystemUnavailable` por archivo en vez de caer a una heurística.

La salida es byte-compatible con `prettier-plugin-tailwindcss` y `oxfmt` siempre y cuando las tres
herramientas apunten al mismo CSS de `entryPoint`. Mira la guía de interop en los docs para la combo
recomendada.

## Opciones

### `mode`

`'default' | 'strict'`, default `'default'`.

`'default'` delega al worker de class-order de Tailwind (un tiro, orden oficial). `'strict'` agrupa
clases primero por su cadena de variants (`hover:`, `dark:hover:`, …), después ordena dentro de cada
grupo — útil si quieres que los prefijos responsive/state queden visualmente clusterizados en vez de
intercalados por utility. La mayoría de los proyectos deberían quedarse con el default; es lo que
hace todo el tooling de Tailwind.

```jsonc
{ "tailwindcss/enforce-sort-order": ["error", { "mode": "strict" }] }
```

### `entryPoint`

`string`, opcional.

Override por regla de `settings.tailwindcss.entryPoint`. Útil en el caso raro donde esta regla
necesita leer un stylesheet distinto al del resto del plugin (e.g. aplicas scope a el sort a una
sub-app). Casi nadie lo necesita — definí el entry point una vez en `settings` y olvidate.

## Ejemplos

### ✗ Incorrecto

```tsx
// Fuera de orden
<div className="text-red-500 flex" />
//                            ~~~~ → flex text-red-500

// Padding antes que flex
<div className="p-4 flex items-center" />
//              ~~~                    → flex items-center p-4

// Modificadores important mantienen su posición
<div className="!text-red-500 !flex" />
//                            ~~~~~  → !flex !text-red-500
```

### ✓ Correcto

```tsx
// Layout → spacing → typography → color
<div className="flex items-center p-4 text-red-500" />

// Variants se clusterizan por la prioridad de variant de Tailwind
<div className="flex sm:hidden md:flex lg:hidden" />

// Strict mode: agrupa primero por variant
<div className="flex p-4 hover:bg-red-500 hover:text-white" />
```

## Interacciones con otras reglas

- **`enforce-canonical`**: ejecuta la canonicalización primero, después el sort. Las formas
  canónicas (e.g. `m-0` en vez de `-m-0`) participan del sort con su prioridad correcta.
- **`enforce-shorthand`**: combiná `mt-2 mr-2 mb-2 ml-2` en `m-2` primero, después dejá que
  sort-order ubique el shorthand donde corresponde.
- **`no-unnecessary-whitespace`**: inocua en cualquier dirección. El fixer rearma el string desde
  una lista de tokens determinística, así que cualquier doble espacio sobrante colapsa en la próxima
  pasada.
- **`prettier-plugin-tailwindcss` / `oxfmt`**: elige una fuente de verdad. Apuntando al mismo
  `entryPoint`, las tres producen output byte-idéntico, así que puedes correr formatter + linter sin
  que se peleen los fixers.

## Cuándo desactivarla

- **Delegas el sort a `prettier-plugin-tailwindcss` o `oxfmt` exclusivamente** y quieres mantener el
  rule budget chico — el formatter ya hace este laburo byte-por-byte. Dejar ambas activadas está
  bien (no hay conflictos), es solo trabajo redundante.
- **Trabajando en un codebase que ordena clases a propósito por intent de autoría** (e.g.
  agrupamiento visual que no matchea la prioridad de Tailwind). Desactivala localmente en vez de
  globalmente si es una preferencia por componente.
