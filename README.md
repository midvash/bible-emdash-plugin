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

That's it. Registered under `plugins: []`, the plugin injects its tooltip CSS/JS
into every page automatically through EmDash's `page:fragments` hook — **no layout
edits needed**.

### Manual injection (optional)

If you'd rather place the assets yourself, inline them from the runtime helper in
your base layout instead:

```astro
---
// src/layouts/Base.astro
import { getBibleByMidvashSnippets } from "@midvash/emdash-plugin-bible/runtime";
import { getPluginSetting, getPluginSettings } from "emdash";

// Passing getPluginSettings too reads all keys in a single call instead of one
// per setting. The compiled JS/CSS is memoized, so this is cheap per request.
const { js, css, enabled } = await getBibleByMidvashSnippets(getPluginSetting, getPluginSettings);
---
{enabled && (
  <>
    <style is:inline set:html={css}></style>
    <script is:inline set:html={js}></script>
  </>
)}
```

> ⚠️ **Don't** load the assets via `…/client.js` or `…/client.css`. EmDash 0.16+
> JSON-wraps every plugin-route response, so a route can't serve a raw JS/CSS
> body — those routes returned 500 and have been removed. Use the auto-injection
> or the runtime helper above.

### SSR linkification for SEO (optional, advanced)

References are linkified on the client by default. For SEO you can *also* wrap them
server-side, so the HTML shipped to crawlers contains real
`<a class="midvash-ref" href="https://midvash.com/…">` anchors. Add the middleware:

```ts
// src/middleware.ts
import { sequence } from "astro:middleware";
import { bibleLinkifier } from "@midvash/emdash-plugin-bible/middleware";

export const onRequest = sequence(bibleLinkifier());
```

**Trade-off:** the middleware reads and rewrites the entire HTML body of every page
(`response.text()` → transform → new `Response`) — real CPU/latency on a Worker. The
client script detects these SSR anchors and only attaches hover listeners (it never
double-wraps). Reach for it when SEO link equity matters more than the per-request
cost.

## Registration: `plugins:` vs `sandboxed:`

The descriptor is standard-format (`format: "standard"`, `entrypoint`,
`capabilities`, `allowedHosts`) and can be registered two ways:

- **`plugins: [biblePlugin()]` — in-process (recommended).** EmDash adapts the
  standard entry in-process and runs it through the HookPipeline. Capability gating
  is `ctx.*`-based (advisory — an in-process plugin can bypass it). **Required for
  the `page:fragments` auto-injection**, since sandboxed plugins can't contribute
  page fragments.
- **`sandboxed: [biblePlugin()]` + a `sandboxRunner` — isolated.** Runs in the
  isolated runtime where `network:fetch` and `allowedHosts: ["api.midvash.com"]` are
  actually enforced — appropriate if you want hard capability isolation around the
  external API call. Requires a sandbox runner (e.g. Cloudflare `worker_loaders` +
  `sandboxRunner: sandbox()`). In this mode the auto-injection won't run, so use the
  manual runtime-helper injection above.

## Configuration

Open `/_emdash/admin/plugins/bible-by-midvash/settings` in the EmDash admin. Key settings:

- **Language** — pt-BR / en / es (controls which book names are recognized)
- **Default version** — NAA, ARA, NVI, ACF, ESV, KJV, RVR1960, and more
- **CSS selectors** — where references are detected (default: `article`, `.prose`, `.post-content`, `main`)
- **Tooltip theme** — auto / parchment (light) / warm night (dark) / sepia
- **Colors & style** — link color, underline
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
| `GET /lookup?ref=...` | Resolve a reference (public) — `{ data: { reference, text, … } }` |
| `GET /versions?lang=` | List available versions (public) — `{ data: [ … ] }` |
| `GET /settings` | Read settings (admin) |
| `POST /settings/save` | Persist settings (admin) |

> Client assets aren't served from a route — see [Installation](#installation). EmDash 0.16+ JSON-wraps every route response, so a route can't return a raw JS/CSS body.

## Visual identity

The tooltip uses the [Midvash](https://midvash.com) palette: Honey Deep (`#B17027`) for links, Parchment (`#FBF5E8`) for the light background, Warm Night (`#302A21`) for the dark background. Typography: Literata for the verse, Figtree for the UI (with `Georgia, serif` / `system-ui` fallbacks).

## Links

- 🌐 [midvash.com](https://midvash.com) — the project behind the data
- 📖 [Midvash API](https://api.midvash.com) — public Bible API (no auth)
- 🧩 [WordPress version](https://github.com/midvash/bible-by-midvash) — same feature for WordPress

## License

[MIT](./LICENSE) © [Midvash](https://midvash.com)
