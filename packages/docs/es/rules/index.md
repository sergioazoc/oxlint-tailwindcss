# Reglas

Las 23 reglas de `oxlint-tailwindcss`, agrupadas por lo que hacen cumplir. Haz clic en cualquier
regla para ver ejemplos y referencia de opciones.

## Corrección

Reglas que atrapan problemas que generarían CSS inválido o inesperado.

- [no-unknown-classes](./no-unknown-classes) — prohíbe clases que el design system desconoce.
- [no-conflicting-classes](./no-conflicting-classes) — marca clases que pelean por la misma
  propiedad CSS.
- [no-contradicting-variants](./no-contradicting-variants) — `flex hover:flex` es redundante (solo
  en listas de clases literales en elementos nativos, no en fragmentos de `cn`/`twMerge`).
- [no-dark-without-light](./no-dark-without-light) — `dark:` debería usualmente tener pareja en modo
  claro (solo en listas de clases literales en elementos nativos, no en fragmentos de
  `cn`/`twMerge`).
- [no-duplicate-classes](./no-duplicate-classes) — la misma clase dos veces es peso muerto.

## Modernización

- [no-deprecated-classes](./no-deprecated-classes) — `flex-grow` → `grow`, etc.
- [enforce-canonical](./enforce-canonical) — `-m-0` → `m-0`, `bg-gradient-to-r` → `bg-linear-to-r`,
  etc.
- [no-unnecessary-arbitrary-value](./no-unnecessary-arbitrary-value) — `w-[100%]` → `w-full` cuando
  la clase nombrada emite CSS idéntico.
- [prefer-theme-tokens](./prefer-theme-tokens) — `border-(--border)` → `border-border` cuando un
  named utility mapea al mismo variable.
- [prefer-scale-token](./prefer-scale-token) — `p-[10px]` → `p-2.5`, `w-[200px]` → `w-50` cuando el
  token es el mismo VALOR (solo reporta; el CSS difiere textualmente).
- [enforce-negative-arbitrary-values](./enforce-negative-arbitrary-values) — `-top-[5px]` →
  `top-[-5px]`.

## Estilo y consistencia

- [enforce-sort-order](./enforce-sort-order) — ordena las clases en el orden oficial de Tailwind.
- [consistent-variant-order](./consistent-variant-order) — `dark:hover:` vs `hover:dark:`.
- [enforce-consistent-important-position](./enforce-consistent-important-position) — prefijo `!flex`
  vs sufijo `flex!`.
- [enforce-consistent-line-wrapping](./enforce-consistent-line-wrapping) — una clase por línea vs
  todo en una.
- [enforce-consistent-variable-syntax](./enforce-consistent-variable-syntax) — `bg-(--x)` vs
  `bg-[var(--x)]`.
- [enforce-logical](./enforce-logical) — `ml-4` → `ms-4` para soporte RTL.
- [enforce-physical](./enforce-physical) — `ms-4` → `ml-4` para proyectos LTR-only.
- [enforce-shorthand](./enforce-shorthand) — `mt-2 mr-2 mb-2 ml-2` → `m-2`.
- [no-unnecessary-whitespace](./no-unnecessary-whitespace) — colapsa runs de espacios.

## Disciplina del design system

- [no-arbitrary-value](./no-arbitrary-value) — prohíbe `w-[3.14rem]` y amigos.
- [no-hardcoded-colors](./no-hardcoded-colors) — prohíbe `bg-[#fff]`, prefiere theme tokens.
- [no-restricted-classes](./no-restricted-classes) — bloquea clases específicas o patrones regex.
- [max-class-count](./max-class-count) — limita cuántas clases se pueden apilar en un elemento.

## Páginas por regla

Cada página de regla cubre:

- **Qué hace**, en un párrafo.
- **Opciones** con sus defaults y una descripción por opción.
- **Ejemplos correctos / incorrectos**.
- **Cuándo desactivarla** — los casos de uso donde esta regla no es la indicada.
- Para reglas DS-dependientes: si `entryPoint` es obligatorio (siempre sí en v1) y qué pasa cuando
  falta.

## Referencia de defaults

Tabla rápida para saber qué hace cada regla cuando la activas sin sobreescribir
`meta.defaultOptions`.

### Reglas DS-dependientes

Estas reglas requieren que `settings.tailwindcss.entryPoint` esté configurado; emiten un diagnóstico
fatal `designSystemUnavailable` cuando falta.

| Regla                            | Opciones por defecto                    |
| -------------------------------- | --------------------------------------- |
| `enforce-canonical`              | `{}`                                    |
| `enforce-sort-order`             | `{ mode: 'default' }`                   |
| `no-conflicting-classes`         | `{ reportRedundant: true }`             |
| `no-unknown-classes`             | `{ allowlist: [], ignorePrefixes: [] }` |
| `no-unnecessary-arbitrary-value` | `{}`                                    |
| `prefer-scale-token`             | `{}`                                    |
| `prefer-theme-tokens`            | `{}`                                    |

### Reglas DS-opcionales

Funcionan sin nada configurado — su fallback es determinístico por sí solo — y ganan precisión
cuando hay un `entryPoint` disponible. Ninguna puede emitir `designSystemUnavailable`. Todas aceptan
además un `entryPoint` propio que pisa el ajuste compartido.

| Regla                       | Opciones por defecto                                | Qué aporta el design system                                     |
| --------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `consistent-variant-order`  | `{}` (orden derivado del DS cuando está disponible) | El orden real de variants, y qué hace el selector de cada una   |
| `enforce-logical`           | `{ allowlist: [], direction: 'both' }`              | Confirma que la clase sugerida exista                           |
| `enforce-physical`          | `{ allowlist: [], direction: 'both' }`              | Confirma que la clase sugerida exista                           |
| `enforce-shorthand`         | `{}`                                                | Verifica cada merge contra el CSS emitido                       |
| `no-contradicting-variants` | `{}`                                                | Qué hace el selector de cada variant                            |
| `no-dark-without-light`     | `{ variants: ['dark'] }`                            | Agrupa la base por propiedad CSS declarada, no solo por prefijo |
| `no-deprecated-classes`     | `{}`                                                | Deriva la lista de renombres en vez de usar la tabla interna    |

### Reglas DS-independientes

| Regla                                   | Opciones por defecto            |
| --------------------------------------- | ------------------------------- |
| `enforce-consistent-important-position` | `{ position: 'suffix' }`        |
| `enforce-consistent-line-wrapping`      | `{ printWidth: 80 }`            |
| `enforce-consistent-variable-syntax`    | `{ syntax: 'shorthand' }`       |
| `enforce-negative-arbitrary-values`     | (sin opciones)                  |
| `max-class-count`                       | `{ max: 20 }`                   |
| `no-arbitrary-value`                    | `{ allow: [] }`                 |
| `no-duplicate-classes`                  | (sin opciones)                  |
| `no-hardcoded-colors`                   | `{ allow: [] }`                 |
| `no-restricted-classes`                 | `{ classes: [], patterns: [] }` |
| `no-unnecessary-whitespace`             | (sin opciones)                  |
