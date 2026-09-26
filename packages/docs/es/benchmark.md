---
title: "Benchmark de plugins de lint para Tailwind CSS"
description: "oxlint-tailwindcss, @shadcn/lint y better-tailwindcss en apps/v4 de shadcn/ui: errores detectados, falsos positivos, velocidad y qué hacen sus fixes."
---

# Benchmark

Tres plugins de oxlint que lintan clases de Tailwind CSS, corridos sobre el mismo proyecto real y
los mismos errores sembrados, y juzgados por el propio Tailwind. Cada número de esta página se
genera desde
[`bench/results/latest.json`](https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/bench/results/latest.json),
que escribe
[`bench/score.mjs`](https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/bench/score.mjs); un
job semanal comprueba que una corrida nueva siga de acuerdo con él.

<!-- generated:bench-setup -->

- **Corpus**:
  [shadcn-ui/ui `apps/v4`](https://github.com/shadcn-ui/ui/tree/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4)
  @ `98a1fe67`, 880 archivos
- **Versiones**: oxlint-tailwindcss 1.13.0, @shadcn/lint 0.2.0, eslint-plugin-better-tailwindcss
  4.7.0; oxlint 1.85.0, tailwindcss 4.3.3
- **Máquina**: Apple M4 Pro, 12 cores, darwin 25.5.0, Node 24.19.0; mediana de 5 corridas

<!-- /generated:bench-setup -->

## Velocidad

Cada herramienta con todas sus reglas activas — y con su conjunto recomendado, cuando tiene uno —
bajo el mismo oxlint. Una corrida en caliente reutiliza la caché del design system de
oxlint-tailwindcss; una en frío parte sin ella, como la primera corrida en una máquina o en CI
([En CI](/es/ci) la conserva entre jobs). Las otras dos no tienen caché que enfriar.
better-tailwindcss es un plugin de ESLint, corrido con el soporte de oxlint para ellos, igual que
las otras dos.

<!-- generated:bench-speed -->

| Herramienta                      | Reglas       | En caliente | En frío | Diagnósticos |
| -------------------------------- | ------------ | ----------- | ------- | ------------ |
| oxlint-tailwindcss               | todas        | 1,3 s       | 9,0 s   | 2704         |
| oxlint-tailwindcss               | recomendadas | 1,1 s       | 9,0 s   | 352          |
| @shadcn/lint                     | todas        | 1,0 s       | —       | 2578         |
| eslint-plugin-better-tailwindcss | todas        | 30,9 s      | —       | 6284         |
| eslint-plugin-better-tailwindcss | recomendadas | 29,0 s      | —       | 705          |

<!-- /generated:bench-speed -->

## Errores sembrados

Archivos con los errores que las personas y los agentes cometen con Tailwind, en
[`bench/synthetic`](https://github.com/sergioazoc/oxlint-tailwindcss/tree/main/bench/synthetic):
colores de la paleta, valores arbitrarios, componentes reestilados y rearmados, conflictos, typos,
referencias con `var()`, clases deprecadas y armadas en runtime. Cada error está etiquetado con lo
que es, cada línea limpia como limpia, y las ambiguas sin etiqueta. Una herramienta atrapa un error
cuando reporta su línea con una regla para ese tipo de error, y da una falsa alarma cuando reporta
una línea limpia con algo que no sea una regla de estilo. Qué regla es para qué error sale de las
tablas de [shadcn/ui y @shadcn/lint](/es/shadcn) y de la
[guía de migración](/es/migration/from-better-tailwindcss), que un job semanal comprueba contra las
herramientas reales.

<!-- generated:bench-seeded -->

| Error                                                                                  | oxlint-tailwindcss | @shadcn/lint | eslint-plugin-better-tailwindcss |
| -------------------------------------------------------------------------------------- | ------------------ | ------------ | -------------------------------- |
| Un color de la paleta de Tailwind en vez de un color del theme                         | 8/8                | 6/8          | 0/8                              |
| Valores arbitrarios                                                                    | 8/8                | 8/8          | 0/8                              |
| Clases con una forma canónica                                                          | 3/3                | 3/3          | 2/3                              |
| Reestilar un componente del design system con `className`                              | 1/6                | 6/6          | 0/6                              |
| Componente rearmado con clases sueltas                                                 | 4/4                | 0/4          | 0/4                              |
| Clases que se pisan entre sí                                                           | 6/6                | 0/6          | 3/6                              |
| Clases duplicadas                                                                      | 1/1                | 0/1          | 1/1                              |
| Variant redundante o contradictoria                                                    | 1/1                | 0/1          | 0/1                              |
| Espacios de más                                                                        | 1/1                | 0/1          | 1/1                              |
| Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | 9/9                | 9/9          | 9/9                              |
| Una variable CSS donde el theme tiene una clase con nombre                             | 3/3                | 1/3          | 0/3                              |
| Clases deprecadas en Tailwind v4                                                       | 2/2                | 0/2          | 2/2                              |
| Longhands con un shorthand                                                             | 1/1                | 0/1          | 1/1                              |
| Un color de modo oscuro sin base para el modo claro                                    | 1/1                | 0/1          | 0/1                              |
| Clases armadas en runtime                                                              | 1/1                | 0/1          | 1/1                              |
| Estilos inline                                                                         | 0/1                | 1/1          | 0/1                              |
| **Todos los errores**                                                                  | **50/56**          | **34/56**    | **20/56**                        |
| Falsas alarmas en las líneas limpias                                                   | 0/6                | 0/6          | 0/6                              |

<!-- /generated:bench-seeded -->

Los archivos son de este proyecto, y cubren los errores para los que se hizo: lee la tabla por fila
— qué tipos de error cubre cada herramienta — más que por el total. Los componentes reestilados y
los estilos inline son solo de @shadcn/lint; [shadcn/ui y @shadcn/lint](/es/shadcn) tiene la config
que corre las dos.

::: details Cada línea etiquetada

<!-- generated:bench-seeded-lines -->

| Código                                                                                     | Error                                                                                  | oxlint-tailwindcss | @shadcn/lint | eslint-plugin-better-tailwindcss |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------ | ------------ | -------------------------------- |
| `<div className="flex bg-red-500 p-4">Sale</div>`                                          | Un color de la paleta de Tailwind en vez de un color del theme                         | ✓                  | ✓            | ✗                                |
| `<p className="text-gray-600">Subtitle</p>`                                                | Un color de la paleta de Tailwind en vez de un color del theme                         | ✓                  | ✓            | ✗                                |
| `<div className="border border-slate-200">Box</div>`                                       | Un color de la paleta de Tailwind en vez de un color del theme                         | ✓                  | ✓            | ✗                                |
| `<div className="bg-white">White</div>`                                                    | Un color de la paleta de Tailwind en vez de un color del theme                         | ✓                  | ✗            | ✗                                |
| `<div className="text-black">Black</div>`                                                  | Un color de la paleta de Tailwind en vez de un color del theme                         | ✓                  | ✗            | ✗                                |
| `<div className="bg-[#1a73e8] p-2">Hex</div>`                                              | Valores arbitrarios                                                                    | ✓                  | ✓            | ✗                                |
| `<div className="shadow-[0_1px_2px_rgba(0,0,0,0.1)]">Shadow</div>`                         | Valores arbitrarios                                                                    | ✓                  | ✓            | ✗                                |
| `<div className="text-[oklch(0.6_0.2_250)]">Oklch</div>`                                   | Valores arbitrarios                                                                    | ✓                  | ✓            | ✗                                |
| `<div className="hover:bg-blue-600/80">Hover raw</div>`                                    | Un color de la paleta de Tailwind en vez de un color del theme                         | ✓                  | ✓            | ✗                                |
| `<div className="bg-primary text-primary-foreground">OK token</div>`                       | limpia                                                                                 | ✓                  | ✓            | ✓                                |
| `<div className="p-[13px]">odd padding</div>`                                              | Valores arbitrarios                                                                    | ✓                  | ✓            | ✗                                |
| `<div className="w-[350px]">fixed width</div>`                                             | Valores arbitrarios                                                                    | ✓                  | ✓            | ✗                                |
| `<div className="text-[15px]">odd text</div>`                                              | Valores arbitrarios                                                                    | ✓                  | ✓            | ✗                                |
| `<div className="rounded-[10px]">odd radius</div>`                                         | Valores arbitrarios                                                                    | ✓                  | ✓            | ✗                                |
| `<div className="mt-[16px]">same as mt-4</div>`                                            | Clases con una forma canónica                                                          | ✓                  | ✓            | ✗                                |
| `<div className="top-[1px] relative">same as top-px</div>`                                 | Clases con una forma canónica                                                          | ✓                  | ✓            | ✓                                |
| `<div className="min-h-[100vh]">same as min-h-screen</div>`                                | Clases con una forma canónica                                                          | ✓                  | ✓            | ✓                                |
| `<div className="p-4">OK scale</div>`                                                      | limpia                                                                                 | ✓                  | ✓            | ✓                                |
| `<Card className="p-8 shadow-xl">`                                                         | Reestilar un componente del design system con `className`                              | ✗                  | ✓            | ✗                                |
| `<CardTitle className="text-2xl font-bold">Checkout</CardTitle>`                           | Reestilar un componente del design system con `className`                              | ✗                  | ✓            | ✗                                |
| `<CardContent className="mt-2">`                                                           | limpia                                                                                 | ✓                  | ✓            | ✓                                |
| `<Badge className="rounded-sm px-3 text-sm">New</Badge>`                                   | Reestilar un componente del design system con `className`                              | ✗                  | ✓            | ✗                                |
| `<Button className="p-4 rounded-full">Pay</Button>`                                        | Reestilar un componente del design system con `className`                              | ✗                  | ✓            | ✗                                |
| `<Button className="bg-blue-600 text-white hover:bg-blue-700">Buy</Button>`                | Reestilar un componente del design system con `className`                              | ✓                  | ✓            | ✗                                |
| `<Button className="mt-4 w-full">Allowed layout</Button>`                                  | limpia                                                                                 | ✓                  | ✓            | ✓                                |
| `<Button size="lg" variant="outline">Allowed props</Button>`                               | limpia                                                                                 | ✓                  | ✓            | ✓                                |
| `<button className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg…` | Componente rearmado con clases sueltas                                                 | ✓                  | ✗            | ✗                                |
| `<input className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3…` | Componente rearmado con clases sueltas                                                 | ✓                  | ✗            | ✗                                |
| `<div className="flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground…` | Componente rearmado con clases sueltas                                                 | ✓                  | ✗            | ✗                                |
| `<span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 …` | Componente rearmado con clases sueltas                                                 | ✓                  | ✗            | ✗                                |
| `<div className="line-clamp-1 flex">clamp broken</div>`                                    | Clases que se pisan entre sí                                                           | ✓                  | ✗            | ✗                                |
| `<div className="p-4 p-6">double padding</div>`                                            | Clases que se pisan entre sí                                                           | ✓                  | ✗            | ✓                                |
| `<div className="text-sm text-base">double size</div>`                                     | Clases que se pisan entre sí                                                           | ✓                  | ✗            | ✓                                |
| `<div className="block flex">double display</div>`                                         | Clases que se pisan entre sí                                                           | ✓                  | ✗            | ✓                                |
| `<div className="size-5 w-4">size vs width</div>`                                          | Clases que se pisan entre sí                                                           | ✓                  | ✗            | ✗                                |
| `<div className="flex flex items-center">duplicate</div>`                                  | Clases duplicadas                                                                      | ✓                  | ✗            | ✓                                |
| `<div className="pt-3 xl:pt-3">redundant variant</div>`                                    | Variant redundante o contradictoria                                                    | ✓                  | ✗            | ✗                                |
| `<div className="absolute sr-only">redundant position</div>`                               | Clases que se pisan entre sí                                                           | ✓                  | ✗            | ✗                                |
| `<div className="mt-2   mb-2">whitespace</div>`                                            | Espacios de más                                                                        | ✓                  | ✗            | ✓                                |
| `<div className="itms-center flex">typo items</div>`                                       | Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| `<div className="jusitfy-between flex">typo justify</div>`                                 | Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| `<div className="bg-primray">typo token</div>`                                             | Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| `<div className="text-muted-foregound">typo token 2</div>`                                 | Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| `<div className="rounded-huge">unknown radius</div>`                                       | Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| `<div className="flex-cols">unknown flex</div>`                                            | Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| `<div className="shadow-xxl">unknown shadow</div>`                                         | Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| `<div className="md:grids-col-2 grid">typo grid</div>`                                     | Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| `<div className="bg-chart-6">undeclared token</div>`                                       | Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| `<div className="bg-surface text-code-foreground">declared custom tokens OK</div>`         | limpia                                                                                 | ✓                  | ✓            | ✓                                |
| `<div className="bg-(--primary)">var ref to token</div>`                                   | Una variable CSS donde el theme tiene una clase con nombre                             | ✓                  | ✗            | ✗                                |
| `<div className="text-[var(--muted-foreground)]">bracket var to token</div>`               | Una variable CSS donde el theme tiene una clase con nombre                             | ✓                  | ✓            | ✗                                |
| `<div className="border-(--border) border">var to border token</div>`                      | Una variable CSS donde el theme tiene una clase con nombre                             | ✓                  | ✗            | ✗                                |
| `<div className="bg-gradient-to-r from-primary to-secondary">deprecated gradient</div>`    | Clases deprecadas en Tailwind v4                                                       | ✓                  | ✗            | ✓                                |
| `<div className="flex-shrink-0">deprecated shrink</div>`                                   | Clases deprecadas en Tailwind v4                                                       | ✓                  | ✗            | ✓                                |
| `<div className="h-4 w-4">shorthand size-4</div>`                                          | Longhands con un shorthand                                                             | ✓                  | ✗            | ✓                                |
| `<div className="dark:hover:bg-accent">variant order</div>`                                | Un color de modo oscuro sin base para el modo claro                                    | ✓                  | ✗            | ✗                                |
| `danger: "bg-red-500 text-white",`                                                         | Un color de la paleta de Tailwind en vez de un color del theme                         | ✓                  | ✓            | ✗                                |
| `info: "bg-[#0ea5e9] text-white",`                                                         | Valores arbitrarios                                                                    | ✓                  | ✓            | ✗                                |
| `<div className={`bg-${color}-500 p-2`}>template</div>`                                    | Clases armadas en runtime                                                              | ✓                  | ✗            | ✓                                |
| `<div className={cn("p-2", active && "bg-emerald-500")}>cn cond</div>`                     | Un color de la paleta de Tailwind en vez de un color del theme                         | ✓                  | ✓            | ✗                                |
| `<Button className={cn(active && "rounded-none")}>cn on component</Button>`                | Reestilar un componente del design system con `className`                              | ✗                  | ✓            | ✗                                |
| <span v-pre>`<div style={{ color: "#f00", padding: 12 }}>inline style</div>`</span>        | Estilos inline                                                                         | ✗                  | ✓            | ✗                                |

<!-- /generated:bench-seeded-lines -->

:::

## Código real, juzgado por Tailwind

En el corpus, un reporte se puede comprobar contra el propio Tailwind. Un reporte de clase
desconocida de una clase que Tailwind compila está mal seguro. Uno de una clase que define una hoja
de estilos del proyecto muy probablemente también: la clase estila algo, solo que no a través de
Tailwind. Un reporte de conflicto de dos clases que no ponen ninguna propiedad en el mismo contexto
de variants no tiene conflicto que reportar.

<!-- generated:bench-oracles -->

| Herramienta                      | Reportes de clase desconocida | …de clases que Tailwind compila | …de clases que define una hoja de estilos del proyecto | Reportes de conflicto | …de clases que no comparten ninguna propiedad |
| -------------------------------- | ----------------------------- | ------------------------------- | ------------------------------------------------------ | --------------------- | --------------------------------------------- |
| oxlint-tailwindcss               | 77                            | 0                               | 18                                                     | 20                    | 0                                             |
| @shadcn/lint                     | 34                            | 0                               | 18                                                     | —                     | —                                             |
| eslint-plugin-better-tailwindcss | 97                            | 0                               | 38                                                     | 0                     | 0                                             |

<!-- /generated:bench-oracles -->

## Qué hacen los fixes

El `--fix` de cada herramienta, y después `--fix --fix-suggestions`, aplicados al corpus. Cada
string de clases que un fix cambió se compara por su estilo efectivo antes y después — el valor con
el que termina cada propiedad, en cada contexto de variants. Es el mismo estilo; un typo corregido,
cuando una clase que Tailwind no conocía se reemplaza por una que agrega solo sus propias
declaraciones; o un estilo cambiado, listado abajo con su antes y su después. Las propiedades
lógicas y físicas se leen de izquierda a derecha, los valores del theme se sustituyen y los bloques
`@supports` aplican, como en los navegadores que soporta Tailwind v4.

<!-- generated:bench-fixes -->

| Herramienta                      | Corrida                   | Strings de clases cambiados | Mismo estilo | Typo corregido | Estilo cambiado |
| -------------------------------- | ------------------------- | --------------------------- | ------------ | -------------- | --------------- |
| oxlint-tailwindcss               | `--fix`                   | 670                         | 670          | 0              | 0               |
| oxlint-tailwindcss               | `--fix --fix-suggestions` | 866                         | 861          | 4              | **1**           |
| @shadcn/lint                     | `--fix`                   | sin autofix                 | —            | —              | —               |
| @shadcn/lint                     | `--fix --fix-suggestions` | 249                         | 212          | 3              | **34**          |
| eslint-plugin-better-tailwindcss | `--fix`                   | 2865                        | 2864         | 0              | **1**           |
| eslint-plugin-better-tailwindcss | `--fix --fix-suggestions` | 2865                        | 2864         | 0              | **1**           |

<!-- /generated:bench-fixes -->

<!-- generated:bench-fix-changes -->

::: details oxlint-tailwindcss: 1 string cuyo estilo `--fix --fix-suggestions` cambió

- `components/block-viewer.tsx`

  ```diff
  - relative hidden w-3 bg-transparent p-0 after:absolute after:top-1/2 after:right-0 after:h-8 after:w-[6px] after:translate-x-[-1px] after:-translate-y-1/2 after:rounded-full after:bg-border after:transition-all after:hover:h-10 md:block
  + relative hidden w-3 bg-transparent p-0 after:absolute after:top-1/2 after:right-0 after:h-8 after:w-[6px] after:translate-x-[-1px] after:-translate-y-1/2 after:rounded-full after:bg-border after:transition-all hover:after:h-10 md:block
  ```

  `&::after > &:hover > @media (hover: hover) | height`: `40px` → ninguno  
  `@media (hover: hover) > &:hover::after | content`: ninguno → `var(--tw-content)`  
  `@media (hover: hover) > &:hover::after | height`: ninguno → `40px`

:::

::: details @shadcn/lint: 34 strings cuyo estilo `--fix --fix-suggestions` cambió

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - cn-menu-target z-50 no-scrollbar max-h-(--available-height) w-[calc(var(--available-width)-(--spacing(6)))] min-w-32 origin-(--transform-origin) translate-y-2 overflow-x-hidden overflow-y-auto rounded-xl border-0 bg-neutral-950/80 p-1.5 text-neutral-100 ring-1 ring-neutral-950/80 backdrop-blur-xl outline-none md:w-52 dark:bg-neutral-800/90 dark:ring-neutral-700/50 data-closed:overflow-hidden
  + cn-menu-target z-50 no-scrollbar max-h-(--available-height) w-[calc(var(--available-width)-(--spacing(6)))] min-w-32 origin-(--transform-origin) translate-y-2 overflow-x-hidden overflow-y-auto rounded-xl border-0 bg-sidebar-primary/80 p-1.5 text-neutral-100 ring-1 ring-neutral-950/80 backdrop-blur-xl outline-none md:w-52 dark:bg-neutral-800/90 dark:ring-neutral-700/50 data-closed:overflow-hidden
  ```

  `& | background-color`: `color-mix(in oklab, oklch(14.5% 0 none) 80%, transparent)` →
  `color-mix(in oklab, var(--sidebar-primary) 80%, transparent)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - px-2 py-1.5 text-xs font-medium text-neutral-400 data-inset:pl-8
  + px-2 py-1.5 text-xs font-medium text-ring data-inset:pl-8
  ```

  `& | color`: `oklch(70.8% 0 none)` → `var(--ring)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - group/dropdown-menu-item relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium outline-hidden select-none **:text-neutral-100 focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
  + group/dropdown-menu-item relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium outline-hidden select-none **:text-muted focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
  ```

  `& * | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - relative flex cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm font-medium outline-hidden select-none **:text-neutral-100 focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
  + relative flex cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm font-medium outline-hidden select-none **:text-muted focus:bg-neutral-600 focus:text-neutral-100 focus:**:text-neutral-100 data-inset:pl-8 dark:focus:bg-neutral-700/80 pointer-coarse:gap-3 pointer-coarse:py-2.5 pointer-coarse:pl-3 pointer-coarse:text-base data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4
  ```

  `& * | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - -mx-1.5 my-1.5 h-px bg-neutral-600 dark:bg-neutral-700
  + -mx-1.5 my-1.5 h-px bg-muted-foreground dark:bg-neutral-700
  ```

  `& | background-color`: `oklch(43.9% 0 none)` → `var(--muted-foreground)`

- `app/(app)/(create)/components/picker.tsx`

  ```diff
  - ml-auto text-xs tracking-widest text-neutral-400! group-focus/dropdown-menu-item:text-neutral-100
  + ml-auto text-xs tracking-widest text-ring! group-focus/dropdown-menu-item:text-neutral-100
  ```

  `& | color`: `oklch(70.8% 0 none) !important` → `var(--ring) !important`

- `app/(app)/(create)/components/project-form.tsx`

  ```diff
  - size-4 text-neutral-100 [&_svg]:size-4 [&_svg]:fill-current
  + size-4 text-muted [&_svg]:size-4 [&_svg]:fill-current
  ```

  `& | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/project-form.tsx`

  ```diff
  - size-4 text-neutral-100 [&_svg]:size-4 *:[svg]:text-neutral-100!
  + size-4 text-muted [&_svg]:size-4 *:[svg]:text-neutral-100!
  ```

  `& | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/project-form.tsx`

  ```diff
  - size-4 shrink-0 text-neutral-100 [&_svg]:size-4 *:[svg]:text-neutral-100!
  + size-4 shrink-0 text-muted [&_svg]:size-4 *:[svg]:text-neutral-100!
  ```

  `& | color`: `oklch(97% 0 none)` → `var(--muted)`

- `app/(app)/(create)/components/welcome-dialog.tsx`

  ```diff
  - dialog-ring max-w-92 min-w-0 gap-0 overflow-hidden rounded-xl p-0 sm:max-w-sm dark:bg-neutral-900
  + dialog-ring max-w-92 min-w-0 gap-0 overflow-hidden rounded-xl p-0 sm:max-w-sm dark:bg-sidebar-primary
  ```

  `&.dark * | background-color`: `oklch(20.5% 0 none)` → `var(--sidebar-primary)`

- `app/(app)/(create)/components/welcome-dialog.tsx`

  ```diff
  - flex aspect-[2/1.2] w-full items-center justify-center rounded-t-xl bg-neutral-950 text-center text-neutral-100 sm:aspect-2/1
  + flex aspect-[2/1.2] w-full items-center justify-center rounded-t-xl bg-sidebar-primary text-center text-neutral-100 sm:aspect-2/1
  ```

  `& | background-color`: `oklch(14.5% 0 none)` → `var(--sidebar-primary)`

- `app/(app)/(styles)/sera/components/theme-switcher.tsx`

  ```diff
  - w-full max-w-[60vw] rounded-full border-0 bg-neutral-950/50 p-1.5 shadow-xl backdrop-blur-xl sm:max-w-fit
  + w-full max-w-[60vw] rounded-full border-0 bg-sidebar-primary/50 p-1.5 shadow-xl backdrop-blur-xl sm:max-w-fit
  ```

  `& | background-color`: `color-mix(in oklab, oklch(14.5% 0 none) 50%, transparent)` →
  `color-mix(in oklab, var(--sidebar-primary) 50%, transparent)`

…y 22 más

:::

::: details eslint-plugin-better-tailwindcss: 1 string cuyo estilo `--fix` cambió

- `app/(app)/examples/playground/page.tsx`

  ```diff
  - h-5 w-5
  + block-5
  ```

  `& | width`: `20px` → ninguno

:::
<!-- /generated:bench-fix-changes -->

## Córrelo tú

```bash
git clone https://github.com/sergioazoc/oxlint-tailwindcss
cd oxlint-tailwindcss
pnpm install && pnpm build
cd bench
npm ci && npm run corpus
node score.mjs   # escribe results/latest.json
```

[`bench/README.md`](https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/bench/README.md)
tiene los detalles: las configs con las que corre cada herramienta, cómo se etiquetan los archivos
sembrados y cómo decide cada oráculo.

## Lo que no mide

- **Un solo proyecto.** Una app de React con Tailwind v4 y shadcn/ui; otro código tiene otros
  errores.
- **Los archivos sembrados son de este proyecto**, así que se inclinan hacia lo que revisa. Sus
  etiquetas están en los archivos, para que cualquiera las discuta.
- **Strings de clases, no páginas.** Los oráculos ven lo que un string de clases le hace a su
  elemento, no lo que un padre con `group-*` o un script hacen con una clase.
- **Velocidad en una máquina.** Compara las herramientas entre sí, no con tu máquina.
