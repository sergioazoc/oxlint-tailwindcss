# no-deprecated-classes

> Disallow deprecated Tailwind CSS v4 classes

## Qué hace esta regla

Marca cualquier clase que fue renombrada cuando Tailwind pasó de v3 a
v4 y la reescribe en el lugar con un auto-fix. El mapeo es un
`DEPRECATED_MAP` hardcodeado — sin heurísticas, sin consultas al DS
sobre el nombre viejo. Ejemplos: `flex-grow` → `grow`, `flex-shrink` →
`shrink`, `overflow-ellipsis` → `text-ellipsis`, `decoration-clone` →
`box-decoration-clone`, `bg-gradient-to-r` → `bg-linear-to-r` (y el
resto de las direcciones de gradient). Los variants y modificadores
`!` (important) se preservan en ambos lados de la reescritura.

DS-dependiente — requiere `settings.tailwindcss.entryPoint`. La regla
usa el design system para saber contra qué archivo está trabajando y
así jugar bien con el resto del plugin (en particular, `no-unknown-
classes` saltea las clases que esta regla marca para que no veas dos
diagnósticos por el mismo token). Si el design system no puede
cargar, la regla emite un único diagnóstico fatal
`designSystemUnavailable` por archivo en vez de pasar en silencio.

## Opciones

Esta regla no tiene opciones propias más allá del override estándar
`entryPoint` (string, defaultea a `settings.tailwindcss.entryPoint`).
Configurá el entry point en `settings.tailwindcss.entryPoint` para
todo el proyecto en vez de por-regla cuando puedas.

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

- **`no-unknown-classes`**: saltea silenciosamente cualquier clase
  presente en `DEPRECATED_MAP`. No vas a recibir "unknown class" más
  "deprecated class" para `flex-grow` — solo la deprecación. Mantené
  ambas activas.
- **`enforce-canonical`**: cubre un conjunto estrictamente más grande
  que esta regla — reescribe formas válidas-pero-no-canónicas (`-m-0`
  → `m-0`, `start-2` → `inset-s-2`) y también atrapa todas las
  deprecaciones. Correr ambas está bien; los autofixes no conflictúan.
  Elegí `no-deprecated-classes` cuando querés un pase rápido,
  hardcodeado y sin DS; elegí `enforce-canonical` para el cleanup
  completo con DS.
- **`no-restricted-classes`**: ortogonal. Esa la usás para bloquear
  clases válidas; esta solo se dispara con la lista fija de renames
  v3→v4.

## Cuándo desactivarla

- **Seguís en Tailwind v3** y los nombres nuevos no resuelven contra
  tu design system. Fijá el plugin y desactivá esta regla hasta que
  migres.
- **Mantenés a propósito una capa de clases v3-compatibles** al lado
  de v4 (por ejemplo, una librería compartida que apunta a ambos). En
  ese caso preferí un `eslint-disable` puntual en el archivo antes
  que un disable a nivel proyecto.

