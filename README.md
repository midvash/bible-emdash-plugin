# @midvash/emdash-plugin-bible

> 🌐 **English** · [Português (BR)](./README.pt-BR.md) · [Español](./README.es.md)

Auto-detects Bible references in your EmDash site content and renders verse tooltips on hover. Verse text comes from the public [Midvash API](https://api.midvash.com) — no auth required.

Made by [Midvash](https://midvash.com). Prefer WordPress? See the sibling plugin: [midvash/bible-by-midvash](https://github.com/midvash/bible-by-midvash).

## Installation

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
      // ...rest of your config
    }),
  ],
});
```

That's it. The plugin auto-injects its tooltip script + styles into your public pages through EmDash's `page:fragments` hook — no `<script>`/`<link>` tags to add — as long as your layout renders EmDash's `<EmDashHead />` and `<EmDashBodyEnd />` components (the standard EmDash setup).

> **Install model — trusted, not sandboxed.** Install this via npm + `astro.config` (in-process), like [@jdevalk/emdash-plugin-seo](https://github.com/jdevalk/emdash-plugin-seo). Hover tooltips need client-side JS/CSS, and EmDash only lets **trusted** plugins inject scripts/styles into pages. A *sandboxed* marketplace install cannot inject scripts (by design, for security), so it would expose only the `/lookup` JSON API — not the tooltips. For the full feature, use a trusted install.

### Manual injection (layouts without EmDash components)

If your layout doesn't render `<EmDashHead>` / `<EmDashBodyEnd>`, inline the snippets yourself:

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

### Real `<a>` links for SEO (optional)

Add the middleware to wrap references in real `<a href>` anchors in your SSR HTML, so crawlers index them:

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import { bibleLinkifier } from "@midvash/emdash-plugin-bible/middleware";

export const onRequest = sequence(bibleLinkifier());
```

## Configuration

Open `/_emdash/admin/plugins/bible-by-midvash/settings` in the EmDash admin. Key settings:

- **Language** — pt-BR / en / es (controls which book names are recognized **and the tooltip UI language**)
- **Default version** — 37 translations across pt-BR / en / es (NAA, ARA, NVI, ACF, ESV, KJV, RVR1960, …), sourced from the live [Midvash API](https://api.midvash.com/v1/versions)
- **CSS selectors** — where references are detected (default: `article`, `.prose`, `.post-content`, `main`)
- **Tooltip theme** — auto / parchment (light) / warm night (dark) / sepia
- **Colors & style** — off by default (references inherit your site's link styles); enable **Use custom colors** to override
- **Cache** — duration in seconds (default: 30 days)

## Supported formats

| Format | Example |
| ------------------- | ------------------- |
| Single verse | `John 3:16` |
| Alt. separator | `John 3.16` |
| Range | `John 3:16-18` |
| Whole chapter | `Psalm 23` |
| Abbreviation | `Gn 1:1` |
| Numbered (spaced) | `1 Corinthians 13:4` |
| Numbered (no space) | `1Co 13:4` |

Book names are recognized in Portuguese, English and Spanish (Latin abbreviations are universal).

## Endpoints

All routes are served under `/_emdash/api/plugins/bible-by-midvash/`.

| Route | Description |
| --------------------- | -------------------------------------- |
| `GET /lookup?ref=...` | Resolve a reference (public, JSON) |
| `GET /versions?lang=` | List available versions (public, JSON) |
| `GET /settings` | Read settings (admin) |
| `POST /settings/save` | Persist settings (admin) |

The tooltip script + styles are delivered by the `page:fragments` hook (not a route) — EmDash plugin routes always return JSON, so they can't serve JS/CSS assets.

## Visual identity

The tooltip uses the [Midvash](https://midvash.com) palette: Honey Deep (`#B17027`) for links, Parchment (`#FBF5E8`) for the light background, Warm Night (`#302A21`) for the dark background. Typography: Literata for the verse, Figtree for the UI (with `Georgia, serif` / `system-ui` fallbacks).

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run check       # typecheck + tests
npm run build       # compile src/ → dist/ (ESM + .d.ts) for npm
```

Source lives in `src/` (TypeScript); tests and typecheck run against it directly. `npm run build` (tsdown) produces the published `dist/`.

## Marketplace bundle

The plugin bundles into a valid EmDash Marketplace tarball:

```bash
npm run bundle:validate   # build + validate the manifest, no tarball
npm run bundle            # build + produce dist/<id>-<version>.tar.gz
```

`emdash plugin bundle` extracts a `manifest.json` (id, version, capabilities, routes, hooks, admin pages) from the descriptor + backend, bundles `src/sandbox-entry.ts` into a single `backend.js`, and checks it against the marketplace size caps. Publish with `emdash plugin publish`.

> **Note:** a *sandboxed* marketplace install runs only the JSON routes (`/lookup`, `/versions`) and the admin page — EmDash does **not** run `page:fragments` for sandboxed plugins, so the hover tooltips won't render. For the full tooltip feature, install as a **trusted** plugin (npm + `astro.config`, see [Installation](#installation)).

## Links

- 🌐 [midvash.com](https://midvash.com) — the project behind the data
- 📖 [Midvash API](https://api.midvash.com) — public Bible API (no auth)
- 🧩 [WordPress version](https://github.com/midvash/bible-by-midvash) — same feature for WordPress

## License

[MIT](./LICENSE) © [Midvash](https://midvash.com)
