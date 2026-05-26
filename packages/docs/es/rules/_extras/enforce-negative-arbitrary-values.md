## Qué hace esta regla

Detecta utilities escritas con un prefijo negativo afuera de un
bracket de valor arbitrario — `-top-[5px]`, `-translate-x-[10px]`,
`-mt-[8px]` — y mueve el signo negativo adentro del bracket:
`top-[-5px]`, `translate-x-[-10px]`, `mt-[-8px]`. El `-` exterior es
redundante una vez que tenés un valor arbitrario, y meterlo adentro
hace explícita la intención y matchea cómo `@tailwindcss/node`
canonicaliza la misma shape. El auto-fix corrige el primer hit, las
sugerencias cubren el resto en el mismo string. Los variants
(`hover:-mt-[8px]`) y el `!` (important, prefix o suffix) se
preservan.

La regla se dispara solo cuando se cumplen dos condiciones: la
utility empieza con `-` (después de pelar el `!`) Y hay un bracket
de valor arbitrario cuyo contenido interno **no** empieza con `-`.
Así que `top-[-5px]` y `-translate-x-1` (sin brackets) son correctos
tal como están.

Transform de strings puro — sin design system, sin worker, sin entry
point. Es la única regla del bucket Modernization que no carga el
DS. Va a correr igual tengas o no configurado
`settings.tailwindcss.entryPoint`.

## Opciones

Esta regla no tiene opciones. Aplica la misma transformación en todos
lados.

## Ejemplos

### ✗ Incorrecto

```tsx
// Negativo afuera del bracket — movelo adentro
<div className="-top-[5px] -left-[10px]" />

// Transform con valor arbitrario
<div className="-translate-x-[10px]" />

// Prefijo de variant preservado
<div className="hover:-mt-[8px]" />

// Modificador important preservado
<div className="!-top-[5px]" />
```

### ✓ Correcto

```tsx
// El negativo está adentro del bracket
<div className="top-[-5px] left-[-10px]" />

<div className="translate-x-[-10px]" />

<div className="hover:mt-[-8px]" />

<div className="!top-[-5px]" />

// Negativo sin valor arbitrario — está bien
<div className="-translate-x-1 -mt-4" />
```

## Interacciones con otras reglas

- **`enforce-canonical`**: complementaria. `enforce-canonical` también
  va a normalizar la forma canónica de arbitrarios negativos vía el
  worker; esta regla provee el mismo fix sin pagar el costo de
  cargar el DS. Si tenés ambas activas los autofixes convergen al
  mismo output.
- **`no-unnecessary-arbitrary-value`**: ortogonal. Esa regla se
  dispara solo cuando el valor arbitrario tiene un equivalente
  nombrado; esta se dispara haya o no.
- **`prefer-theme-tokens`**: ortogonal. Las referencias a theme-
  tokens (`bg-(--name)`) no llevan un negativo exterior, así que las
  dos nunca tocan la misma clase.

## Cuándo desactivarla

- **Preferís la forma con negativo exterior por legibilidad** en el
  call site (raro — la mayoría de equipos encuentran la forma con
  negativo interior más clara una vez que la ven).
- **Estás auto-generando strings de clases** que siempre emiten la
  forma con negativo exterior y no querés diagnósticos de lint en
  esa capa generada. Preferí desactivar la regla en el archivo
  generado antes que a nivel proyecto.
