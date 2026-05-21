# Migrando de v0.x a v1.0.0

v1.0.0 alinea `oxlint-tailwindcss` con la filosofía de config
determinista que el resto del ecosistema (prettier-plugin-tailwindcss,
oxfmt, better-tailwindcss) ya sigue. El trade-off es un setting
obligatorio a cambio de "configuralo una vez, no falla más".

Esta página lista cada breaking change con un before/after lado a
lado.

## Obligatorio: declarar `entryPoint`

En v0.x el plugin caminaba el filesystem buscando tu CSS. En v1.0.0
no lo hace — vos se lo decís explícitamente.

### Proyecto simple

```jsonc
// v0.x (sigue siendo válido en v1 si tenés uno, pero ya no se
// auto-detecta)
{ }

// v1.0.0
{
  "settings": {
    "tailwindcss": {
      "entryPoint": "src/styles.css"
    }
  }
}
```

### Monorepo con múltiples CSS

```jsonc
// v0.x — array de strings, el plugin elegía el más cercano por path
{
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        "packages/ui/src/styles.css",
        "packages/admin/src/admin.css"
      ]
    }
  }
}

// v1.0.0 — mapping explícito glob → CSS, primer match gana
{
  "settings": {
    "tailwindcss": {
      "entryPoint": [
        { "files": "packages/ui/**",    "use": "packages/ui/src/styles.css" },
        { "files": "packages/admin/**", "use": "packages/admin/src/admin.css" }
      ]
    }
  }
}
```

La forma legacy `string[]` ahora lanza
`DeprecatedEntryPointShapeError` en tiempo de lint, con el snippet
de migración embebido directamente en el diagnóstico.

Si tu monorepo usa un `.oxlintrc.json` por package, cada uno con un
`entryPoint: "..."` string plano, no necesitás migrar — solo cambió
la forma de config raíz + array. Ver la [guía de monorepo](/es/monorepo)
para ambos patrones.

## Removido: auto-detect del filesystem

v0 caminaba hacia arriba desde cada archivo lintado buscando archivos
llamados `app.css`, `globals.css`, `tailwind.css`, etc. Si los
encontraba, los cargaba automáticamente.

v1.0.0 remueve esto por completo. Dos razones:

1. Renombrar o mover un CSS cambiaba silenciosamente los resultados
   de lint entre miembros del equipo.
2. Chocaba con oxfmt y prettier-plugin-tailwindcss, que ambos
   requieren config explícita. La [guía de interop](/es/interop)
   explica el porqué.

**Acción**: agregá el setting `entryPoint` documentado arriba. Si no
pasabas ninguno en v0.x, el plugin estaba auto-detectando — necesitás
declarar qué encontraba.

## Removido: fallbacks silenciosos

v0.x saltaba reglas DS-dependientes silenciosamente cuando el design
system no podía cargarse (faltaba `@tailwindcss/node`, CSS inválido,
worker timeout, etc.).

v1.0.0 surfacea fallas como un único diagnóstico
`designSystemUnavailable` por archivo. El mensaje embebe un hint
accionable — usualmente la ruta exacta que el plugin intentó, o el
timeout que se alcanzó.

**Acción**: si ves diagnósticos nuevos `designSystemUnavailable` en
el primer run, leé el mensaje. El fix está en el hint.

## Removido: fallback heurístico de sort

`enforce-sort-order` solía caer a un sort heurístico basado en prefix
cuando su worker thread timeouteaba. Máquinas distintas podían
producir output distinto para el mismo input.

v1.0.0 remueve el fallback. Si el worker falla, la regla emite un
diagnóstico fatal en lugar de adivinar.

**Acción**: subí `settings.tailwindcss.timeout` si tenés timeouts en
CI lento. El default ahora es 60 segundos (subió desde 30).

## Cambiado: clave del disk cache

El disk cache (`os.tmpdir()/oxlint-tailwindcss/`) combinaba un mtime
index con un content cache. v1.0.0 usa solo content hash — el mtime
es un fast path in-memory dentro del proceso de linter.

**Acción**: borrá `os.tmpdir()/oxlint-tailwindcss/` una vez después
de actualizar. Los archivos `.idx` viejos son inofensivos pero
ocupan disco.

## Cambiado: timeouts

Defaults subidos para reducir failures espurios en hardware lento /
CI:

| Constante                                 | v0.x | v1.0.0 |
|-------------------------------------------|------|--------|
| `loadDesignSystemSync` timeout            | 30 s | 60 s   |
| `sort-service` init timeout               | 30 s | 60 s   |
| `sort-service` request timeout            | 10 s | 30 s   |
| `canonicalize-service` init timeout       | 30 s | 60 s   |
| `canonicalize-service` request timeout    | 10 s | 30 s   |

Todos se pueden sobrescribir vía `settings.tailwindcss.timeout`.

## Cambiado: `enforce-physical` acepta opciones

Para tener shape-parity con `enforce-logical`:

```jsonc
// v0.x — sin opciones
{ "tailwindcss/enforce-physical": "warn" }

// v1.0.0
{
  "tailwindcss/enforce-physical": [
    "warn",
    {
      "allowlist": ["^ml-auto$"],     // patrones regex (como strings)
      "direction": "both"              // 'inline' | 'block' | 'both'
    }
  ]
}
```

`enforce-logical` ganó las mismas dos opciones.

## Lo que **NO** cambió

- El nombre de cada regla, el `messageId` y los campos `data` están
  intactos. `enforce-sort-order` sigue emitiendo `unsorted`,
  `no-unknown-classes` sigue emitiendo `unknown`, etc.
- Los patrones default del extractor (attributes, callees, tags,
  variable patterns) son los mismos. Los settings custom
  `attributes`, `callees`, `tags`, `variablePatterns` y `exclude`
  funcionan como antes.
- La ruta del disk cache (`os.tmpdir()/oxlint-tailwindcss/`) es la
  misma.
- Performance: el costo runtime por archivo es igual o ligeramente
  más rápido (menos branches de fallback).

## ¿Necesitás ayuda?

- Leé la [referencia de settings](/es/settings) para cada opción.
- Mirá la [guía de monorepo](/es/monorepo) para setups multi-CSS.
- Abrí un issue en
  [github.com/sergioazoc/oxlint-tailwindcss](https://github.com/sergioazoc/oxlint-tailwindcss/issues)
  con tu config si la migración deja algo sin claridad.
