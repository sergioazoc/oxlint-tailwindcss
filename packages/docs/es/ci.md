---
title: En CI
description: "Corre oxlint-tailwindcss en CI: anotaciones en el pull request, el precompute del design system en caché entre jobs, tiempos por regla y en qué confiar."
---

# En CI

No hay nada específico de CI: instala, apunta [`entryPoint`](/es/settings#entrypoint-obligatorio) a
tu CSS y corre `oxlint`. El resto de esta página lo hace más rápido y más fácil de leer.

## Anotaciones en el pull request

`oxlint -f github` imprime cada diagnóstico como una anotación de GitHub Actions, así aparece en
línea en el diff del pull request:

```text
::error file=src/Button.tsx,line=1,endLine=1,col=39,endColumn=62,title=tailwindcss(no-unknown-classes)::src/Button.tsx:1:39: "itms-center" is not a valid Tailwind class. Did you mean "items-center"?
```

## Caché del design system entre jobs

La primera vez que el plugin ve un entry point CSS precomputa ese design system — cada clase que
Tailwind puede generar para él, con su CSS — y guarda el resultado en una caché en disco. Las
corridas siguientes lo leen de vuelta y se saltan ese paso. El precompute es casi todo lo que cuesta
una corrida en frío: en `apps/v4` de shadcn/ui, con todas las reglas activas, una corrida en frío
tarda varias veces lo que una en caliente.

Un runner hospedado por GitHub arranca cada job en una máquina nueva, así que cada job paga el
arranque en frío. Pon la caché en un directorio que conserves entre jobs, con la variable de entorno
`OXLINT_TAILWINDCSS_CACHE_DIR`:

```yaml
- uses: actions/cache@v6
  with:
    path: ~/.cache/oxlint-tailwindcss
    key: oxlint-tailwindcss-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml', 'src/**/*.css') }}

- run: OXLINT_TAILWINDCSS_CACHE_DIR="$HOME/.cache/oxlint-tailwindcss" npx oxlint -f github
```

- El plugin crea el directorio si no existe. La variable toma la ruta tal cual — `~` no se expande,
  por eso el paso usa `$HOME`.
- Una corrida que encuentra su design system en la caché no lo vuelve a calcular. El directorio
  también guarda la forma canónica de cada clase con valor arbitrario que encuentran las reglas
  (`p-[2px]`), así que crece un poco a medida que crece tu código; esa parte solo ahorra tiempo. Los
  archivos que el plugin no usó en 30 días se borran cada vez que calcula un design system nuevo,
  así que una caché restaurada corrida tras corrida no acumula los viejos.
- La key de arriba cambia con el lockfile (que fija la versión de Tailwind y de sus plugins) y con
  tu CSS. Ajusta el glob de CSS a donde viven tus hojas de estilo.

## Qué cuesta cada regla

`--debug timings` imprime una tabla por regla después del lint. Las reglas de plugins JS, como
estas, aparecen desde oxlint 1.84:

```bash
npx oxlint -f default --debug timings
```

```text
Rule timings:
Rule                               Time (ms)  Relative  Calls  Source
--------------------------------  ----------  --------  -----  ---------
tailwindcss/no-unknown-classes        87.440     99.5%      2  js-plugin
tailwindcss/no-duplicate-classes       0.467      0.5%      2  js-plugin
```

No imprime nada con `-f github`: córrelo como un paso aparte, o en local, con el formato por
defecto.

## En qué confiar

La caché guarda datos sobre los que actúan las reglas — incluido a qué reescriben las clases los
autofixes. Trátala como cualquier otro artefacto de build:

- Restaura solo cachés que guardaron tus propios workflows.
- No apuntes `OXLINT_TAILWINDCSS_CACHE_DIR` a un directorio donde puedan escribir otros usuarios o
  jobs. Un directorio que crea el plugin es privado para su dueño (`0700`).

El plugin revisa la forma de cada archivo de caché que lee y recalcula el que esté corrupto o
truncado, así que una caché mala cuesta un arranque en frío, no un crash.

Mira también la referencia de [variables de entorno](/es/settings#variables-de-entorno).
