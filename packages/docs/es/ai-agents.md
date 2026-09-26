---
title: "oxlint-tailwindcss para agentes de IA"
description: "Usa oxlint-tailwindcss con agentes de IA: un skill que lo configura, y un plugin de Claude Code que revisa las clases de Tailwind que escribe Claude."
---

# Agentes de IA

Los agentes escriben clases de Tailwind rápido, y se equivocan como las personas: un typo, un color
de la paleta en vez de uno del theme, dos clases que se pisan, un componente rearmado a mano.
oxlint-tailwindcss los reporta con el arreglo en el mensaje, y un agente puede actuar sobre eso sin
ayuda. Dos cosas lo vuelven automático.

## El skill

```bash
npx skills add sergioazoc/oxlint-tailwindcss --skill oxlint-tailwindcss
```

Instala
[`skills/oxlint-tailwindcss/SKILL.md`](https://github.com/sergioazoc/oxlint-tailwindcss/blob/main/skills/oxlint-tailwindcss/SKILL.md)
para los agentes que soporta `npx skills`. Le dice al agente cómo configurar el plugin — los
requisitos, el entry point, la [config recomendada](/es/setup#3-conjunto-de-reglas-recomendado) — y
qué hacer con cada diagnóstico.

## El plugin de Claude Code

En Claude Code:

```text
/plugin marketplace add sergioazoc/oxlint-tailwindcss
/plugin install oxlint-tailwindcss@oxlint-tailwindcss
```

Agrega tres cosas:

- **Diagnósticos mientras Claude trabaja.** Arranca el `oxlint --lsp` de tu proyecto como language
  server, así Claude ve los reportes de oxlint-tailwindcss — y los de oxlint — en los archivos que
  abre y edita.
- **Una revisión antes de que Claude termine.** Anota cada archivo que Claude edita; cuando Claude
  va a terminar, linta esos archivos y, si oxlint-tailwindcss reporta errores en ellos, lo hace
  volver con la lista. Los warnings y los archivos que Claude no tocó no cuentan, y nunca lo hace
  volver dos veces seguidas.
- **El skill** de arriba.

Corre el oxlint de tu propio proyecto (`node_modules/.bin/oxlint`, buscado desde la raíz del
proyecto hacia arriba) con tu `.oxlintrc.json`, así que instala `oxlint` y `oxlint-tailwindcss` en
el proyecto y [configúralo](/es/setup) primero. Sin ellos, el plugin no hace nada.

## Cualquier agente

- Cada página de esta documentación también está en markdown plano en la misma ruta, con `.md`
  ([`/es/setup.md`](https://oxlint-tailwindcss.pages.dev/es/setup.md)), y
  [`/llms.txt`](https://oxlint-tailwindcss.pages.dev/llms.txt) las lista.
- oxlint cambia a un formato de salida conciso propio cuando detecta que lo corre un agente, lo que
  mantiene cortos los diagnósticos en el contexto del agente.
