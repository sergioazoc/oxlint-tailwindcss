# Auditoría completa — oxlint-plugin-tailwindcss

**Fecha:** 2026-06-09 **Versión auditada:** `oxlint-tailwindcss@1.2.0` (commit `e452592`)
**Alcance:** monorepo completo — capa design-system, 23 reglas + utils, suite de tests,
empaquetado/CI, documentación (EN/ES) y seguridad/robustez.

## Resumen ejecutivo

El proyecto está **sano en su línea base**: `typecheck`, `lint`, `format:check` y `build` pasan sin
errores, y la suite ejecuta **1098 tests en 52 archivos, todos en verde** (~11.5 s). La arquitectura
(extractores compartidos, lazy options, fail-loud, puente sync/async vía worker_threads + Atomics)
está aplicada de forma consistente y las violaciones de invariantes son puntuales y localizadas.

Los hallazgos se concentran en cuatro focos:

1. **Autofixes que pueden cambiar semántica o corromper código** (lo más urgente: tocan el código
   del usuario). Dos hallazgos altos en reglas.
2. **Robustez de la capa design-system bajo fallo y concurrencia**: `lastError` sticky roto, caché
   corrupto irrecuperable, invalidación que ignora `@import`, crash-sin-señal del precompute.
3. **Seguridad de la caché en disco**: directorio en `tmpdir` compartido, nombre predecible, sin
   validación de esquema ni control de propiedad — y los datos alimentan autofixes.
4. **Higiene de release/CI y documentación**: permisos de workflows, matriz de Node, voseo en la
   documentación en español, y un puñado de discrepancias doc↔código.

### Conteo de hallazgos por severidad

| Severidad | Cantidad | Dónde                                                                     |
| --------- | -------- | ------------------------------------------------------------------------- |
| Crítica   | 0        | —                                                                         |
| Alta      | 7        | reglas (2), design-system (4), seguridad (1, media-alta), docs (1: voseo) |
| Media     | ~18      | reglas (7), design-system (6), packaging/CI (5)                           |
| Baja      | ~25      | transversal                                                               |

> Nota de severidad: ninguno es crítico porque todos requieren condiciones concretas (autofix
> activo, tmpdir compartido, monorepo con prefix, sesión de larga vida). Pero los altos tocan
> directamente el código del usuario o la corrección del linter y deben priorizarse.

---

## 1. Reglas y utils (`src/rules/`, `src/utils/`)

### Alta

**R-A1 · `enforce-negative-arbitrary-values` corrompe `calc()`/`var()`**
`src/rules/enforce-negative-arbitrary-values.ts:27-31` `fixClass` mueve el signo dentro de los
brackets sin validar que el valor sea una dimensión simple. `-top-[calc(100%-4px)]` →
`top-[-calc(100%-4px)]` y `-translate-x-[var(--x)]` → `translate-x-[-var(--x)]`: ambos son CSS
inválido (`-calc(...)`/`-var(...)` no existen) y el estilo desaparece silenciosamente. Único guard
actual: `innerValue.startsWith('-')`. Sin tests de `calc`/`var`. **Fix:** aplicar solo si el valor
matchea una dimensión numérica simple (`/^\d+(\.\d+)?[a-z%]*$/`); para `calc`/`var`/expresiones no
ofrecer fix.

**R-A2 · `consistent-variant-order` reordena variantes que no conmutan**
`src/rules/consistent-variant-order.ts:196-228` El fix solo protege pseudo-elementos. Las variantes
que cambian el target del selector tampoco conmutan: `hover:*:flex` → `*:hover:flex` y
`[&>svg]:hover:w-4` → `hover:[&>svg]:w-4` cambian a qué elemento aplica el hover. El propio test
(`consistent-variant-order.test.ts:42`) consagra el reordenamiento del selector arbitrario. **Fix:**
tratar `*`, `**`, `*:…` y variantes arbitrarias `[...]` con combinadores como barreras de
reordenamiento (solo reordenar segmentos contiguos entre barreras). Compartir la lógica
`changesTarget()` que `no-contradicting-variants` ya tiene.

### Media

