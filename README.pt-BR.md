# @midvash/emdash-plugin-bible

> 🌐 [English](./README.md) · **Português (BR)** · [Español](./README.es.md)

Auto-detecta referências bíblicas no conteúdo do seu site EmDash e renderiza tooltips com o versículo no hover. O texto vem da [Midvash API](https://api.midvash.com) — pública, sem auth.

Feito pela [Midvash](https://midvash.com). Usa WordPress? Veja o plugin irmão: [midvash/bible-wordpress-plugin](https://github.com/midvash/bible-wordpress-plugin).

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

> **Duas edições: trusted (npm) × loja.** Instale via npm + `astro.config` (in-process, **trusted**) para ter o plugin completo, igual ao [@jdevalk/emdash-plugin-seo](https://github.com/jdevalk/emdash-plugin-seo). O Marketplace do EmDash (plugins.emdashcms.com) instala uma edição **sandboxed**, e o EmDash só deixa plugins trusted injetarem scripts/estilos nas páginas, então a edição da loja não tem tooltip no hover.
>
> | | Trusted (npm) | Loja (sandboxed) |
> |---|---|---|
> | Tooltips no hover nas páginas públicas (`page:fragments`) | ✅ | ❌ |
> | Painel **Inserir versículo** no editor | ❌ | ✅ |
> | Rotas JSON (`/lookup`, `/passages`, `/versions`), página de configurações, ferramenta MCP `scan` | ✅ | ✅ |
>
> **Inserir versículo** (edição da loja): abra um post, página ou projeto já salvo, abra o painel **Bible verse** ao lado do editor, digite uma referência (`Salmos 23`, `João 3:16-18`) e escolha a versão. O texto entra como citação **no fim do texto** (o patch de rascunho do EmDash troca o campo inteiro e não sabe a posição do cursor), seguido da referência e do crédito da versão (versões CC BY exigem), com link pro midvash.com quando a configuração `showReadMore` está ligada. O editor mostra a prévia; nada é salvo até você salvar. Funciona em conteúdos já salvos uma vez, nas coleções `posts`, `pages` e `projects`, no campo Portable Text `content` (o formato dos templates do EmDash).

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

### Links `<a>` reais para SEO (recomendado)

O objetivo deste plugin é **SEO** — referências no conteúdo do seu blog
devem virar âncoras `<a href>` reais que passam link equity para
**midvash.com**.

> **Duas camadas, ambas geram âncoras reais:**
> 1. **Middleware SSR (recomendado)** — envolve as referências no HTML SSR
>    antes do envio, o Googlebot vê os links no primeiro render. Menor
>    risco de um crawler perder.
> 2. **Fallback no cliente (automático, desde 0.3.0)** — se você esquecer
>    de registrar o middleware, o script do cliente *ainda* renderiza as
>    referências como `<a href>` reais (não `<span>`) no primeiro paint.
>    O Googlebot moderno roda JS, então os links são captados — mas o
>    caminho SSR é mais seguro (sem dependência de JS).

Adicione o middleware:

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import { bibleLinkifier } from "@midvash/emdash-plugin-bible/middleware";

export const onRequest = sequence(bibleLinkifier());
```

Só isso. Ambos os caminhos emitem âncoras idênticas:

```html
<a class="midvash-ref"
   href="https://midvash.com/pt-br/almeida-livre/joao/3/16"
   title="João 3:16"
   data-ref="João 3:16"
   rel="noopener">João 3:16</a>
```

**Contrato SEO:**
- ✅ Sem `rel="nofollow"` — o link equity passa.
- ✅ Sem `target="_blank"` — navegação na mesma aba (crawlers preferem;
  usuários no desktop dão ctrl/cmd-click pra nova aba, no mobile usam
  duplo-tap, veja "Mobile" abaixo).
- ✅ `title="<referência>"` — rótulo explícito pra crawlers e leitores de tela.
- ✅ **Escopo: só conteúdo de artigo.** Desde 0.3.0 o linkifier SSR pula a
  estrutura da página (`<nav>`, `<header>`, `<footer>`, `<aside>`) e widgets
  sem conteúdo (`<title>`, `<option>`, `<button>`, `<svg>`, …). Links
  repetidos em todo o site seriam vistos como over-optimization, então o
  plugin os evita por padrão.

**Trade-off:** o middleware reescreve o HTML body de cada página
(`response.text()` → transforma → novo `Response`). A 0.3.0 adicionou um
fast-path que retorna a string original quando não há candidato de
referência, então o overhead em páginas de chrome/vazias é quase zero — mas
páginas com texto ainda pagam o custo do parse. Compõe com outros
middlewares via `sequence(...)`.

### Comportamento mobile / touch

Desde 0.3.0, em dispositivos touch (`pointer: coarse`):

- **Primeiro toque** numa referência abre o tooltip (navegação bloqueada).
- **Segundo toque** na mesma referência libera o clique, levando o usuário a
  midvash.com.
- **Toque fora** fecha o tooltip.

Isso preserva o link SEO (Googlebot continua seguindo) enquanto corrige o
bug de "tap leva o usuário pra fora da página".

## Configuração

Acesse `/_emdash/admin/plugins/bible-by-midvash/settings` no admin do EmDash. No
EmDash **0.30+** o plugin também declara um `settingsSchema`, então o admin mostra
um formulário **Configure** auto-gerado — as duas UIs leem e gravam as mesmas
settings, use a que preferir. Principais settings:

- **Idioma** — pt-BR / en / es (define quais nomes de livros são reconhecidos **e o idioma da UI do tooltip**)
- **Versão padrão** — qualquer tradução de licença livre em pt-BR / en / es (Bíblia Livre, ONBV, KJV, BSB, WEB, RVR1909, …), as que a [Midvash API](https://api.midvash.com/v1/versions) serve. Desde outubro de 2026 a API não serve mais versões sem licença livre (NVT, NAA, NVI, NLT, NTV, RVR1960…); um site que ainda tenha uma delas salva passa sozinho para a versão livre que a API serve no lugar (NVT → ONBV, NLT → BSB, NTV → ONBV, NAA → Bíblia Livre). O selo do tooltip mostra a versão que veio de fato, e o rodapé mostra o crédito dela (título e licença), que as versões CC BY exigem.
- **Versões para outros idiomas** — em sites multilíngues, cada página segue o próprio idioma (`Astro.currentLocale`): páginas no idioma principal usam a **Versão padrão**; páginas em inglês, espanhol ou português (quando não é o principal) usam a versão daquele idioma e linkam para o midvash.com nesse idioma
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
| `GET /lookup?ref=...` | Resolve uma referência (público, JSON, cache de 5 min no EmDash 0.30+) |
| `GET /passages?refs=` | Resolve várias refs (separadas por `;`) em uma chamada (público, JSON) |
| `GET /versions?lang=` | Lista as versões disponíveis (público, JSON, cache de 1 h no EmDash 0.30+) |
| `GET /settings` | Lê as settings (admin) |
| `POST /settings/save` | Persiste as settings (admin) |
| `POST /scan` | Detecta referências em um texto (admin, `plugins:manage`) |

O script + estilos do tooltip são entregues pelo hook `page:fragments` (não por rota) — rotas de plugin do EmDash sempre retornam JSON, então não servem assets JS/CSS.

No EmDash **0.30+** a rota `scan` também é exposta como **tool MCP**: um agente de
IA conectado ao admin pode detectar referências bíblicas em qualquer texto pelo
endpoint MCP do CMS. Passe `includeText: true` para receber também o texto de cada
versículo (resolvido em uma única chamada em lote).

**Performance:** o cliente pré-aquece todas as referências da página numa única
chamada `/passages` assim que o navegador fica ocioso, então o primeiro hover é
instantâneo. Referências de capítulo inteiro (ex.: `Salmos 23`) agora também
mostram o texto — o cliente monta os versículos quando a resposta de capítulo da
API vem sem `text`.

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
npm run bundle            # build + gera .emdash-bundle-tmp/<id>-<version>.tar.gz
```

O `emdash-plugin bundle` (do `@emdash-cms/plugin-cli`) lê a identidade e o contrato de confiança do `emdash-plugin.jsonc`, sonda o backend atrás de rotas e hooks pra gerar o `manifest.json`, empacota `src/plugin.ts` num único `backend.js` e checa os limites de tamanho do marketplace. Publique com `emdash-plugin publish`.

> **Nota:** o bundle da loja é feito a partir de `src/plugin.ts`, a edição **sandboxed**: não tem o hook `page:fragments` (o EmDash nunca o executa em plugin sandboxed), então não tem tooltip no hover, e traz o painel **Inserir versículo** no editor (veja [Duas edições](#instalação)). O install trusted via npm usa `src/trusted.ts` = o mesmo backend + o hook do tooltip.

## Links

- 🌐 [midvash.com](https://midvash.com) — o projeto por trás dos dados
- 📖 [Midvash API](https://api.midvash.com) — API bíblica pública (sem auth)
- 🧩 [Versão WordPress](https://github.com/midvash/bible-wordpress-plugin) — mesma funcionalidade no WordPress

## Licença

[MIT](./LICENSE) © [Midvash](https://midvash.com)

