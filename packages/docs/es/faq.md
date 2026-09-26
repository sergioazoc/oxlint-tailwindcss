---
title: "Preguntas frecuentes"
description: "Respuestas sobre oxlint-tailwindcss: ESLint, Tailwind v3, qué reglas corren, el entry point, Vue y Svelte, clases desconocidas, --fix, formateadores y CI."
---

# Preguntas frecuentes

## ¿Funciona con ESLint?

No. oxlint-tailwindcss es un plugin de oxlint, hecho sobre la API de JS plugins de oxlint y probado
solo con oxlint. Instala oxlint y agrega el plugin a `jsPlugins` en `.oxlintrc.json` — mira
[Setup](/es/setup).

## ¿Qué versiones de Tailwind soporta?

Tailwind CSS v4.1.15 en adelante. El plugin carga el motor de Tailwind de tu propio proyecto, así
que el linter y tu build leen el mismo design system; un motor más viejo, una major futura o una
major distinta a la de tu build se reportan con un mensaje que lo dice. Tailwind v3
(`tailwind.config.js`) no está soportado.

## ¿Qué reglas corren?

Solo las que listas en `rules`. Las `categories` de oxlint no encienden las reglas de un JS plugin,
así que una config con el plugin y sin reglas no reporta nada. Parte de la
[config recomendada](/es/setup#3-conjunto-de-reglas-recomendado) y agrega reglas de
[la lista](/es/rules/).

## ¿Necesito un entry point?

Las reglas que leen tu design system — qué clases existen, su orden, su CSS — necesitan
`settings.tailwindcss.entryPoint`, el archivo CSS donde haces `@import "tailwindcss"`. Sin él
reportan `designSystemUnavailable` una vez por archivo, con una pista. Las demás funcionan sin él, y
varias ganan precisión con él. [La lista de reglas](/es/rules/) dice cuál es cuál.

## ¿Linta archivos de Vue, Svelte y Astro?

Sus bloques `<script>`, y el frontmatter de Astro — no los templates. oxlint les pasa a los JS
plugins solo esas partes del archivo. [Vue, Svelte y Astro](/es/frameworks) muestra qué se linta y
qué no.

## ¿Por qué se reporta como desconocida una clase que funciona?

`no-unknown-classes` conoce las clases de Tailwind y las que define tu CSS — en el entry point y en
las hojas tuyas que importa, hasta cuatro `@import` de profundidad, y en la hoja de un paquete que
importe. Una clase que reporta y que igual funciona en el navegador suele venir de CSS que el entry
point no importa, uno que tu app carga por separado. O no tiene CSS y es un gancho para JavaScript o
tests. Importa ese CSS desde el entry point, o avísale a la regla con
[`allowlist` o `ignorePrefixes`](/es/rules/no-unknown-classes#opciones).

## ¿Cómo apago una regla para una línea?

Con los comentarios de oxlint, nombrando la regla:

```tsx
// oxlint-disable-next-line tailwindcss/no-unknown-classes
<div className="legacy-widget flex" />
```

## ¿Por qué `oxlint --fix` deja algunos problemas?

oxlint aplica un arreglo por string de clases en cada corrida. Cuando varias reglas arreglan el
mismo string — un duplicado, espacios de más y el orden — cada corrida aplica uno; corre
`oxlint --fix` de nuevo hasta que no cambie nada.

## ¿Reemplaza a prettier-plugin-tailwindcss o al ordenamiento de clases de oxfmt?

No, trabajan juntos. El formateador ordena clases, quita duplicados y colapsa espacios en lo que
formatea; este plugin revisa la corrección — clases desconocidas, en conflicto, deprecadas o armadas
en runtime, y más. Apunta los dos al mismo CSS y ordenan igual: mira [Interop](/es/interop).

## ¿Cómo se compara con @shadcn/lint y better-tailwindcss?

Revisan cosas distintas: [Frente a otros plugins](/es/comparison) muestra qué revisa cada uno, y el
[benchmark](/es/benchmark) los mide sobre el mismo código — errores detectados, falsos positivos,
velocidad y qué hacen sus fixes.

## ¿Puedo usarlo con @shadcn/lint?

Sí. [shadcn/ui y @shadcn/lint](/es/shadcn) muestra quién reporta qué y una config combinada que
reporta cada problema una sola vez.

## Uso eslint-plugin-better-tailwindcss. ¿Cómo me cambio?

Cada una de sus reglas tiene su equivalente aquí; la
[guía de migración](/es/migration/from-better-tailwindcss) mapea las reglas y sus settings, y
recorre el cambio.

## ¿Cómo lo hago rápido en CI?

El design system se precalcula una vez por entry point y se guarda en caché en disco. Conserva esa
caché entre jobs — [En CI](/es/ci) tiene la receta con `actions/cache`.

## ¿Funciona en un monorepo?

Sí: mapea los archivos de cada package a su CSS en la config raíz, o dale a cada package su propio
`.oxlintrc.json`. Mira [Monorepo](/es/monorepo).