| ID   | Archivo:línea                                                  | Problema                                                                                                                                           | Fix                                                                                              |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| R-M1 | `enforce-canonical.ts:115` + `canonicalize-service.ts:143-148` | La ruta worker se salta `roundRemValue()` (invariante 7); el autofix puede escribir `2.4000000000000004rem`                                        | Aplicar `roundRemValue` al guardar en `canonCache` (un solo punto)                               |
| R-M2 | `no-unknown-classes.ts:66-68,115-135`                          | `stripModifiers` aplica `splitImportant` a la clase completa: `flexx!` pierde el `!` y `hover:flexx` nunca sugiere (compara con variante incluida) | Separar variante + `!`, buscar sobre la utility desnuda, reconstruir con `reattachImportant`     |
| R-M3 | `no-conflicting-classes.ts:107,168`                            | Mensaje "appears later takes precedence" es falso — en CSS gana el orden en la hoja generada, no en el atributo                                    | Reformular el mensaje o calcular el ganador real vía `cache.getOrder()`                          |
| R-M4 | `enforce-logical.ts:110-117`                                   | Ignora utilities negativas: `-ml-2`, `-left-4` nunca matchean (`splitImportant` no quita el `-` inicial)                                           | Pelar `-` antes del match y re-anteponerlo en el reemplazo                                       |
| R-M5 | `no-dark-without-light.ts:51-61,116-124`                       | Falso positivo con el patrón idiomático `block dark:hidden` (display = misma propiedad, prefijos distintos)                                        | Grupos de equivalencia por propiedad (display, position) o resolver vía `cache.getCssProperties` |
| R-M6 | `consistent-variant-order.ts:156-194`                          | Cachea prefix/prioridad del primer DS para siempre; en monorepo con mapping + `prefix(tw)` el resto de archivos usa el prefix equivocado           | Memoizar por `entryPoint` resuelto, no una vez por contexto                                      |
| R-M7 | `no-hardcoded-colors.ts:13,92`                                 | `entryPoint` declarado en schema pero jamás leído (regla 100% estática) — código muerto, sugiere dependencia inexistente del DS                    | Eliminar `entryPoint` del schema y de `Options`                                                  |

### Baja (selección)

- **R-B1** `class-splitter.ts:29,86` — `/\s/.test(char)` por carácter en el hot path; hoistear el
  regex o comparar charcodes.
- **R-B2** `consistent-variant-order.ts:243-276` — reimplementa `reportClassReplacements`; usar el
  helper compartido.
- **R-B3** `enforce-sort-order.ts:63` — variable `groupOrder` muerta; split de variantes no
  bracket-aware (benigno).
- **R-B4** `enforce-shorthand.ts:101-139` — diagnósticos solapados (3× para `mt/mr/mb/ml`) y
  allocaciones por nodo.
- **R-B5** `enforce-consistent-important-position.ts` / `enforce-negative-arbitrary-values.ts` —
  strip de `!` a mano en vez de `splitImportant` (smell).
- **R-B6** `no-unknown-classes.ts:115` — Levenshtein sin memo contra ~10k candidatos por nodo.
- **R-B7** `cache.ts:262-281` + `no-unknown-classes.ts:93` — `hover:tw:flex` produce sugerencia
  doble-prefijada `tw:hover:tw:flex`.
- **R-B8** `class-splitter.ts:26` — `]` huérfano deja `bracketDepth = -1`; clamp a 0.
- **R-B9** `no-conflicting-classes.ts:143-172` — auto-conflicto en duplicados exactos; overlap
  O(a·b) con `includes` (usar Sets).
- **R-B10** `no-deprecated-classes.ts:57-58` — exige DS solo como gate sin usarlo; evaluar hacerla
  DS-opcional como `consistent-variant-order`.

**Invariantes verificados sin violación:** lazy options, `defaultOptions`, manejo de `!` en
`cache.*`, prefix v4 primero en `consistent-variant-order` y `enforce-sort-order` strict.

---

## 2. Capa design-system (`src/design-system/`)

### Alta

**DS-A1 · El `lastError` "sticky" nunca es sticky — cada fallo re-paga el init completo**
`ds-worker.ts:64` — la condición exige `this.ready` poblado, pero todas las rutas de fallo dejan
`ready === null` (init timeout / DS-load error lanzan antes de asignar `ready`; los timeouts de
request llaman `cleanup()` que lo resetea). Resultado: la siguiente llamada reintenta spawn + carga
completa — **60 s por llamada** con init-timeout, o respawn por llamada con error de CSS. Es
exactamente la amplificación tipo #24 que se dio por resuelta. El test "sticky"
(`fatal-errors.test.ts:26`) no mide el costo. **Fix:** guardar `lastErrorCssPath` y chequear
`this.lastError && this.lastErrorCssPath === cssPath`; endurecer el test contando respawns.

