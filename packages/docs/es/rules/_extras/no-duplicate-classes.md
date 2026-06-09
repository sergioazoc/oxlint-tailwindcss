## Qué hace esta regla

Reporta la misma clase apareciendo más de una vez en la misma lista de clases, y autofixea quitando
la segunda ocurrencia (y las que sigan). `flex flex` es siempre peso muerto — no hay discusión sobre
cuál gana, no hay sombreo, no hay override; la segunda es puramente un accidente de tipeo.

La comparación es por token exacto, así que `hover:flex hover:flex` es un duplicado pero
`flex hover:flex` NO lo es — el último es una clase distinta aunque compartan la utility (y es
territorio de `no-contradicting-variants`). El fix preserva el whitespace que introdujo
`enforce-consistent-line-wrapping`, así que un string de clases multilínea conserva su indentación.

La regla recorre la misma superficie de extracción que cualquier otra: atributos `className` /
`class`, los 14 callees por defecto (`cn`, `clsx`, `cva`, `twMerge`, `tv`, `cx`, `classnames`,
`ctl`, `twJoin`, `cc`, `clb`, `cnb`, `objstr`, `classed`), tagged templates como `` tw`...` ``,
valores objeto en JSX (`classNames={ { root: "..." } }`) y variables que matchean los patrones de
nombre por defecto (`className`, `classNames`, `classes`, `style`, `styles`). La extracción profunda
para `cva` / `tv` / `classed` cubre `base`, `slots`, `variants`, `compoundVariants` y
`compoundSlots`.

## Opciones

(sin opciones — la superficie de extractor viene de `settings.tailwindcss`)

## Ejemplos

### ✗ Incorrecto

```tsx
// Duplicado trivial
<div className="flex flex items-center" />

// Duplicado con variante — mismo token, dos veces
<div className="hover:flex hover:flex items-center" />

// Triple duplicado — dos diagnósticos, el fix colapsa a una
<div className="flex flex flex" />

// Dentro de helpers
cn("flex flex items-center")
cva("flex flex", {})
tv({ slots: { header: "p-2 p-2" } })

// Template literal — el whitespace alrededor se preserva
<div className={`flex flex items-center ${x}`} />
```

### ✓ Correcto

```tsx
// Misma utility, variantes distintas — NO es duplicado
<div className="flex hover:flex dark:flex" />

// Valores distintos
<div className="p-4 m-2 text-red-500" />

// Dentro de helpers
cn("flex", "items-center")
tv({ slots: { header: "p-2", body: "p-4" } })
```

## Interacciones con otras reglas

- **`no-contradicting-variants`**: `flex flex` es esta regla; `flex hover:flex` es
  `no-contradicting-variants`. Mantén ambas activas — cubren shapes disjuntos.
- **`no-conflicting-classes`**: un duplicado es un conflicto degenerado (la misma clase pega en la
  misma propiedad, trivialmente). El camino de duplicado aquí es más rápido y produce un mensaje más
  claro, así que esta regla reporta primero; `no-conflicting-classes` no aporta nada arriba.
- **`enforce-sort-order`**: ordenar después de deduplicar es el pipeline natural. Ambas autofixean,
  así que pueden correr en la misma pasada de lint.
- **`enforce-consistent-line-wrapping`**: el autofix preserva los newlines + la indentación que
  introdujo la regla de wrapping, así que las dos componen limpio en strings de clases multilínea.

## Cuándo desactivarla

- **Básicamente nunca.** Un duplicado literal siempre está mal y el fix es mecánico. Si la regla
  está marcando algo que no es un duplicado real, el bug está en la config del extractor — ajusta
  `settings.tailwindcss` (e.g. `exclude.attributes`, `exclude.callees`, `exclude.variablePatterns`)
  para que el string parecido no se trate como lista de clases.
- **Código generado** en tests o fixtures que arma un duplicado a propósito para ejercitar tooling
  downstream — desactiva por archivo.
