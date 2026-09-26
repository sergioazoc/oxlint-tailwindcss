---
title: "oxlint-tailwindcss, @shadcn/lint y better-tailwindcss comparados"
description: "Qué revisa cada uno de oxlint-tailwindcss, @shadcn/lint y eslint-plugin-better-tailwindcss, medido sobre el mismo código, y cuál usar cuándo."
---

# Frente a otros plugins

Tres plugins lintan clases de Tailwind CSS con oxlint:
[@shadcn/lint](https://github.com/shadcn-ui/lint), la política de design system de shadcn/ui para
sus componentes;
[eslint-plugin-better-tailwindcss](https://github.com/schoero/eslint-plugin-better-tailwindcss), un
plugin de ESLint que oxlint puede correr; y este. Se solapan menos de lo que sugieren sus nombres.
Los números de abajo son los del [benchmark](/es/benchmark), generados desde el mismo archivo de
resultados.

## De un vistazo

<!-- generated:comparison-summary -->

| Resumen                                  | oxlint-tailwindcss 1.13.0 | @shadcn/lint 0.2.0 | eslint-plugin-better-tailwindcss 4.7.0 |
| ---------------------------------------- | ------------------------- | ------------------ | -------------------------------------- |
| Errores sembrados atrapados              | 50/56                     | 34/56              | 20/56                                  |
| Falsas alarmas en líneas limpias         | 0/6                       | 0/6                | 0/6                                    |
| En caliente, todas las reglas            | 1,3 s                     | 1,0 s              | 30,9 s                                 |
| Clases desconocidas que Tailwind compila | 0/77                      | 0/34               | 0/97                                   |
| `--fix`: strings cuyo estilo cambió      | 0/670                     | sin autofix        | 1/2865                                 |

<!-- /generated:comparison-summary -->

Los errores sembrados son los [archivos etiquetados del benchmark](/es/benchmark#errores-sembrados),
y se inclinan hacia lo que revisa este plugin. Las "clases desconocidas que Tailwind compila" son
reportes que el propio Tailwind prueba que están mal, y los "strings cuyo estilo cambió" son strings
de clases a los que un `--fix` desatendido les cambió el aspecto.

## Qué revisa cada uno

Un ✓ significa que el plugin tiene una regla para eso; cuáles, está en las tablas de
[shadcn/ui y @shadcn/lint](/es/shadcn) y de la
[guía de migración](/es/migration/from-better-tailwindcss).

<!-- generated:comparison-coverage -->

| Error                                                                                  | oxlint-tailwindcss | @shadcn/lint | eslint-plugin-better-tailwindcss |
| -------------------------------------------------------------------------------------- | ------------------ | ------------ | -------------------------------- |
| Reestilar un componente del design system con `className`                              | —                  | ✓            | —                                |
| Estilos inline                                                                         | —                  | ✓            | —                                |
| Un color de la paleta de Tailwind en vez de un color del theme                         | ✓                  | ✓            | —                                |
| Valores arbitrarios                                                                    | ✓                  | ✓            | —                                |
| Una variable CSS donde el theme tiene una clase con nombre                             | ✓                  | —            | —                                |
| Clases que Tailwind no puede generar: typos en utilities, variants y colores del theme | ✓                  | ✓            | ✓                                |
| Clases armadas en runtime                                                              | ✓                  | ✓            | ✓                                |
| Clases que se pisan entre sí                                                           | ✓                  | —            | ✓                                |
| Clases duplicadas                                                                      | ✓                  | —            | ✓                                |
| Clases deprecadas en Tailwind v4                                                       | ✓                  | —            | ✓                                |
| Un color de modo oscuro sin base para el modo claro                                    | ✓                  | —            | —                                |
| Componente rearmado con clases sueltas                                                 | ✓                  | —            | —                                |
| Variant redundante o contradictoria                                                    | ✓                  | —            | —                                |
| Valor arbitrario que está en la escala                                                 | ✓                  | —            | —                                |
| Clases con una forma canónica                                                          | ✓                  | —            | ✓                                |
| Orden de clases y variants                                                             | ✓                  | —            | ✓                                |
| Espacios de más                                                                        | ✓                  | —            | ✓                                |
| Longhands con un shorthand                                                             | ✓                  | —            | ✓                                |
| Otras políticas de estilo                                                              | ✓                  | —            | ✓                                |

<!-- /generated:comparison-coverage -->

## Cuál usar

- **oxlint-tailwindcss** revisa las clases contra tu design system: que existan, que no se pisen
  entre sí, que no estén deprecadas y que no salgan de tu theme. Lee tu build de Tailwind, así que
  sus reportes y sus fixes coinciden con lo que Tailwind genera. Es solo un plugin de oxlint.
- **@shadcn/lint** hace cumplir la política de componentes de shadcn/ui — no reestilar un componente
  con `className`, no usar estilos inline —, que este plugin no revisa. Las dos corren juntas:
  [shadcn/ui y @shadcn/lint](/es/shadcn) tiene una config combinada que reporta cada problema una
  sola vez.
- **eslint-plugin-better-tailwindcss** es la opción para un proyecto que se queda en ESLint. Con
  oxlint, oxlint-tailwindcss tiene una regla para cada una de las suyas, y corre más rápido:
  [la guía de migración](/es/migration/from-better-tailwindcss) mapea las reglas y sus settings.
