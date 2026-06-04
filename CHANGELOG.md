# Changelog

All notable changes to `@midvash/emdash-plugin-bible` are documented here.
This project follows [Semantic Versioning](https://semver.org/) (pre-1.0: minor
bumps may include breaking changes).

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

### Changed

- **BREAKING:** the package now ships **built `dist/` (ESM + `.d.ts`)** instead
  of raw TypeScript; `exports` point to `dist/*`. A build step runs on publish.
- **BREAKING:** removed the default export from the entry — import the named
  `biblePlugin` (required by the `emdash plugin bundle` manifest extractor).
- **BREAKING:** capability `network:fetch` → `network:request` (the former is
  deprecated and hard-fails marketplace publish); peer `emdash` → `^0.16.1`.
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
