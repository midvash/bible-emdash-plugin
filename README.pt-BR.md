# @midvash/emdash-plugin-bible

> 🌐 [English](./README.md) · **Português (BR)** · [Español](./README.es.md)

Auto-detecta referências bíblicas no conteúdo do seu site EmDash e renderiza tooltips com o versículo no hover. O texto vem da [Midvash API](https://api.midvash.com) — pública, sem auth.

Feito pela [Midvash](https://midvash.com). Usa WordPress? Veja o plugin irmão: [midvash/bible-by-midvash](https://github.com/midvash/bible-by-midvash).

## Instalação

```bash
npm install @midvash/emdash-plugin-bible
```

```js
// astro.config.mjs
import { biblePlugin } from "@midvash/emdash-plugin-bible";
import emdash from "emdash/astro";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [biblePlugin()],
      // ...resto da sua config
    }),
  ],
});
```

Pronto. O plugin auto-injeta o script + estilos do tooltip nas páginas públicas pelo hook `page:fragments` do EmDash — sem `<script>`/`<link>` pra adicionar — desde que seu layout renderize os componentes `<EmDashHead />` e `<EmDashBodyEnd />` (o setup padrão do EmDash).

> **Modelo de instalação — trusted, não sandboxed.** Instale via npm + `astro.config` (in-process), igual ao [@jdevalk/emdash-plugin-seo](https://github.com/jdevalk/emdash-plugin-seo). Tooltips no hover precisam de JS/CSS client-side, e o EmDash só permite que plugins **trusted** injetem scripts/estilos nas páginas. Um install *sandboxed* do Marketplace não consegue injetar scripts (por segurança, de propósito) — exporia só a API JSON `/lookup`, sem os tooltips. Para a feature completa, use instalação trusted.

### Injeção manual (layouts sem os componentes do EmDash)

Se seu layout não renderiza `<EmDashHead>` / `<EmDashBodyEnd>`, injete os snippets você mesmo:

```astro
---
import { getBibleByMidvashSnippets } from "@midvash/emdash-plugin-bible/runtime";
import { getPluginSetting } from "emdash";
const { js, css, enabled } = await getBibleByMidvashSnippets(getPluginSetting);
---
{enabled && (
  <>
    <style is:inline set:html={css}></style>
    <script is:inline set:html={js}></script>
  </>
)}
```

### Links `<a>` reais para SEO (opcional)

Adicione o middleware para envolver as referências em âncoras `<a href>` reais no HTML SSR, para os crawlers indexarem:

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import { bibleLinkifier } from "@midvash/emdash-plugin-bible/middleware";

export const onRequest = sequence(bibleLinkifier());
```

## Configuração

Acesse `/_emdash/admin/plugins/bible-by-midvash/settings` no admin do EmDash. Principais settings:

- **Idioma** — pt-BR / en / es (define quais nomes de livros são reconhecidos **e o idioma da UI do tooltip**)
- **Versão padrão** — 37 traduções em pt-BR / en / es (NAA, ARA, NVI, ACF, ESV, KJV, RVR1960, …), vindas da [Midvash API](https://api.midvash.com/v1/versions) ao vivo
- **Seletores CSS** — onde as referências são detectadas (default: `article`, `.prose`, `.post-content`, `main`)
- **Tema do tooltip** — auto / pergaminho (claro) / noite quente (escuro) / sépia
- **Cores e estilo** — desligado por padrão (as referências herdam o estilo de link do seu site); ligue **Usar cores customizadas** para sobrescrever
- **Cache** — duração em segundos (default: 30 dias)

## Formatos suportados

| Formato | Exemplo |
| --------------------- | ------------------ |
| Versículo único | `João 3:16` |
| Separador alt. | `João 3.16` |
| Faixa | `João 3:16-18` |
| Capítulo inteiro | `Salmos 23` |
| Abreviação | `Gn 1:1` |
| Numerado (com espaço) | `1 Coríntios 13:4` |
| Numerado (sem espaço) | `1Co 13:4` |

Os nomes dos livros são reconhecidos em português, inglês e espanhol (abreviações latinas são universais).

## Endpoints

Todas as rotas ficam sob `/_emdash/api/plugins/bible-by-midvash/`.

| Rota | Descrição |
| --------------------- | ---------------------------------------- |
| `GET /lookup?ref=...` | Resolve uma referência (público, JSON) |
| `GET /versions?lang=` | Lista as versões disponíveis (público, JSON) |
| `GET /settings` | Lê as settings (admin) |
| `POST /settings/save` | Persiste as settings (admin) |

O script + estilos do tooltip são entregues pelo hook `page:fragments` (não por rota) — rotas de plugin do EmDash sempre retornam JSON, então não servem assets JS/CSS.

## Identidade visual

O tooltip usa a paleta da [Midvash](https://midvash.com): Honey Deep (`#B17027`) para links, Pergaminho (`#FBF5E8`) para o fundo claro, Noite Quente (`#302A21`) para o fundo escuro. Tipografia: Literata para o versículo, Figtree para a UI (com fallbacks `Georgia, serif` / `system-ui`).

## Desenvolvimento

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run check       # typecheck + testes
npm run build       # compila src/ → dist/ (ESM + .d.ts) para o npm
```

O código-fonte fica em `src/` (TypeScript); testes e typecheck rodam direto nele. O `npm run build` (tsdown) gera o `dist/` publicado.

## Bundle pro Marketplace

O plugin também empacota pro [Marketplace do EmDash](https://midvash.com) como um tarball sandbox:

```bash
npm run bundle:validate   # build + valida o manifest, sem tarball
npm run bundle            # build + gera dist/<id>-<version>.tar.gz
```

O `emdash plugin bundle` extrai um `manifest.json` (id, versão, capabilities, rotas, hooks, páginas de admin) do descriptor + backend, empacota `src/sandbox-entry.ts` num único `backend.js` e checa os limites de tamanho do marketplace. Publique com `emdash plugin publish`.

> **Nota:** um install *sandboxed* do Marketplace roda só as rotas JSON (`/lookup`, `/versions`) e a página de admin — o EmDash **não** executa `page:fragments` para plugins sandboxed, então os tooltips não aparecem. Para a feature completa, instale como plugin **trusted** (npm + `astro.config`, veja [Instalação](#instalação)).

## Links

- 🌐 [midvash.com](https://midvash.com) — o projeto por trás dos dados
- 📖 [Midvash API](https://api.midvash.com) — API bíblica pública (sem auth)
- 🧩 [Versão WordPress](https://github.com/midvash/bible-by-midvash) — mesma funcionalidade no WordPress

## Licença

[MIT](./LICENSE) © [Midvash](https://midvash.com)