**DS-A2 · El hash del caché solo cubre el CSS de entrada — los `@import` locales no invalidan**
`sync-loader.ts:769-787` — `computeContentHash` hashea solo el entry. Si el entry hace
`@import "./theme.css"` y el usuario edita `theme.css` (tokens `@theme`, componentes), ni el caché
en disco ni el de memoria se invalidan: design system obsoleto indefinidamente. El worker ya
resuelve imports para `componentClasses` pero no los hashea. **Fix:** resolver `@import` relativos
en el hilo principal y hashear la concatenación, o incluir los mtimes de los imports de primer
nivel.

**DS-A3 · Caché en disco corrupto nunca se recupera — fallo permanente hasta limpiar tmpdir**
`sync-loader.ts:731` (`tryReadRawCache` sin validar) vs `:786` (`tryReadCache` validante): la ruta
de recuperación está rota por asimetría. `computeWithLock` lee bytes corruptos sin validar y los
devuelve; luego `loadDesignSystemSync:812-820` hace `JSON.parse` → lanza y **nunca borra el archivo
corrupto**. Además un `{}` JSON-válido pasa el read y revienta en `fromPrecomputed`
(`loader.ts:211`, fuera del try) con `TypeError` crudo no fatal → lint roto sin diagnóstico. Sin
tests de caché corrupto. **Fix:** validar con `tryReadCache` en `computeWithLock`; ante parse
fallido `tryUnlink` antes de recomputar; validar forma mínima (`Array.isArray(data.validClasses)`)
antes de `fromPrecomputed`.

**DS-A4 · `require()` top-level en PRECOMPUTE_SCRIPT: crash sin señal → cuelgue de 60 s + mensaje
engañoso; `workerError` es código muerto** `sync-loader.ts` (script embebido) — el
`require(tailwindNodePath)` corre fuera de todo try; si el módulo falla al cargar, el worker muere
sin `signalError` → `control[2]=0` → el main espera el timeout completo y reporta "Timed out… raise
timeout" (causa real invisible). Además `sync-loader.ts:655-672`: `workerError` se lee síncronamente
tras `Atomics.wait` (el event loop no giró), siempre `undefined` — fallback muerto, y con `len===0`
el error se construye con `cause = undefined`. **Fix:** envolver todo el cuerpo del script (incl.
`require`) en try/catch con `signalError`; eliminar `workerError`.

### Media

| ID    | Archivo:línea                                            | Problema                                                                                                                             | Fix                                                                                            |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| DS-M1 | `sync-loader.ts:741-742`                                 | TOCTOU en reclaim de lock viejo: dos waiters pueden borrar el lock fresco de quien recomputa → reintroduce N workers paralelos       | Reclamar por rename exclusivo, o escribir pid+timestamp y verificar identidad antes del unlink |
| DS-M2 | `sync-loader.ts:465`                                     | tmpdir compartido (Linux `/tmp`): 2º usuario falla con EACCES y hint engañoso                                                        | Sufijo por uid en el dir; clasificar EACCES en `precomputeHint`                                |
| DS-M3 | `ds-worker.ts:33-34`                                     | `settings.tailwindcss.timeout` no llega a `DesignSystemWorker` pero los errores dicen "raise timeout"                                | Plumbear el timeout, o corregir los hints                                                      |
| DS-M4 | `sort-service.ts:27-31`, `canonicalize-service.ts:41-45` | `catch {}` traga la causa del fallo de carga del DS → error de CSS indiagnosticable                                                  | Replicar el patrón `signalError` en el shell compartido                                        |
| DS-M5 | `ds-worker.ts:65`                                        | Los workers nunca revalidan contenido del CSS; en LSP/watch editar el CSS deja estado mixto (cache fresco, sort/canonicalize viejos) | Incluir mtime/contentHash en la identidad del worker y en `canonCache`                         |
| DS-M6 | `sort-service.ts:59`, `canonicalize-service.ts:71`       | Respuesta > buffer: `dataArea.set` fuera del try → worker muere → cuelgue de 30 s + timeout engañoso                                 | Si `response.length > dataArea.length`, responder sentinel de error dentro del try             |

### Baja

