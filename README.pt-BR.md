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

Pronto. Registrado em `plugins: []`, o plugin injeta o CSS/JS do tooltip em todas
as páginas automaticamente pelo hook `page:fragments` do EmDash — **sem editar o
layout**.

### Injeção manual (opcional)

Se preferir posicionar os assets você mesmo, faça o inline a partir do helper de
runtime no seu layout base:

```astro
---
// src/layouts/Base.astro
import { getBibleByMidvashSnippets } from "@midvash/emdash-plugin-bible/runtime";
import { getPluginSetting, getPluginSettings } from "emdash";

// Passar getPluginSettings lê todas as chaves numa única chamada em vez de uma
// por setting. O JS/CSS compilado é memoizado, então isso é barato por request.
const { js, css, enabled } = await getBibleByMidvashSnippets(getPluginSetting, getPluginSettings);
---
{enabled && (
  <>
    <style is:inline set:html={css}></style>
    <script is:inline set:html={js}></script>
  </>
)}
```

> ⚠️ **Não** carregue os assets via `…/client.js` ou `…/client.css`. O EmDash 0.16+
> envelopa toda resposta de rota em JSON, então uma rota não consegue servir um
> corpo bruto de JS/CSS — essas rotas davam 500 e foram removidas. Use a
> auto-injeção ou o helper de runtime acima.

### Linkificação no SSR para SEO (opcional, avançado)

Por padrão as referências são linkificadas no cliente. Para SEO, você pode *também*
envolvê-las no servidor, para que o HTML entregue aos crawlers contenha âncoras reais
`<a class="midvash-ref" href="https://midvash.com/…">`. Adicione o middleware:

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import { bibleLinkifier } from "@midvash/emdash-plugin-bible/middleware";

export const onRequest = sequence(bibleLinkifier());
```

**Trade-off:** o middleware lê e reescreve o HTML inteiro de cada página
(`response.text()` → transforma → novo `Response`) — custo real de CPU/latência num
Worker. O script do cliente detecta essas âncoras de SSR e só anexa os listeners de
hover (nunca duplica). Use quando o link equity de SEO importar mais que o custo por
request.

## Registro: `plugins:` vs `sandboxed:`

O descriptor é standard-format (`format: "standard"`, `entrypoint`, `capabilities`,
`allowedHosts`) e pode ser registrado de duas formas:

- **`plugins: [biblePlugin()]` — in-process (recomendado).** O EmDash adapta a entry
  standard in-process e a roda pelo HookPipeline. O gating de capability é via `ctx.*`
  (consultivo — um plugin in-process pode burlá-lo). **Necessário para a auto-injeção
  via `page:fragments`**, já que plugins sandboxed não contribuem fragments.
- **`sandboxed: [biblePlugin()]` + um `sandboxRunner` — isolado.** Roda no runtime
  isolado onde `network:fetch` e `allowedHosts: ["api.midvash.com"]` são de fato
  aplicados — adequado se você quer isolamento forte de capability na chamada à API
  externa. Exige um sandbox runner (ex.: `worker_loaders` da Cloudflare +
  `sandboxRunner: sandbox()`). Nesse modo a auto-injeção não roda; use a injeção
  manual com o helper de runtime acima.

## Configuração

Acesse `/_emdash/admin/plugins/bible-by-midvash/settings` no admin do EmDash. Principais settings:

- **Idioma** — pt-BR / en / es (define quais nomes de livros são reconhecidos)
- **Versão padrão** — NAA, ARA, NVI, ACF, ESV, KJV, RVR1960, e outras
- **Seletores CSS** — onde as referências são detectadas (default: `article`, `.prose`, `.post-content`, `main`)
- **Tema do tooltip** — auto / pergaminho (claro) / noite quente (escuro) / sépia
- **Cores e estilo** — cor do link, sublinhado
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
| `GET /lookup?ref=...` | Resolve uma referência (público) — `{ data: { reference, text, … } }` |
| `GET /versions?lang=` | Lista as versões disponíveis (público) — `{ data: [ … ] }` |
| `GET /settings` | Lê as settings (admin) |
| `POST /settings/save` | Persiste as settings (admin) |

> Os assets do cliente não são servidos por uma rota — veja [Instalação](#instalação). O EmDash 0.16+ envelopa toda resposta de rota em JSON, então uma rota não retorna um corpo bruto de JS/CSS.

## Identidade visual

O tooltip usa a paleta da [Midvash](https://midvash.com): Honey Deep (`#B17027`) para links, Pergaminho (`#FBF5E8`) para o fundo claro, Noite Quente (`#302A21`) para o fundo escuro. Tipografia: Literata para o versículo, Figtree para a UI (com fallbacks `Georgia, serif` / `system-ui`).

## Links

- 🌐 [midvash.com](https://midvash.com) — o projeto por trás dos dados
- 📖 [Midvash API](https://api.midvash.com) — API bíblica pública (sem auth)
- 🧩 [Versão WordPress](https://github.com/midvash/bible-by-midvash) — mesma funcionalidade no WordPress

## Licença

[MIT](./LICENSE) © [Midvash](https://midvash.com)
