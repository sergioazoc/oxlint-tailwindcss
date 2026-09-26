---
title: "shadcn/ui y @shadcn/lint"
description: "oxlint-tailwindcss en un proyecto shadcn/ui, junto a @shadcn/lint: quién reporta qué, un solo .oxlintrc.json combinado y lo que encuentra en shadcn/ui."
---

# shadcn/ui y @shadcn/lint

oxlint-tailwindcss lee el theme de un proyecto shadcn/ui — `app/globals.css`, con sus variables CSS
y sus colores `@theme inline` — como cualquier otra hoja de estilos de Tailwind v4, así que no
necesita nada específico de shadcn. [@shadcn/lint](https://github.com/shadcn-ui/lint) es otro plugin
de oxlint con otro trabajo: hace cumplir la política de tu design system — qué clases acepta cada
componente, colores del theme en vez de la paleta, sin valores arbitrarios, sin estilos inline. Los
dos corren juntos. Donde los dos tienen una regla para el mismo problema, apaga una, así cada
problema se reporta una sola vez.

## Quién reporta qué

<!-- generated:shadcn-table -->

| Qué                                                                                    | Ejemplo                                                        | @shadcn/lint                          | oxlint-tailwindcss                               | Config combinada   |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------ | ------------------ |
| Reestilar un componente del design system con `className`                              | `<Button className="rounded-full p-4">Pay</Button>`            | `no-restyle`                          | —                                                | @shadcn/lint       |
| Estilos inline                                                                         | <span v-pre>`<div style={{ color: "#f00" }}>Sale</div>`</span> | `no-inline-styles`                    | —                                                | @shadcn/lint       |
| Un color de la paleta de Tailwind en vez de un color del theme                         | `<div className="bg-red-500">Sale</div>`                       | `no-raw-colors`                       | `no-default-palette`                             | @shadcn/lint       |
| Valores arbitrarios                                                                    | `<div className="p-[13px]">Card</div>`                         | `no-arbitrary-values`                 | `no-arbitrary-value`, `no-hardcoded-colors`      | @shadcn/lint       |
| Una variable CSS donde el theme tiene una clase con nombre                             | `<div className="bg-(--primary)">Card</div>`                   | —                                     | `no-arbitrary-value`, `prefer-theme-tokens`      | oxlint-tailwindcss |
| Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | `<div className="itms-center">Card</div>`                      | `no-unknown-classes`, `no-raw-colors` | `no-unknown-classes`                             | oxlint-tailwindcss |
| Clases armadas en runtime                                                              | `<div className={`bg-${tone}-500`}>Card</div>`                 | `require-static-classes`              | `no-dynamic-classes`                             | las dos            |
| Clases que se pisan entre sí                                                           | `<div className="line-clamp-1 flex">Card</div>`                | —                                     | `no-conflicting-classes`                         | oxlint-tailwindcss |
| Clases duplicadas                                                                      | `<div className="flex flex">Card</div>`                        | —                                     | `no-duplicate-classes`                           | oxlint-tailwindcss |
| Clases deprecadas en Tailwind v4                                                       | `<div className="flex-shrink-0">Card</div>`                    | —                                     | `no-deprecated-classes`                          | oxlint-tailwindcss |
| Clases con una forma canónica                                                          | `<div className="-m-0">Card</div>`                             | —                                     | `enforce-canonical`                              | oxlint-tailwindcss |
| Un color de modo oscuro sin base para el modo claro                                    | `<div className="dark:bg-accent">Card</div>`                   | —                                     | `no-dark-without-light`                          | oxlint-tailwindcss |
| Orden de clases y variants                                                             | `<div className="p-4 flex">Card</div>`                         | —                                     | `enforce-sort-order`, `consistent-variant-order` | oxlint-tailwindcss |

<!-- /generated:shadcn-table -->

Cada ejemplo de arriba se linta con los dos plugins en un proyecto shadcn/ui mínimo, y la tabla se
verifica contra lo que reportan: la columna de este plugin en cada build, la de @shadcn/lint cada
semana contra su última versión. Donde la config combinada de abajo le deja un problema a uno de
ellos:

- **Clases desconocidas → oxlint-tailwindcss.** Los dos reportan una utility o una variant mal
  escrita con una sugerencia. Este plugin reporta además un nombre de clase que Tailwind no puede
  generar en absoluto (`line`), y un color del theme mal escrito con la misma regla, junto al color
  que querías (`bg-primray` → `bg-primary`). El `no-raw-colors` de @shadcn/lint también reporta ese
  color mal escrito, como un color del theme no declarado: es el único problema que los dos siguen
  reportando.
- **Valores arbitrarios → @shadcn/lint.** Los dos los reportan con un arreglo; `no-arbitrary-values`
  sugiere el valor exacto de la escala (`p-[13px]` → `p-3.25`). El `no-arbitrary-value` de este
  plugin está apagado en su config recomendada, y la config combinada apaga también
  `no-hardcoded-colors`, cuyos colores arbitrarios ya reporta `no-arbitrary-values`.
- **Clases armadas en runtime → las dos.** El `require-static-classes` de @shadcn/lint reporta un
  `className` que no puede leer en un componente, y que necesita para revisar su política; el
  `no-dynamic-classes` de este plugin reporta una clase armada en runtime en cualquier elemento,
  porque Tailwind no genera CSS para ella.
- **`prefer-theme-tokens` queda encendida** (en la config recomendada está apagada): los colores de
  shadcn/ui son variables CSS, y `bg-(--primary)` tiene una clase con nombre, `bg-primary`.

## La config combinada

```bash
pnpm add -D oxlint oxlint-tailwindcss @shadcn/lint
```

<!-- generated:shadcn-config -->

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["oxlint-tailwindcss", "@shadcn/lint"],
  "settings": {
    "tailwindcss": {
      "entryPoint": "app/globals.css"
    }
  },
  "rules": {
    // oxlint-tailwindcss: las reglas recomendadas, ajustadas para shadcn/ui
    "tailwindcss/no-conflicting-classes": "error",
    "tailwindcss/no-contradicting-variants": "warn",
    "tailwindcss/no-dark-without-light": "warn",
    "tailwindcss/no-duplicate-classes": "warn",
    "tailwindcss/no-dynamic-classes": "error",
    "tailwindcss/no-unknown-classes": "error",
    "tailwindcss/enforce-canonical": "warn",
    "tailwindcss/enforce-negative-arbitrary-values": "warn",
    "tailwindcss/no-deprecated-classes": "error",
    "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    "tailwindcss/prefer-theme-tokens": "warn",
    "tailwindcss/consistent-variant-order": "warn",
    "tailwindcss/enforce-consistent-important-position": "warn",
    "tailwindcss/enforce-consistent-variable-syntax": "warn",
    "tailwindcss/enforce-shorthand": "warn",
    "tailwindcss/enforce-sort-order": "warn",
    "tailwindcss/no-unnecessary-whitespace": "warn",
    // @shadcn/lint
    "shadcn/no-restyle": ["error", { "allow": ["layout"] }],
    "shadcn/no-raw-colors": "error",
    "shadcn/no-arbitrary-values": "error",
    "shadcn/no-inline-styles": "error",
    "shadcn/require-static-classes": "error"
  },
  "overrides": [
    {
      "files": ["components/ui/**"],
      "rules": { "shadcn/no-restyle": "off" }
    }
  ]
}
```

<!-- /generated:shadcn-config -->

- `entryPoint` es la hoja de estilos que `components.json` nombra en `tailwind.css`:
  `app/globals.css` en una app de Next.js, `src/index.css` en una de Vite.
- El override apaga `no-restyle` dentro del directorio de componentes, como piden las docs de
  @shadcn/lint, para que los componentes puedan estilar su interior. Apúntalo al tuyo si
  `components.json` los pone en otro lado (`aliases.ui`).
- Lo que acepta cada componente (`contracts`), los mensajes personalizados y el resto de la
  configuración de @shadcn/lint son suyos: mira
  [sus reglas](https://github.com/shadcn-ui/lint#rules).

## Lo que encuentra en shadcn/ui

Sobre los componentes del propio shadcn/ui (`apps/v4` en `98a1fe67`), `no-conflicting-classes`
reporta el trigger del select en `registry/new-york-v4/ui/select.tsx`:

```text
"*:data-[slot=select-value]:flex" overrides "*:data-[slot=select-value]:line-clamp-1" on "display".
"*:data-[slot=select-value]:flex" comes later in the generated stylesheet, so it wins no matter how
the class attribute is ordered. Remove one.
```

`line-clamp-1` trunca con `display: -webkit-box`, y el `display: flex` posterior lo reemplaza, así
que el clamp nunca se aplica: un valor seleccionado largo no lleva puntos suspensivos y se pasa del
ancho del trigger. [shadcn-ui/ui#11832](https://github.com/shadcn-ui/ui/pull/11832), un pull request
abierto que arregla ese desborde, describe la misma causa.

## Configurarlo, paso a paso

Para una persona o un agente, en un proyecto shadcn/ui:

1. Lee `components.json`: `tailwind.css` es el entry point, y `aliases.ui` es el directorio de
   componentes (`@/components/ui` → `components/ui/**`).
2. Instala `oxlint`, `oxlint-tailwindcss` y `@shadcn/lint` como dependencias de desarrollo, con el
   package manager del proyecto.
3. Escribe la config combinada en `.oxlintrc.json`, con `entryPoint` apuntando al entry point y los
   `files` del override al directorio de componentes. Si ya hay una config, combínalas: conserva sus
   reglas y agrega los plugins, el setting y las reglas de arriba.
4. Corre `oxlint`. `oxlint --fix` aplica los autofixes; el editor ofrece las sugerencias.
5. Deja la política de @shadcn/lint — qué acepta cada componente — a quien sea dueño del design
   system.
