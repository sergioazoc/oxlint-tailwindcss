## Qué hace esta regla

Reporta un valor hardcodeado que es **numéricamente igual** a algo que tu design system ya nombra, y
sugiere el nombre — `p-[10px]` → `p-2.5`, `w-[140px]` → `w-35`, `rounded-[0.5rem]` → `rounded-lg`.

Existe porque las otras tres reglas de arbitrario→nombrado se apoyan cada una en algo que este caso
no cumple:

| Regla                            | Dispara en                              | Se apoya en               |
| -------------------------------- | --------------------------------------- | ------------------------- |
| `no-unnecessary-arbitrary-value` | `w-[100%]` → `w-full`                   | CSS byte-idéntico         |
| `enforce-canonical`              | lo que `canonicalizeCandidates` propone | lo mismo, desde #78       |
| `prefer-theme-tokens`            | `bg-(--primary)` → `bg-primary`         | el NOMBRE de una variable |
| **esta regla**                   | `p-[10px]` → `p-2.5`                    | **igualdad numérica**     |

`p-2.5` compila a `padding: calc(var(--spacing) * 2.5)` y `p-[10px]` a `padding: 10px`. Misma
longitud, texto distinto — así que ninguna regla que exija CSS idéntico puede reportarlo, y eso es
exactamente lo que cambió en [#78](https://github.com/sergioazoc/oxlint-tailwindcss/issues/78) al
volver conservador el autofix.

### Solo reporta, a propósito

**No hay autofix.** La equivalencia se cumple en _este_ tema: el token llega a su valor a través de
una variable CSS, así que un override en `:root` o un root font size distinto los separa. Reescribir
eso automáticamente es el bug que arregló #78. La regla reporta, ofrece el reemplazo como sugerencia
de editor, y lo dice en el mensaje.

### Qué cuenta como "igual"

Dos familias, las dos derivadas de tu design system — en esta regla no hay ninguna tabla de nombres:

- **La escala de spacing.** `--spacing` se lee de tu tema, y los prefijos de utility que la usan se
  descubren preguntando a qué compila `<prefix>-1`. `p-[10px]` ÷ `0.25rem` = 2.5 pasos → `p-2.5`.
- **Tokens del tema con nombre, por valor.** Para cada clase que emite exactamente una declaración
  cuyo valor entero es un solo `var(--x)`, el tema dice cuánto vale `--x`: `0.5rem` → `rounded-lg`.
  De esa forma salen dos restricciones que importan:
  - una clase que declara MÁS que el literal no es un equivalente, así que `text-[14px]` → `text-sm`
    **no** se reporta (`text-sm` además fija `line-height`);
  - un token de color nunca puede coincidir con un valor que escribió una persona, así que las ~7
    000 clases de color simplemente no son candidatas.

### Por qué hay una granularidad

Tailwind v4 compila _cualquier_ número: `w-8.425` es una clase válida. Así que toda longitud son N
unidades de spacing para algún N, y reportarlas todas haría que esta regla disparara en casi
cualquier valor arbitrario — que es para lo que está `no-arbitrary-value`.

El corte no es un número elegido aquí. Todos los pasos que la propia escala de Tailwind enumera
(`0`, `0.5`, `1`, `1.5`, `2`, `2.5`, `3`, `3.5`, `4`, `5`…`96`) son múltiplos de `0.5`, y el
precompute lo deriva de esos mismos pasos. `w-[140px]` → `w-35` sí se reporta (35 es un número
entero de pasos); `w-[33.7px]` → `w-8.425` no. Usa `step` para afinar.

## Opciones

### `entryPoint`

`string`, opcional. Un entry point CSS solo para esta regla, que pisa
`settings.tailwindcss.entryPoint`. Esta regla es DS-dependiente — todas las equivalencias salen del
design system, así que no hay fallback estático y la falta de entry point es un diagnóstico fatal
`designSystemUnavailable`.

### `step`

`number`, opcional. Por defecto, la granularidad derivada de la escala enumerada de tu tema (`0.5`
con el `--spacing` por defecto de Tailwind). Bájalo para reportar valores más finos:

```jsonc
// reporta también w-[33px] → w-8.25
{ "tailwindcss/prefer-scale-token": ["warn", { "step": 0.25 }] }
```

Subirlo vuelve la regla más callada (`step: 1` deja de reportar `p-[10px]` → `p-2.5`). No afecta a
los tokens del tema con nombre: esos coinciden por valor, no por granularidad.

### `allow`

`string[]`, default `[]`. Prefijos de utility a saltar, comparados con `startsWith` contra la
utility bare — la misma forma que la opción de `no-arbitrary-value`.

```jsonc
{ "tailwindcss/prefer-scale-token": ["warn", { "allow": ["grid-cols-", "bg-[url("] }] }
```

## Ejemplos

### ✗ Incorrecto

```tsx
// Valores que son pasos enteros de la escala de spacing
<div className="p-[10px] gap-[4px] mt-[6px]" />
//              ~~~~~~~~ ~~~~~~~~~ ~~~~~~~~  → p-2.5 gap-1 mt-1.5

// Fuera de la escala enumerada pero aún un paso entero — Tailwind compila w-35
<div className="w-[140px]" />
//              ~~~~~~~~~  → w-35

// Un token del tema, encontrado por su valor
<div className="rounded-[0.5rem] basis-[28rem]" />
//              ~~~~~~~~~~~~~~~~ ~~~~~~~~~~~~~  → rounded-lg basis-md

// Los variants y el `!` viajan con la clase
<div className="hover:p-[10px] p-[10px]!" />
```

### ✓ Correcto

```tsx
// El token en sí
<div className="p-2.5 rounded-lg w-35" />

// Más fino que la granularidad que usa la propia escala de Tailwind
<div className="w-[33px] w-[33.7px]" />

// Byte-idéntico a una clase nombrada — asunto de no-unnecessary-arbitrary-value
<div className="w-[100%] z-[10] p-[0px]" />

// text-sm además fija line-height, así que no es lo que dice text-[14px]
<div className="text-[14px]" />

// Una referencia a variable no tiene literal que comparar — eso lo mira prefer-theme-tokens
<div className="p-(--gutter) p-[var(--gutter)]" />

// No es una longitud, o el prefijo no lee la escala
<div className="w-[50%] grid-cols-[18rem_1fr] bg-[#ff0000]" />
```

## Interacciones con otras reglas

- **`enforce-canonical`**: esta regla es la mitad solo-reporte de lo que aquella cedió en #78. No
  pueden disparar las dos en la misma clase: todo lo que `enforce-canonical` reescribe es
  byte-idéntico, y la guardia `getNamedEquivalent` de esta regla salta exactamente esos casos.
- **`no-unnecessary-arbitrary-value`**: es la dueña de los casos byte-idénticos (`w-[100%]` →
  `w-full`). Misma guardia, misma razón.
- **`prefer-theme-tokens`**: es la dueña de los casos donde el usuario escribió una referencia a
  variable (`bg-(--primary)`), encontrada por NOMBRE. Esta regla solo mira literales.
- **`no-arbitrary-value`**: un superconjunto en espíritu — prohíbe los arbitrary values
  directamente. Si la usas, esta regla añade el mensaje específico de "y existe un token para este
  valor exacto".

La frontera entre las cuatro está fijada en
`tests/integration/prefer-theme-tokens-coexistence.test.ts`.

## Cuándo desactivarla

- **Usas píxeles a propósito** en un subsistema donde la escala es la unidad equivocada (un gráfico,
  un overlay sobre canvas, un widget de terceros embebido). Prefiere `allow` con esos prefijos.
- **No quieres el empujón.** Esta regla está apagada salvo que la actives: la equivalencia es real,
  pero actuar sobre ella es una convención, no un arreglo de corrección.
