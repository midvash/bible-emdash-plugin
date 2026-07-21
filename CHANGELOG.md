# Changelog

## 0.5.0

### Minor Changes

- [#65](https://github.com/midvash/bible-emdash-plugin/pull/65) [`9a8928d`](https://github.com/midvash/bible-emdash-plugin/commit/9a8928d020b2058f6049982aa8943ef9ae574cf0) Thanks [@onetogregorio](https://github.com/onetogregorio)! - EmDash 0.30 support: auto-generated admin settings form (descriptor `settingsSchema`), HTTP caching on the public `lookup`/`versions` routes (`cacheControl`), an explicit `plugins:manage` permission on the `scan` route, and `scan` exposed as an agent-callable MCP tool. Fully backward compatible — older EmDash hosts ignore the new fields.

## 0.4.0

### Minor Changes

- [#57](https://github.com/midvash/emdash-plugin-bible/pull/57) [`5780453`](https://github.com/midvash/emdash-plugin-bible/commit/57804535004e76463c27028f05f019855252f8d5) Thanks [@onetogregorio](https://github.com/onetogregorio)! - The version badge (e.g. "NAA", "NIV", "ACF") in the tooltip header is now a
  real `<a href>` pointing at the version's index page on midvash.com
  (`https://midvash.com/{language}/{version}`). Another in-document SEO link
  distinct from the article-body anchor — passes additional link equity to the
  version's slug page.

  Same SEO contract as the verse anchor:

  - ✅ no `rel="nofollow"` — juice passes
  - ✅ no `target="_blank"` — in-document, crawlers preferred
  - ✅ `title="<VERSION> on Midvash"` for crawler context
  - ✅ `rel="noopener"` only (window-opener guard)

  Visual: the badge keeps its pill styling — link underline is suppressed and a
  subtle brightness shift on hover/focus signals it's clickable. When the
  upstream returns an empty `version`, the badge falls back to a non-linked
  `<span>` (or is hidden entirely when `showVersionBadge` is off).

  If you target the badge via CSS, the selector remains
  `.midvash-tooltip__badge`. Selectors targeting `span.midvash-tooltip__badge`
  specifically should switch to the class-only form.

## 0.3.1

### Patch Changes

- [#55](https://github.com/midvash/emdash-plugin-bible/pull/55) [`41e6629`](https://github.com/midvash/emdash-plugin-bible/commit/41e662987e537eda91bf1e6fcc6219219a19d6c3) Thanks [@onetogregorio](https://github.com/onetogregorio)! - 🚨 Hotfix: client bundle threw SyntaxError on every page (silently), so 0
  references got linkified and 0 tooltips ever rendered. Confirmed against two
  production sites running v0.3.0.

  Cause: Astro/EmDash escape every literal `</` inside `<script>` content to
  `<\/` before shipping the HTML (standard XSS hardening so a stray
  `</script>` can't break out of the inline script). That rewrite silently
  corrupted `escapeHtml`'s `/</g` regex literal — `/<\/g` parses as `/<`
  (regex) + `\/g` (something else) and throws "Invalid regular expression:
  missing /" the moment the IIFE evaluates. The error happened so early that
  `buildPattern()` never ran and the scanner emitted no `.midvash-ref`
  elements.

  Fix: rewrite `/</g` as `/[<]/g` — a character class with the same semantics,
  but without the literal `</` sequence in source, so the host-side escape no
  longer corrupts the regex. Added 3 regression tests that apply the same
  `</` → `<\/` rewrite to the injected JS before evaluating, locking the
  contract in: any future regex literal containing `</` will fail these tests
  before shipping.

## 0.3.0

### Minor Changes

- [#52](https://github.com/midvash/emdash-plugin-bible/pull/52) [`01b5335`](https://github.com/midvash/emdash-plugin-bible/commit/01b5335b2246dd07aa07ec3a847919f44fb54fe2) Thanks [@onetogregorio](https://github.com/onetogregorio)! - Client bundle: real `<a href>` fallback (SEO), touch support, scheme guard, aria-live.

  - **SEO (issue [#49](https://github.com/midvash/emdash-plugin-bible/issues/49))**: the client-only fallback now renders **real `<a href>`
    anchors** instead of `<span>` — so when a consuming site forgets to register
    the SSR middleware, Googlebot still sees real links to midvash.com and link
    equity flows. URLs match the SSR shape exactly (`/{lang}/{version}/{slug}/
{ch}/{verse}`), with the slug pre-localized server-side. No `nofollow`, no
    `target="_blank"` — by design.
  - **Touch / mobile (issue [#36](https://github.com/midvash/emdash-plugin-bible/issues/36))**: on coarse-pointer devices a single tap on a
    reference opens the tooltip and blocks navigation; a second tap on the same
    reference (tooltip still open) lets the click through so the user reaches
    midvash.com. Tap-outside closes the tooltip. Desktop (`pointer: fine`)
    behavior is unchanged — hover/focus still drives the tooltip, click
    navigates normally.
  - **Security defense-in-depth (issue [#42](https://github.com/midvash/emdash-plugin-bible/issues/42))**: `payload.readMoreUrl` is now
    validated before being placed in an `href`. Only `http:` / `https:` schemes
    are accepted; `javascript:` / `data:` / etc. cause the "Ler mais" link to
    be omitted (the verse text still renders).
  - **a11y (issue [#38](https://github.com/midvash/emdash-plugin-bible/issues/38))**: the tooltip body is marked `aria-live="polite"` /
    `aria-atomic="true"`, so screen readers announce the verse when it
    replaces the "Carregando…" placeholder (follow-up to [#13](https://github.com/midvash/emdash-plugin-bible/issues/13)).

  `buildClientPattern` is now capturing (`m[1..4]` = book, chapter, verse,
  verseEnd) so the client can extract the parts needed to build a URL; the
  non-capturing shape is no longer exported. New `buildNameToSlug` helper
  exports a small name→localized-slug map alongside the pattern.

- [#53](https://github.com/midvash/emdash-plugin-bible/pull/53) [`cf8c6e2`](https://github.com/midvash/emdash-plugin-bible/commit/cf8c6e2999f32dd11d2a8f9bf38c27eb8a46a321) Thanks [@onetogregorio](https://github.com/onetogregorio)! - Tooltip distinguishes "verse not found" from "couldn't load" (issue [#41](https://github.com/midvash/emdash-plugin-bible/issues/41)).

  `fetchVerse` now returns a tagged result (`{ ok: true, data } | { ok: false,
kind: "not-found" | "fetch-error" }`) so the plugin can tell an upstream 404
  (the reference parses but doesn't exist — typically a typo like
  "John 99:99") apart from a transient network/timeout/5xx failure. The
  `/lookup` route propagates `{ error, reference, version }` on failure; the
  client renders the matching localized string from the new `notFound` entry
  in `ClientStrings` (added in pt-br / en / es).

  404 results are NOT cached, so fixing a typo and re-hovering hits the
  upstream again. Other failures still aren't cached either (no behavior
  change there).

  **Breaking** (internal): `fetchVerse`'s return type changed from
  `VerseResponse | null` to `VerseResult`. No public re-export touches this,
  so external consumers should be unaffected.

- [#50](https://github.com/midvash/emdash-plugin-bible/pull/50) [`49767f6`](https://github.com/midvash/emdash-plugin-bible/commit/49767f6493c30158d6c27937a98ba77179d98042) Thanks [@onetogregorio](https://github.com/onetogregorio)! - SSR linkifier: scope references to article content, robustness + perf fixes.

  - **Scope (issue [#37](https://github.com/midvash/emdash-plugin-bible/issues/37))**: the SSR linkifier no longer wraps references inside
    page chrome (`<nav>`, `<header>`, `<footer>`, `<aside>`, `<head>`) or non-
    content widgets (`<title>`, `<option>`, `<select>`, `<optgroup>`,
    `<button>`, `<svg>`, `<math>`, `<noscript>`, `<iframe>`). This matches the
    client scanner's default `selectors` (`article`, `.prose`, `.post-content`,
    `main`) and avoids sitewide-repeated links that Google reads as
    over-optimization.
  - **Robustness (issue [#40](https://github.com/midvash/emdash-plugin-bible/issues/40))**: the tag scanner is now attribute-aware — a `>`
    inside a quoted attribute value (e.g. `<img alt="2 > 1">`) is correctly
    ignored when seeking the tag end, so the body that follows is no longer
    mis-parsed.
  - **Perf (issue [#39](https://github.com/midvash/emdash-plugin-bible/issues/39))**: a cheap probe regex runs first; pages with no
    reference candidate are returned unchanged (same string instance), skipping
    the full streaming parse entirely.
  - **SEO**: linkified anchors now include a `title` attribute matching the
    reference (e.g. `title="João 3:16"`) for crawler context. The plugin still
    does NOT add `rel="nofollow"` or `target="_blank"` — link equity flows
    in-document to midvash.com, by design.

  This is a `minor` bump because the default scope changed: references that
  used to be linkified inside `<nav>` / `<header>` / `<footer>` (etc.) no
  longer are. Sites that relied on that behavior should move the references
  into article content.

### Patch Changes

- [#54](https://github.com/midvash/emdash-plugin-bible/pull/54) [`c78dbd7`](https://github.com/midvash/emdash-plugin-bible/commit/c78dbd7405b73a361d6395dcf12e7adfec1d7e0f) Thanks [@onetogregorio](https://github.com/onetogregorio)! - Docs: clarify the SEO model + document 0.3.0 changes.

  - Reframe the SSR middleware section as "recommended" (was "optional") — SEO
    is the plugin's stated goal.
  - Document the two-layer model: SSR middleware + client-side fallback both
    produce real `<a href>` anchors (since 0.3.0 in the client fallback too).
  - List the SEO contract explicitly: no `nofollow`, no `target="_blank"`,
    `title` attribute, scope limited to article content (no nav/footer/title
    pollution).
  - Document the new mobile / touch behavior (tap-to-toggle, second-tap to
    navigate).
  - Updates to README.md, README.pt-BR.md, README.es.md — kept in sync.

  Patch-level bump (docs only).

## 0.2.2

### Patch Changes

- [#46](https://github.com/midvash/emdash-plugin-bible/pull/46) [`60a792e`](https://github.com/midvash/emdash-plugin-bible/commit/60a792e0852f45d9bb6baac8f71410a679a6b7d8) Thanks [@onetogregorio](https://github.com/onetogregorio)! - Docs: fix `CHANGELOG.md` ordering — the prose intro had drifted between version
  entries (Changesets prepends new versions right after the H1). Removed it so
  entries stay newest-first.

## 0.2.1

### Patch Changes

- [#43](https://github.com/midvash/emdash-plugin-bible/pull/43) [`026847f`](https://github.com/midvash/emdash-plugin-bible/commit/026847fe99aeb53f2f937d6037cac197f3215bf6) Thanks [@onetogregorio](https://github.com/onetogregorio)! - Fix ambiguous book abbreviations. "Jó" now resolves to **Job** (not João/John) via
  an accent-aware override — plain "Jo" still resolves to João/John. "Mc" now
  resolves only to **Mark** ("Mc" was wrongly also listed under Micah's English
  abbreviations). Adds a guard test that fails if any two books ever share the same
  accent-aware abbreviation.

## 0.2.0 — 2026-06-04

Correctness, EmDash-standards compliance, build/distribution, and a large test
suite. **Breaking** changes are marked.

### Added

- **`page:fragments` hook** — the tooltip `<script>` + `<style>` are now
  auto-injected into public pages (zero config) when the site layout renders
  EmDash's `<EmDashHead>` / `<EmDashBodyEnd>` components. Requires the
  `hooks.page-fragments:register` capability.
- **i18n** for tooltip strings (pt-BR / en / es), selected from the configured
  content language and injected server-side.
- **Tests** — full [vitest](https://vitest.dev) suite (parser, linkify, books,
  midvash, settings, pattern, runtime, client-assets, i18n, middleware, routes +
  hooks, descriptor, and a happy-dom test that runs the real client bundle).
  ~97% statement / ~87% branch coverage with enforced thresholds.
- **CI** — GitHub Actions running typecheck + tests + build + marketplace-bundle
  validation on Node 20 and 22.
- **Build & marketplace tooling** — `npm run build` (tsdown → `dist/`),
  `npm run bundle` / `npm run bundle:validate` (`emdash plugin bundle`).
- Single source of truth for settings (`src/lib/settings.ts`): defaults, admin
  schema, and the Block Kit form are all derived from one table.
- **Accessibility** — the tooltip sets `aria-describedby` on the active reference
  (so screen readers announce the verse) and closes on **Escape**.

### Changed

- **BREAKING:** the package now ships **built `dist/` (ESM + `.d.ts`)** instead
  of raw TypeScript; `exports` point to `dist/*`. A build step runs on publish.
- **BREAKING:** removed the default export from the entry — import the named
  `biblePlugin` (required by the `emdash plugin bundle` manifest extractor).
- **BREAKING:** capability `network:fetch` → `network:request` (the former is
  deprecated and hard-fails marketplace publish); peer `emdash` widened to
  `>=0.16.1` (was `^0.16.0`) so it also accepts 0.17+.
- The **default-version** list is reconciled with the live Midvash API: 37
  accurate versions across pt-BR / en / es.
- `loadSettings` now uses a single `kv.list("settings:")` read (was ~15 point
  reads), running on every route and page render.

### Fixed

- **BREAKING (removal):** removed the `/client.js` and `/client.css` routes.
  EmDash plugin routes always return JSON, so these never served real JS/CSS
  assets — delivery now goes through the `page:fragments` hook (or the
  `getBibleByMidvashSnippets` runtime helper / SSR middleware).
- Spanish NVI version slug `nvi-es` → `nvies` (the former didn't resolve).
- `/versions` no longer double-wraps its payload — it returns `{ data: [...] }`
  (matching `/lookup`) instead of `{ data: { data: [...] } }`.
- Persisted KV settings are validated/coerced against the schema on read (type
  checks, enum membership, number clamping), so a corrupt stored value falls back
  to its default instead of reaching the client or the regex build.
- `client.css` / inline CSS no longer force the link color when **Use custom
  colors** is off (references inherit the host site's styles).
- `settings/save` no longer calls `request.json()` (sandboxed routes expose only
  `input`; `request` has no body-parsing methods).
- Admin form, settings schema, and runtime defaults can no longer drift
  (`underlineLinks` default, missing `useCustomColors`, stale version list).

### Notes

- This is a **trusted (in-process)** plugin. EmDash does not run `page:fragments`
  for sandboxed plugins, so a sandboxed marketplace install exposes only the
  `/lookup` JSON API — the hover tooltips require a trusted install (npm +
  `astro.config`). See the README.

## 0.1.0

- Initial release: Bible-reference detection + hover tooltips powered by the
  public Midvash API.
