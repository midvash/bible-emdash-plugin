---
name: astro-injection
description: >-
  How this plugin gets its tooltip JS/CSS and linkified anchors into an Astro/EmDash site.
  Use when working on src/lib/client-assets.ts, the page:fragments hook in src/sandbox-entry.ts,
  src/runtime.ts (inline snippets), or src/middleware.ts (SSR linkify) — injecting client
  `<script>`/`<style>`, rewriting the rendered HTML response, or deciding which delivery path
  to use. Covers Astro middleware (onRequest, sequence, response rewriting) and the is:inline /
  set:html / define:vars directives, grounded in docs.astro.build. Astro is EmDash's host runtime.
---

# Injecting client assets into an Astro / EmDash site

This is a **trusted** plugin, so it can reach the browser three ways. Verse-text comes from the
API; these paths are about getting the tooltip **script/styles** and crawlable **anchors** onto
the page. (Sandboxed installs can't do any of this — `page:fragments` is trusted-only.)

| Path | File | When |
| --- | --- | --- |
| **`page:fragments` hook** (primary, zero-config) | `src/sandbox-entry.ts` → `src/lib/client-assets.ts` | EmDash splices the `<style>`+`<script>` into `<head>`/before `</body>` automatically when the layout uses EmDash's `<EmDashHead>` / `<EmDashBodyEnd>`. |
| **Inline snippets** (manual escape hatch) | `src/runtime.ts` `getBibleByMidvashSnippets` | Layouts that DON'T use `<EmDashHead>`/`<EmDashBodyEnd>` — drop the strings in yourself with `is:inline set:html`. |
| **SSR linkify** (SEO) | `src/middleware.ts` | Rewrites plain refs → real `<a class="midvash-ref">` so crawlers index them and the script has a stable hook. |

`src/lib/client-assets.ts` (`buildClientAssets`) is the **single** place that turns settings into
`{ js, css }`; both the hook and the runtime helper call it (no drift). It `cssSafe()`-strips
admin color values before they land in the injected `<style>`.

## A. The `page:fragments` hook (primary)

In `sandbox-entry.ts` the `page:fragments` hook loads settings, calls `buildClientAssets`, and
returns fragments EmDash injects for you. Requires the `hooks.page-fragments:register` capability
(see the `emdash-plugin` skill). Nothing for the consuming site to wire up beyond using EmDash's
head/body components. **This only runs for trusted installs.**

## B. Astro middleware — SSR linkify (official: docs.astro.build/en/guides/middleware)

```ts
// consuming app: src/middleware.ts
import { sequence } from "astro:middleware";
import { bibleLinkifier } from "@midvash/emdash-plugin-bible/middleware";
export const onRequest = sequence(bibleLinkifier());
```

Rules this relies on:

- **`onRequest(context, next)`** — must **not** be a default export. Chain with **`sequence(a,b,c)`**
  (request-phase in order, response-phase reversed).
- **Rewrite by reading the body, returning a new Response:**
  ```ts
  const response = await next();
  const html = await response.text();
  return new Response(transform(html), { status: response.status, headers });
  ```
- **Only touch `text/html`** — check `content-type`, bail on `/_emdash`, `/_astro`, API/asset paths.
- **Drop `content-length`** when the body length changes (`headers.delete("content-length")`); copy
  headers into a fresh `Headers` first.
- The linkifier (`src/lib/linkify.ts`) skips `a, code, pre, script, style, kbd, samp, textarea` so it
  never wraps a ref already inside a link/code block. Note: SSR linkify is a per-page string pass —
  there's a per-request cost; keep the skip-set and the regex tight.

## C. Inlining JS/CSS in a non-EmDash layout (official: directives-reference)

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

- **`is:inline`** — tells Astro **not to process/optimize/bundle** the tag; renders verbatim, styles
  go global, and **attributes like `defer` have no effect**. Required because the JS/CSS are runtime
  strings, not build-time imports. (`is:inline` is implied by any attribute other than `src`.)
- **`set:html={string}`** — injects as innerHTML, **not auto-escaped**. Safe here because `js`/`css`
  are plugin-built constants (and color values are `cssSafe`-stripped in `client-assets.ts`). ⚠️ Never
  `set:html` untrusted input (XSS). For attribute values you interpolate, escape manually — see
  `escapeHtml` in `linkify.ts`.
- **`define:vars={{…}}`** passes JSON-serializable frontmatter into a `<script>`/`<style>` (implies
  `is:inline` on scripts). This repo bakes settings into the JS via a `__SETTINGS__` token replace
  instead — don't do both for the same value.

## Why NOT route-based assets

`<link href=".../client.css">` / `<script src=".../client.js">` can't work: EmDash plugin routes
return **JSON envelopes** (`apiSuccess`), can't set `Content-Type`, and `client.js`/`client.css` are
invalid marketplace route names (dots). **v0.2.0 removed those routes** — use the `page:fragments`
hook (primary) or the runtime helper. See `.claude/skills/emdash-plugin/` §4 and `AGENTS.md`.

## After using this skill — suggest an improvement

This skill should get sharper every time it runs. Before ending a turn where you used it,
compare what you actually found against what this file claims, then surface a concrete
suggestion — and offer to apply it:

- **Stale/wrong** — a claim here contradicted reality → quote the line and give the fix.
- **Missing** — you hit a gotcha or needed something this file doesn't cover → draft the bullet.
- **Drift check** — if an Astro middleware signature or directive behaved differently than
  docs.astro.build documents, fix the citation and note the Astro version you saw.

Emit a short `📝 skill update:` note (exact section + proposed text), or
`📝 skill: matched reality, no change` if nothing came up. Prefer an Edit to this file over
letting the lesson evaporate; if the lesson is project state, not reusable guidance, write it
to memory instead.