- **DS-B1** truncado UTF-8 a mitad de carácter en `signalError` (cosmético).
- **DS-B2** `dsFailureCache` memoiza fallos transitorios (ENOMEM/EAGAIN) para toda la vida del
  proceso; en LSP merece TTL.
- **DS-B3** duplicación de ~35 líneas entre los `WORKER_SCRIPT` de sort y canonicalize; `ds-worker`
  debería exportar `makeWorkerScript(handlerBody)` (haría que DS-M4 y DS-M6 se arreglen una sola
  vez).
- **DS-B4** `extractComponentClasses` no recursa imports de 2º nivel ni soporta `@import url(...)`.

**Verificado y descartado:** prefix v4 en `cache.ts` (correcto), escritura atómica (tmp+rename
correcto), protocolo Atomics (offsets/alineación correctos), fugas de workers (todos unref +
terminate en finally), `CACHE_KEY` (invalida bien por script/versión).

---

## 3. Seguridad

**SEC-A1 (media-alta) · Envenenamiento de la caché en disco sin validación ni control de propiedad**
`sync-loader.ts:465-537,769-821`; consumo en `cache.ts`, `utils/report.ts`. El directorio
`tmpdir()/oxlint-tailwindcss` se crea sin `mode`, sin `chmod`, sin `O_NOFOLLOW` ni verificación de
uid. El nombre del archivo es predecible (`md5(CACHE_KEY:content)`, todo público o adivinable). El
lector hace `JSON.parse(raw) as PrecomputedData` sin validar nada. En máquina multiusuario / build
agent con `/tmp` compartido, un atacante local pre-planta `<hash>.json`. Impacto real: los datos
precomputados alimentan autofixes que reescriben el fuente — `canonical` se escribe verbatim sin
escapar comillas en `reportClassReplacements`, así que un valor con `"` puede romper el string JSX e
inyectar contenido al correr `oxlint --fix`. Atenuantes: requiere tmpdir compartido (en macOS es
por-usuario) y `--fix`. **Fix:** `mkdirSync(..., { mode: 0o700 })` + namespace por uid;
`fstatSync(fd).uid === getuid()` y `O_NOFOLLOW` al leer; validación de esquema mínima tras
`JSON.parse` (descartar y recomputar si no valida). Coincide con DS-A3/DS-M2.

**SEC-B1 (baja) · Regex de config sin try/catch → crash en vez de diagnóstico**
`utils/extractors.ts:136` (`variablePatterns`) y `no-restricted-classes.ts:56` compilan regex del
usuario sin protección (a diferencia de `allowlist.ts:9-20`, que sí lo hace). Un patrón inválido
propaga excepción cruda y rompe el lint con stack trace. ReDoS es auto-infligido (riesgo aceptado).
**Fix:** try/catch como en `allowlist.ts`, idealmente reportando un diagnóstico de configuración.

**Verificado y acotado (bajo/aceptado):** workers `eval:true` usan scripts estáticos con datos por
`workerData` (sin inyección desde CSS/settings); path traversal contenido al privilegio del propio
usuario; busy-wait con límites en todos los caminos (peor caso ~3 min en contención patológica, no
indefinido); logs sin secretos.

---

## 4. Empaquetado y CI/CD

**Estado base correcto:** exports map verificado contra el dist real (`publint`: "All good!"),
workers + `require.resolve` sobreviven al bundle ESM/CJS (verificado en `dist/`), release usa OIDC
con provenance y re-ejecuta lint/format/typecheck/build/test antes de publicar, `pack --dry-run`
limpio.

### Alta

**PKG-A1 · `ci.yml` y `docs.yml` no declaran `permissions`** → el `GITHUB_TOKEN` hereda el default
del repo (potencialmente read-write). Añadir `permissions: { contents: read }` a nivel de workflow.
`release.yml` sí declara permisos razonables.

### Media

