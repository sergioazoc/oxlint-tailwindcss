## Qué hace esta regla

El veto manual. Te deja bloquear clases específicas de Tailwind — por nombre exacto o por patrón
regex — y mostrar un mensaje configurable explicando por qué. Sin design system, sin heurísticas: si
la clase matchea, la regla dispara.

Usos típicos: dejar atrás utilities legacy que un refactor quiere sacar (`float-*` en codebases
solo-flexbox), mantener un color de brand deprecado fuera del código nuevo, prohibir hacks de
visibilidad (`hidden` en todos lados menos en un componente puntual), o poner en cuarentena
utilities hasta que termine una migración.

DS-independiente — no requiere `entryPoint`. No hay autofix: la regla reporta y deja al developer
elegir el reemplazo (suele ser específico al contexto).

Sin opciones, la regla es no-op. Configura al menos una de `classes` o `patterns` para activarla.

## Opciones

### `classes`

`string[]`, default `[]`.

Nombres exactos de clases a prohibir. Los matches son literales — `"hidden"` matchea la clase bare
`hidden` y la misma clase en cualquier parte de un class string (`"flex hidden items-center"`), pero
_no_ matchea `"sr-hidden"` ni `"hover:hidden"`. Úsalo para una ban list chica y explícita.

```jsonc
{
  "tailwindcss/no-restricted-classes": ["error", {
    "classes": ["hidden", "block"]
  }]
}
```

### `patterns`

`Array<{ pattern: string; message?: string }>`, default `[]`.

Una lista de patrones regex (pasados como strings, compilados con `new RegExp`) con un mensaje
opcional. Úsalo cuando quieres prohibir una familia entera (`^float-`, `^text-(red|orange)-`) o
cuando una lista literal explotaría. Los patrones se testean contra la clase completa incluyendo
variants, así que `^hover:bg-red-` matchea `hover:bg-red-500`. Los mensajes custom aparecen después
del nombre de la clase y hacen que el diagnóstico sea accionable.

```jsonc
{
  "tailwindcss/no-restricted-classes": ["error", {
    "patterns": [
      { "pattern": "^float-", "message": "Usa flexbox o grid" },
      { "pattern": "^text-(red|orange)-", "message": "Usa tokens semánticos" }
    ]
  }]
}
```

Si una clase matchea tanto `classes` como un pattern, gana el match exacto y la regla reporta una
sola vez. Si no, gana el primer pattern que matchea.

## Ejemplos

### ✗ Incorrecto

```tsx
// Clase exacta prohibida
<div className="hidden" />
// con options.classes: ["hidden"]

// Prohibida en el medio de un class string
<div className="flex hidden items-center" />

// Prohibida vía pattern con mensaje custom
<div className="float-left" />
// con patterns: [{ pattern: "^float-", message: "Usa flexbox" }]
// → '"float-left" is restricted: Usa flexbox'

// Adentro de una llamada cn()
cn("float-right")
```

### ✓ Correcto

```tsx
// Sin restricciones configuradas → la regla está muda
<div className="hidden" />

// Clase fuera de la ban list
<div className="flex items-center" />

// El variant cambia la clase — `hover:hidden` no matchea `hidden`
<div className="hover:hidden" />
```

## Interacciones con otras reglas

- **`no-unknown-classes`**: ortogonal. Esa regla atrapa clases inválidas; esta prohibe clases
  _válidas_ que tú decidiste bloquear. Ambas deberían estar activas.
- **`no-deprecated-classes`**: cubre automáticamente las deprecaciones conocidas de Tailwind v3 →
  v4. Usa esta regla para las deprecaciones _propias_ de tu proyecto.
- **`no-arbitrary-value` / `no-hardcoded-colors`**: prohíben categorías que esta regla no expresa
  cómodamente en una lista. Si tu ban list se está volviendo un patrón, esas reglas probablemente
  hagan mejor el trabajo.

## Cuándo desactivarla

- **Repos sin ban list**: no la actives — dejarla con opciones vacías es no-op pero le mete ruido a
  la review de config.
- **Excepciones legacy por archivo**: prefiere
  `// oxlint-disable-next-line tailwindcss/no-restricted-classes` antes que desactivar globalmente,
  así el resto del codebase mantiene el enforcement.
- **Ventanas de migración** donde la ban list cambia día por medio: bajala a `warn`, terminá el
  cleanup, y vuelve a `error` cuando la lista se estabilice.
