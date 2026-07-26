## Qué hace esta regla

Marca cualquier clase que fue renombrada cuando Tailwind pasó de v3 a v4 y la reescribe en el lugar
con un auto-fix. Ejemplos: `flex-grow` → `grow`, `flex-shrink` → `shrink`, `overflow-ellipsis` →
`text-ellipsis`, `decoration-clone` → `box-decoration-clone`, `bg-gradient-to-r` → `bg-linear-to-r`
(y el resto de las direcciones de gradient). Los variants y modificadores `!` (important) se
preservan en ambos lados de la reescritura.

### De dónde sale la lista de renombres

Con `settings.tailwindcss.entryPoint` (o el `entryPoint` propio de la regla) configurado, la lista
se **deriva de tu design system**: se le pregunta al `canonicalizeCandidates` de Tailwind a qué
mapea cada spelling de v3, y solo se reportan los que todavía compila Y todavía renombra. Eso cubre
renombres que una tabla hardcodeada no tenía — `break-words` → `wrap-break-word`, `order-none` →
`order-0`, los spellings de posición reordenados `bg-left-top` → `bg-top-left` y `object-left-top` →
`object-top-left` — y, más importante, una entrada desaparece sola cuando un Tailwind futuro deje de
compilarla, en vez de sugerir un reemplazo para una clase que ya no existe.

Sin entry point la regla cae a una tabla hardcodeada con los 15 renombres más conocidos, así que
sigue funcionando sin nada configurado y nunca emite un diagnóstico `designSystemUnavailable`.

## Opciones

### `entryPoint`

`string`, opcional. Un entry point CSS solo para esta regla, que pisa
`settings.tailwindcss.entryPoint`. Se usa para derivar la lista de renombres; la regla funciona sin
él.

## Ejemplos

### ✗ Incorrecto

```tsx
// Aliases de flex de v3 — v4 sacó el prefijo `flex-`
<div className="flex-grow flex-shrink-0" />

// Dirección de gradient — renombrada a bg-linear-to-*
<div className="bg-gradient-to-r from-blue-500 to-purple-500" />

// Alias de text overflow y shorthand de box-decoration
<div className="overflow-ellipsis" />
<div className="decoration-clone" />

// Variants e important se preservan en la salida
<div className="hover:!flex-grow" />
```

### ✓ Correcto

```tsx
// Spellings post-migración
<div className="grow shrink-0" />

<div className="bg-linear-to-r from-blue-500 to-purple-500" />

<div className="text-ellipsis" />
<div className="box-decoration-clone" />

<div className="hover:!grow" />
```

## Interacciones con otras reglas

- **`no-unknown-classes`**: omite silenciosamente cualquier spelling renombrado, preguntándole al
  design system en vez de a una lista propia, así que las dos reglas no pueden discrepar. No vas a
  recibir "unknown class" más "deprecated class" para `flex-grow` — solo la deprecación. Mantén
  ambas activas.
- **`enforce-canonical`**: **esta regla es la dueña de los renombres.** Tailwind también los
  canonicaliza (`bg-gradient-to-r` → `bg-linear-to-r` es a la vez una deprecación y una
  canonicalización), así que antes las dos reglas reportaban la misma clase con el mismo fix.
  `enforce-canonical` ahora se calla con todo lo que esté en la lista de renombres y mantiene el
  resto: formas válidas-pero-no-canónicas como `-m-0` → `m-0` y `start-2` → `inset-s-2` (`start-*`
  es Tailwind actual, solo que no es el spelling canónico). Mantén ambas activas — con solo
  `enforce-canonical` los renombres quedan sin reportar.
- **`no-restricted-classes`**: ortogonal. Esa la usas para bloquear clases válidas; esta solo se
  dispara con la lista fija de renames v3→v4.

## Cuándo desactivarla

- **Sigues en Tailwind v3** y quieres mantener los spellings de v3. Desactiva esta regla hasta que
  migres.
- **Mantienes a propósito una capa de clases v3-compatibles** al lado de v4 (por ejemplo, una
  librería compartida que apunta a ambos). En ese caso prefiere un `eslint-disable` puntual en el
  archivo antes que un disable a nivel proyecto.