| ID     | Dónde                | Problema                                                                                                                                 | Fix                                                                                                                                                                                   |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PKG-M1 | `ci.yml:14-17`       | Matriz solo Node 22 / ubuntu, pese a `engines >=20` y código sensible a plataforma (Atomics, file-locks, tmpdir, worker_threads)         | Matriz `[20,22,24]` + macOS/Windows, o ajustar `engines`                                                                                                                              |
| PKG-M2 | `package.json:69-71` | Peer `@oxlint/plugins: ">=1.43.0"` sin tope superior y con piso nunca testeado (CI solo prueba 1.68)                                     | `">=1.43.0 <2"` y job opcional con la versión mínima                                                                                                                                  |
| PKG-M3 | `package.json:53-56` | `tailwindcss` como `dependency` (no se importa nunca; solo fallback de resolución) — riesgo de desalineación con el tailwind del usuario | Considerar moverlo a `peerDependencies` opcional; documentar que se lintea contra la propia versión del parser. Mantener `@tailwindcss/node` como dep (lo necesita `require.resolve`) |
| PKG-M4 | `release.yml:35`     | `npm install -g npm@latest` sin pin (cliente de publish cambia entre releases)                                                           | Pinnear `npm@11.x`                                                                                                                                                                    |
| PKG-M5 | actions              | `checkout/setup-node/pnpm/wrangler` pinneadas por tag mayor, no por SHA, en workflow con `id-token: write`                               | Pinnear por SHA                                                                                                                                                                       |

### Baja

- **PKG-B1** `"types"` top-level apunta a `.d.mts` mientras `main` es `.cjs` (masquerading bajo
  resolución legacy) → usar `.d.cts`.
- **PKG-B2** `dist/index.mjs.map` (287 KB con `sourcesContent`) viaja en el tarball; declarar
  `sourcemap: false` explícito en `tsdown.config.ts`.
- **PKG-B3** `@oxlint/plugins: ^1.68.0` hardcodeado mientras `oxlint` usa `catalog:`.
- **PKG-B4** falta `concurrency` group en `release.yml`.
- **PKG-B5** sin `dependabot.yml`/renovate; sin `"packageManager"` en root (corepack).
- **PKG-B6** `config.ts:32` hardcodea `v1.0.0` en el nav del sitio (ver DOC-M más abajo).

---

## 5. Tests

Cobertura buena en lo grueso (23/23 reglas con archivo, matriz multiline completa, 14/15 fixables
afirman `output`, las 11 reglas con suggestions tienen casos), pero con huecos concretos.

### Alta

- **TST-A1** `enforce-consistent-line-wrapping.test.ts` (81 líneas, **0 `output:`**): regla fixable
  que reescribe strings multilínea sin test de autofix en su propio archivo; el modo `printWidth` no
  tiene ningún test de fix.
- **TST-A2** El tag por defecto `` tw`...` `` no se usa en **ningún** test del repo — el default
  `tags: ['tw']` podría romperse sin que falle nada.
