# Empezar

## Instalación

```bash
pnpm add -D oxlint oxlint-tailwindcss
```

El plugin funciona con oxlint 1.43.0 o posterior.

## Configuración

Agregá el plugin y las reglas a tu `.oxlintrc.json` y declará el único
setting obligatorio — `settings.tailwindcss.entryPoint` apuntando al
archivo CSS donde hacés `@import "tailwindcss";`:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["tailwindcss"],
  "rules": {
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/enforce-canonical": "warn"
  },
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  }
}
```

Eso es todo. Corré `oxlint` y el plugin va a cargar tu design system
de Tailwind desde `src/styles.css` y lintear cada archivo
JS / TS / JSX / TSX / Vue / Svelte del proyecto contra ese DS.

## Verificá el setup

La prueba más rápida es escribir mal una clase a propósito:

```tsx
<div className="flx items-cetner" />
```

oxlint debería marcar ambas clases con `no-unknown-classes` y mostrar
las sugerencias `flex` y `items-center` en tu editor.

Si en cambio ves un diagnóstico `designSystemUnavailable`, significa
que `entryPoint` no está configurado o apunta a un archivo que el
plugin no puede leer. El mensaje del diagnóstico te dice exactamente
qué ruta intentó.

## Patrones comunes

- **Proyecto simple**: un string `entryPoint: "src/styles.css"` y ya.
- **Monorepo con un solo config**: usá el
  [mapping array](/es/monorepo).
- **Coexistiendo con oxfmt o prettier-plugin-tailwindcss**: revisá
  [interop](/es/interop).

## Siguientes pasos

- Recorré el [catálogo de reglas](/es/rules/) y elegí las que
  coincidan con tu estilo.
- Mirá la [referencia completa de settings](/es/settings) para
  `attributes`, `callees`, `tags`, `variablePatterns`, `exclude`,
  `timeout`, `rootFontSize` y `debug`.
- ¿Venís de v0.x? Leé la
  [guía de migración](/es/migration/v0-to-v1).
