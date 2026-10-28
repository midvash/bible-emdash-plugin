---
"@midvash/emdash-plugin-bible": patch
---

Migra o tooling pro emdash 1.x: a validação e o bundle do marketplace agora usam o `@emdash-cms/plugin-cli` (`emdash-plugin bundle`) com o manifesto `emdash-plugin.jsonc`, o backend passa de `src/sandbox-entry.ts` pra `src/plugin.ts` (o export `./sandbox` continua igual) e o `zod` de desenvolvimento fica fixo na versão do emdash.
