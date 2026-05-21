# Reglas

Las 23 reglas de `oxlint-tailwindcss`, agrupadas por lo que hacen
cumplir. Clickeá cualquier regla para ver ejemplos y referencia de
opciones.

## Corrección

Reglas que atrapan problemas que generarían CSS inválido o
inesperado.

- [no-unknown-classes](./no-unknown-classes) — prohíbe clases que el design system desconoce.
- [no-conflicting-classes](./no-conflicting-classes) — marca clases que pelean por la misma propiedad CSS.
- [no-contradicting-variants](./no-contradicting-variants) — `flex hover:flex` es redundante.
- [no-dark-without-light](./no-dark-without-light) — `dark:` debería usualmente tener pareja en modo claro.
- [no-duplicate-classes](./no-duplicate-classes) — la misma clase dos veces es peso muerto.

## Modernización

- [no-deprecated-classes](./no-deprecated-classes) — `flex-grow` → `grow`, etc.
- [enforce-canonical](./enforce-canonical) — `-m-0` → `m-0`, `bg-gradient-to-r` → `bg-linear-to-r`, etc.
- [no-unnecessary-arbitrary-value](./no-unnecessary-arbitrary-value) — `w-[200px]` → `w-50` cuando existe el named.
- [prefer-theme-tokens](./prefer-theme-tokens) — `border-(--border)` → `border-border` cuando un named utility mapea al mismo variable.
- [enforce-negative-arbitrary-values](./enforce-negative-arbitrary-values) — `-top-[5px]` → `top-[-5px]`.

## Estilo y consistencia

- [enforce-sort-order](./enforce-sort-order) — ordena las clases en el orden oficial de Tailwind.
- [consistent-variant-order](./consistent-variant-order) — `dark:hover:` vs `hover:dark:`.
- [enforce-consistent-important-position](./enforce-consistent-important-position) — prefijo `!flex` vs sufijo `flex!`.
- [enforce-consistent-line-wrapping](./enforce-consistent-line-wrapping) — una clase por línea vs todo en una.
- [enforce-consistent-variable-syntax](./enforce-consistent-variable-syntax) — `bg-(--x)` vs `bg-[var(--x)]`.
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
- **Opciones** con sus defaults.
- **Ejemplos correctos / incorrectos**.
- Para reglas DS-dependientes: si `entryPoint` es obligatorio
  (siempre sí en v1) y qué pasa cuando falta.