- **TST-A3** No hay test de concurrencia real del file-lock cold-cache: `sync-loader.test.ts:63-91`
  solo cubre romper un lock viejo en un proceso. Falta lanzar 2+ procesos en frío sobre el mismo CSS
  y afirmar que solo uno computa (el corazón de `computeWithLock`, #24).

### Media

- **TST-M1** Extracción de object-keys `cn({ "bg-red-500": cond })` y `exclude.tags` sin casos.
- **TST-M2** Prefix v4 sin cobertura para `no-deprecated-classes`, `no-unnecessary-arbitrary-value`,
  `prefer-theme-tokens`, ni e2e por el binario oxlint con `with-prefix.css`.
- **TST-M3** Fixtures efímeros escritos en `tests/fixtures/` (no gitignorados) — encontrados
  archivos huérfanos en disco; mover a `.bench-tmp/`/`os.tmpdir()` o gitignorar.
- **TST-M4** El `--exclude benchmarks` vive solo en los scripts de package.json: un `vitest run` a
  pelo corre los benchmarks (minutos). Mover el exclude a `vitest.config.ts`.
- **TST-M5** Umbrales de tiempo frágiles en `performance.test.ts:25,39,51` (sin relajación en CI).

### Baja

- Test unitario directo de `extractors.ts` (arrays anidados, spreads/holes, WeakMap per-context) y
  de `reportClassReplacements`; pre-calentar todos los fixtures en `global-setup.ts` (hoy solo
  `default.css`); e2e con entryPoint inválido y mapping array; `afterEach` en debug-logging;
  fortalecer aserción de `componentClasses` en el snapshot; Node 20/24 en CI.

---

## 6. Documentación

### Alta

**DOC-A1 · Voseo rioplatense extendido en la documentación en español** (viola la regla de tuteo
neutro). Ocurrencias reales en `packages/docs/es/`: `settings.md:44,91` ("Cambiá", "quitá"),
`migration/v0-to-v1.md:163` ("Abrí"), y múltiples `_extras` (`consistent-variant-order.md:91`
"desactivala y confiá", `enforce-sort-order.md:38,75,90` "definí/olvidate/combiná/dejá/Desactivala",
`no-restricted-classes.md:110`, `no-arbitrary-value.md:36,89`, etc.). Más léxico: "laburo",
"salteó", "acá" (≈10 páginas). **Fix:** corregir los `_extras` ES (no las páginas generadas) a tuteo
neutro y correr `pnpm -C packages/docs generate`.

### Media

| ID     | Archivo:línea                                  | Problema                                                                                                                                                                  | Fix                                         |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| DOC-M1 | `docs/setup.md:158`, `es/setup.md:161`         | Variable patterns documentados como `/^(class\|classes\|style)s?$/` — no matchea `className`/`classNames`; los reales son `/^classNames?$/`, `/^classes$/`, `/^styles?$/` | Reemplazar por los tres reales              |
| DOC-M2 | `README.md:411-421` (paquete)                  | Tabla "Deprecated mappings" lista 7; `DEPRECATED_MAP` tiene 15 (faltan los 8 `bg-gradient-to-*`)                                                                          | Agregar las 8 filas                         |
| DOC-M3 | `rules/_extras/no-deprecated-classes.md:62-63` | Auto-contradicción: dice DS-dependent arriba y "DS-free" abajo (la regla sí emite `designSystemUnavailable`)                                                              | Corregir "DS-free" (EN y ES)                |
| DOC-M4 | `.vitepress/config.ts:32`                      | Nav hardcodea `v1.0.0` (la versión real es 1.2.0)                                                                                                                         | Importar la versión desde el `package.json` |
| DOC-M5 | varios `_extras`                               | Code spans rotos por wrapping (espacio dentro de backticks): `no-unknown- classes`, `bg- gradient-to-r`, etc. (9 EN + 1 ES)                                               | Corregir en `_extras` y regenerar           |

### Baja

- "child process"/"proceso hijo" en settings/setup (desde 1.0.1 es worker_thread); `entryPoint`
  muerto en schema de `no-hardcoded-colors` (coincide con R-M7); `files` del mapping acepta también
  `string[]` (no documentado); CHANGELOG sin fechas en las entradas 1.x; taxonomía de categorías
  divergente README↔sitio; README raíz omite `classNames`/`styles`.

**Sin hallazgos:** registry de reglas auto-sincronizado (`scripts/rules.ts` lee del dist; `generate`
deja git limpio), 23+23 páginas por idioma sin huérfanas, enlaces internos OK, sin referencias a
APIs removidas (auto-detect/`lastLoadedPath`/`string[]` solo como "removido en v1").

---

## Plan de ejecución

Cuatro fases ordenadas por riesgo para el usuario. Cada fase es un PR coherente y verificable con la
suite existente.

### Fase 1 — Correctitud de autofixes y seguridad (alta prioridad)

Lo que toca el código del usuario o su confianza en el linter. **Cada fix necesita test que falle
antes y pase después.**

1. **R-A1** `enforce-negative-arbitrary-values`: no fixear `calc()`/`var()`/expresiones. + tests.
2. **R-A2** `consistent-variant-order`: barreras para `*`/`**`/`[...]` combinadores (compartir
   `changesTarget()`). + tests.
3. **R-M1** `enforce-canonical`: `roundRemValue` en `canonCache`. + test del float crudo.
4. **R-M2** `no-unknown-classes`: separar variante+`!` antes de la sugerencia. + tests.
5. **SEC-A1 + DS-A3 + DS-M2** caché en disco: namespace por uid, `mode 0o700`, `O_NOFOLLOW` +
   `fstat.uid`, validación de esquema tras `JSON.parse`, `tryUnlink` ante corrupción. + tests de
   caché corrupto/`{}`.

### Fase 2 — Robustez de la capa design-system (alta/media)

Fallos silenciosos, cuelgues y amplificación bajo error.

6. **DS-A1** `lastError` sticky real (`lastErrorCssPath`). + test que cuente respawns.
7. **DS-A2** hashear `@import` de primer nivel en la invalidación del caché. + test.
8. **DS-A4** envolver el cuerpo del PRECOMPUTE_SCRIPT en try/`signalError`; eliminar `workerError`
   muerto.
9. **DS-B3 + DS-M4 + DS-M6** extraer `makeWorkerScript(handlerBody)` en `ds-worker`; propagar
   `signalError` y el sentinel de respuesta-grande a sort/canonicalize (un solo punto).
10. **DS-M1** reclaim de lock por rename exclusivo (cerrar la carrera TOCTOU). + TST-A3 (test de
    concurrencia real con procesos paralelos).
11. **DS-M3** (decidido: Opción A — foco CLI/agente) corregir el mensaje engañoso "raise the
    timeout" y documentar que el modo watch/LSP requiere reiniciar tras editar el CSS. **NO** se
    plumbea el timeout a los workers ni se implementa recarga in-process (DS-M5) — ese esfuerzo es
    para el modo server persistente que los agentes (Claude Code y similares) no ejercen: cada lint
    es un proceso nuevo.
12. **SEC-B1** try/catch en `extractors.ts:136` y `no-restricted-classes.ts:56`.

> **Prioridad reforzada por el caso agente:** los agentes ejecutan `oxlint` como CLI one-shot en
> bucle (edita → lintea → edita), leyendo el **caché en disco entre invocaciones** y razonando sobre
> el **texto del diagnóstico**. Por eso DS-A2 (invalidación por `@import`) y DS-A3 (recuperación de
> caché corrupto) son lo más crítico de esta fase — un agente confía en el output y "corrige" sobre
> datos viejos sin sospechar —, y los mensajes claros / fail-loud (DS-A4, DS-M3, DS-M4) son interfaz
> del agente, no pulido: error claro → el agente se autocorrige; error mudo o engañoso → diverge.

### Fase 3 — Documentación y empaquetado (media)

Sin impacto en runtime, alto impacto en percepción/seguridad de supply chain.

13. **DOC-A1** desvosear todos los `_extras` ES + regenerar. **(guía de estilo: tuteo neutro)**
14. **DOC-M1..M5** regex de variablePatterns, tabla de deprecated, contradicción DS-free, versión
    del nav, code spans rotos.
15. **PKG-A1** `permissions: contents: read` en `ci.yml` y `docs.yml`.
16. **PKG-M1** ampliar matriz CI (Node 20/22/24 + macOS/Windows) — validará empíricamente los fixes
    de concurrencia de la Fase 2.
17. **PKG-M2, M4, M5** acotar peer `@oxlint/plugins`, pinnear `npm` y actions por SHA.
18. **TST-M3, M4** sacar fixtures efímeros de `tests/fixtures/`; mover exclude de benchmarks a
    `vitest.config.ts`.

### Fase 4 — Limpieza y deuda menor (baja)

Reglas baja (R-B*), DS baja (DS-B*), PKG baja (PKG-B\*), tests baja, docs baja. Agrupables en uno o
dos PRs de "polish" sin urgencia.

### Versionado sugerido

- Fase 1 + 2 → **`1.2.1`** (bugfixes, sin cambios de API). Confirmado: con la Opción A elegida, no
  se agrega comportamiento nuevo, así que no hay `1.3.0`.
- Fase 3 docs → no requiere bump del paquete (el sitio se despliega aparte).
- PKG-M3 (tailwindcss → peer) sería **breaking** → reservar para `2.0.0`.

### Decisiones tomadas

- **DS-M3/DS-M5 → Opción A (foco CLI / agente).** El modo de ejecución dominante —y el que usan los
  agentes como Claude Code— es `oxlint` como CLI one-shot, no el language server persistente del
  editor. Por eso no se invierte en recarga de worker in-process ni en propagar el timeout a los
  workers (DS-M5); solo se corrige el mensaje engañoso de DS-M3 y se documenta la limitación del
  modo watch. A cambio, se **eleva la prioridad** de la invalidación del caché entre invocaciones
  (DS-A2, DS-A3) y de los mensajes claros/fail-loud (DS-A4, DS-M3, DS-M4), que son lo que protege a
  un agente de operar sobre datos viejos y lo que le permite autocorregirse. Si en el futuro hay
  señal de uso real en editor, abrir issue para DS-M5 como `1.3.0`.
- **PKG-M3 → Opción A (mantener modelo actual).** `tailwindcss` se queda como dependencia; el plugin
  lintea contra su propia versión del parser. Solo se documenta claramente esa decisión. Convertirlo
  en peer dependency se reserva para un eventual `2.0.0` si se juntan breaking changes.
