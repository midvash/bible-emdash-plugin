Bible by Midvash comes in two editions. Pick the one that fits your site.

| | Marketplace (this listing) | npm (trusted) |
|---|---|---|
| Insert verse panel in the editor | ✅ | ❌ |
| Hover tooltips on public pages | ❌ | ✅ |
| Auto-link references to midvash.com | ❌ | ✅ |
| JSON routes, settings page, MCP `scan` tool | ✅ | ✅ |

### Marketplace edition

1. Install **Bible by Midvash** from the EmDash Marketplace and approve its access: network requests to `api.midvash.com` only, plus reading and proposing changes to the editor draft of the `content` field.
2. Optional: open **Plugins → Bible by Midvash** to choose the default translation and whether the reference links to midvash.com (the `showReadMore` setting).
3. Open a **saved** post, page or project and expand the **Bible verse** panel beside the editor.
4. Type a reference, choose the translation and press **Insert at the end**. Review the change in the editor and save.

The panel works on the `posts`, `pages` and `projects` collections, on their Portable Text `content` field (the layout of the EmDash templates). The quote is added at the **end** of the text, because EmDash's editor API replaces the whole field and does not know where your cursor is. Move it where you want before saving.

### npm edition (hover tooltips)

Install the package and register it in `astro.config.mjs`:

```bash
npm install @midvash/emdash-plugin-bible
```

```js
import { biblePlugin } from "@midvash/emdash-plugin-bible";

export default defineConfig({
  integrations: [emdash({ plugins: [biblePlugin()] })],
});
```

Full guide, including server-side links for SEO: [README on GitHub](https://github.com/midvash/bible-emdash-plugin#readme) and [midvash.com/emdash-plugin](https://midvash.com/emdash-plugin).
