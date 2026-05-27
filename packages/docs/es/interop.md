# Interop con oxfmt y prettier-plugin-tailwindcss

`oxlint-tailwindcss/enforce-sort-order` produce exactamente el mismo
orden oficial de Tailwind que
[prettier-plugin-tailwindcss](https://github.com/tailwindlabs/prettier-plugin-tailwindcss)
y el `sortTailwindcss` de
[oxfmt](https://oxc.rs/docs/guide/usage/formatter). Las tres
herramientas coinciden byte a byte **si leen el mismo CSS**.

El catch: por defecto, prettier-plugin-tailwindcss (y oxfmt, que
delega en él) lee el `theme.css` empacado dentro del paquete npm
`tailwindcss` — **no el CSS de tu proyecto**. Si tu proyecto tiene
un bloque `@theme { ... }` con tokens custom, oxfmt no se entera y
su orden va a desacordar con `enforce-sort-order` en esos tokens.

## El fix: alinear el stylesheet

Apunta `sortTailwindcss.stylesheet` de oxfmt al mismo CSS que usa
este plugin:

```jsonc
// .oxfmtrc.json
{
  "sortTailwindcss": {
    "stylesheet": "./src/styles.css"
  }
}
```

Esa única línea hace que ambas herramientas lean exactamente el
mismo input y produzcan el mismo output. Lo mismo aplica para
prettier:

```jsonc
// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles.css"
}
```

## Por qué esto no se arregla upstream

El equipo de Tailwind
[requiere config explícita a propósito](https://github.com/tailwindlabs/prettier-plugin-tailwindcss/issues/389)
para el stylesheet en v4. No hay convención tipo
`tailwind.config.js` para auto-detectar en v4 — los CSS pueden
vivir en cualquier lado y llamarse cualquier cosa. El plugin opta
por el `theme.css` empacado en vez de adivinar.

`oxlint-tailwindcss` v1 sigue la misma filosofía (`entryPoint`
explícito), así que el único paso necesario para consistencia es
decirle a cada herramienta el mismo path.

## ¿Y `tailwindcss-animate` y `@tailwindcss/typography`?

Si usas plugins que registran clases (e.g. `prose-*`, `animate-in`),
se importan vía tu `@import` en CSS — ambas herramientas los
detectan automáticamente siempre que estén leyendo el mismo
stylesheet.

## Múltiples stylesheets por proyecto

Si distintas partes de tu monorepo usan distintos CSS, mira la
[guía de monorepo](/es/monorepo). Los mismos patrones aplican a
oxfmt — puedes usar
[overrides en `.oxfmtrc`](https://oxc.rs/docs/guide/usage/formatter#configuration)
para apuntar distintos globs a distintos stylesheets.
