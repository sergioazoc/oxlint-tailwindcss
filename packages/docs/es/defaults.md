# Referencia de defaults

Cada regla declara su `meta.defaultOptions` cuando acepta opciones.
La tabla de abajo muestra los defaults runtime de un vistazo — cómo
se comporta la regla cuando la activás sin sobrescribir nada.

## Reglas DS-dependientes

Estas reglas requieren `settings.tailwindcss.entryPoint`; en v1
emiten un diagnóstico fatal `designSystemUnavailable` cuando no está.

| Regla | Opciones por defecto |
|---|---|
| `enforce-canonical` | `{}` |
| `enforce-sort-order` | `{ mode: 'default' }` |
| `no-conflicting-classes` | `{}` |
| `no-deprecated-classes` | `{}` |
| `no-unknown-classes` | `{ allowlist: [], ignorePrefixes: [] }` |
| `no-unnecessary-arbitrary-value` | `{}` |
| `prefer-theme-tokens` | `{}` |

`consistent-variant-order` es DS-opcional — cuando no hay entryPoint
declarado, cae a un orden estático built-in (que también es
determinista).

## Reglas independientes del DS

| Regla | Opciones por defecto |
|---|---|
| `consistent-variant-order` | `{}` (orden derivado del DS cuando está disponible) |
| `enforce-consistent-important-position` | `{ position: 'suffix' }` |
| `enforce-consistent-line-wrapping` | `{ classesPerLine: 0, group: 'preserve' }` |
| `enforce-consistent-variable-syntax` | `{ syntax: 'shorthand' }` |
| `enforce-logical` | `{ allowlist: [], direction: 'both' }` |
| `enforce-negative-arbitrary-values` | (sin opciones) |
| `enforce-physical` | `{ allowlist: [], direction: 'both' }` |
| `enforce-shorthand` | (sin opciones) |
| `max-class-count` | `{ max: 5 }` |
| `no-arbitrary-value` | `{ allow: [] }` |
| `no-contradicting-variants` | (sin opciones) |
| `no-dark-without-light` | `{ requireLight: true }` |
| `no-duplicate-classes` | (sin opciones) |
| `no-hardcoded-colors` | `{ allow: [] }` |
| `no-restricted-classes` | `{ classes: [], patterns: [] }` |
| `no-unnecessary-whitespace` | (sin opciones) |

## Config recomendado de arranque

Si querés un punto de partida "bendecido" que cubre la mayoría de
proyectos:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["tailwindcss"],
  "rules": {
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/no-unnecessary-whitespace": "warn",
    "tailwindcss/consistent-variant-order": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn"
  },
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  }
}
```

Sumá `enforce-logical` / `enforce-physical` si tenés preferencia de
dirección, y `no-restricted-classes` / `no-hardcoded-colors` si
querés hacer cumplir la disciplina del design system.
