---
title: "Interop con oxfmt y Prettier"
description: "Usa oxlint-tailwindcss junto a oxfmt o prettier-plugin-tailwindcss y obtén el mismo orden de clases de Tailwind CSS en los tres, apuntándolos a tu CSS."
---

# Interop con oxfmt y prettier-plugin-tailwindcss

`enforce-sort-order` produce el orden oficial de clases de Tailwind — el mismo que produce
[prettier-plugin-tailwindcss](https://github.com/tailwindlabs/prettier-plugin-tailwindcss), y el
`sortTailwindcss` de [oxfmt](https://oxc.rs/docs/guide/usage/formatter), que implementa el mismo
algoritmo. El formateador y este plugin coinciden en cada string de clases que toca el formateador,
**cuando los dos leen el mismo CSS y el formateador conoce tus helpers de clases**. Dos settings lo
logran.

## 1. El mismo stylesheet

Por defecto el formateador lee el theme que trae el paquete `tailwindcss` instalado — **no el CSS de
tu proyecto** — así que no conoce tus tokens de `@theme` y los ordena distinto: `bg-brand` y
`text-brand` se ordenan como clases desconocidas. Apúntalo al archivo que lee este plugin.

## 2. Tus helpers de clases

El formateador ordena los atributos de clase (`className`, `class`) y **solo las funciones que
listes**. `cn("p-4 flex")` queda sin ordenar salvo que `cn` esté en `functions`, mientras que este
plugin ordena cada string de clases que extrae. Lista los helpers que uses:

```jsonc
// .oxfmtrc.json
{
  "sortTailwindcss": {
    "stylesheet": "./src/styles.css",
    "functions": ["cn", "clsx", "cva", "tv"]
  }
}
```

Los mismos dos settings para prettier:

```jsonc
// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles.css",
  "tailwindFunctions": ["cn", "clsx", "cva", "tv"]
}
```

## Quién hace qué

Con los dos settings, correr el formateador no le deja nada que reportar a `enforce-sort-order` en
los atributos de clase ni en los helpers listados, y correr `oxlint --fix` no le deja nada que
cambiar al formateador. Los strings de clases que el formateador nunca formatea — una variable
`const classes = "…"`, un template `tw` — siguen siendo del linter.

El formateador además elimina clases duplicadas y colapsa espacios en los strings que formatea, así
que ahí se solapa con `no-duplicate-classes` y `no-unnecessary-whitespace`; las reglas de lint
siguen cubriendo todo lo demás.

::: tip `--fix` más de una vez

Cuando varias reglas corrigen el mismo string de clases (un duplicado, espacios de más y el orden),
oxlint aplica una de esas correcciones por corrida: no tiene fixes en varias pasadas. Corre
`oxlint --fix` de nuevo, o deja que el formateador haga el orden, los duplicados y los espacios de
una vez.

:::

## Por qué esto no se arregla upstream

El equipo de Tailwind
[intencionalmente requiere config explícita](https://github.com/tailwindlabs/prettier-plugin-tailwindcss/issues/389)
para el stylesheet en v4. No hay convención tipo `tailwind.config.js` para autodetectar en v4 — los
archivos CSS pueden vivir en cualquier parte y llamarse como sea. El plugin cae al `theme.css`
empaquetado en vez de adivinar.

`oxlint-tailwindcss` v1 sigue la misma filosofía (`entryPoint` explícito), así que el único paso
necesario para la consistencia es decirle a cada herramienta la misma ruta.

## ¿Y `tailwindcss-animate` y `@tailwindcss/typography`?

Si usas plugins que registran clases (por ejemplo `prose-*`, `animate-in`), se importan vía tu
`@import` en CSS — ambas herramientas las toman automáticamente siempre que lean el mismo
stylesheet.

## Múltiples stylesheets por proyecto

Si distintas partes de tu monorepo usan distintos archivos CSS, mira la
[guía de monorepo](/es/monorepo). Los mismos patrones aplican a oxfmt: sus
[`overrides`](https://oxc.rs/docs/guide/usage/formatter#configuration) pueden apuntar distintos
globs de archivos a distintos stylesheets.

```jsonc
// .oxfmtrc.json
{
  "sortTailwindcss": { "functions": ["cn"] },
  "overrides": [
    {
      "files": ["packages/admin/**"],
      "options": {
        "sortTailwindcss": { "stylesheet": "./packages/admin/src/admin.css", "functions": ["cn"] }
      }
    }
  ]
}
```
