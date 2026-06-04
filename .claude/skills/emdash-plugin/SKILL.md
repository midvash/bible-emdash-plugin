---
name: emdash-plugin
description: >-
  Develop, validate, bundle and publish EmDash plugins (EmDash = the Astro-native CMS,
  github.com/emdash-cms/emdash). Use when writing or changing the plugin descriptor,
  sandbox-entry, hooks, routes, capabilities, KV settings, the Block Kit admin form, or
  when running `emdash plugin validate|bundle|publish`. Also use when deciding trusted vs
  sandboxed install, why a hook is "silently skipped", why a capability or route name fails
  publish, or why client JS/CSS won't reach the page. Platform facts grounded in the
  published `emdash` source — verify against the installed version before asserting. For
  THIS repo's maintainer workflow (test-first, PRs, releases) see `AGENTS.md`.
---

# Authoring EmDash plugins

EmDash is an Astro-native CMS. A plugin is an npm package the host imports in `astro.config`
(trusted) and/or publishes to the marketplace (sandboxed). Platform facts below were verified
against **emdash v0.16.1**; a different installed version → re-check `node_modules/emdash/src/plugins/*`.

> **This repo is a worked example (v0.2.0):** a trusted plugin that declares
> `["network:request", "hooks.page-fragments:register"]`, ships its tooltip JS/CSS through the
> `page:fragments` hook (`src/sandbox-entry.ts` → `src/lib/client-assets.ts`), single-sources
> settings in `src/lib/settings.ts`, and keeps the descriptor a **named export, no default**.
> Maintainer process (test-first, never push to main, changesets) lives in `AGENTS.md`.

## 1. Two execution models — pick the right one first

| | **Trusted** (in-process) | **Sandboxed** (marketplace) |
| --- | --- | --- |
| Installed via | `emdash({ plugins: [myPlugin()] })` in `astro.config` | `emdash plugin bundle` → publish → tarball |
| `page:fragments` hook | ✅ runs (inject `<script>`/`<style>`/HTML into every public page) | ❌ **never invoked** |
| `page:metadata` hook | ✅ | ✅ (meta/canonical/JSON-LD only) |
| Routes | ✅ JSON envelopes | ✅ JSON envelopes |
| Ship client JS/CSS to the page? | ✅ via `page:fragments` or a layout | ❌ — no script injection |

Source: `emdash/src/page/fragments.ts` ("Sandboxed plugins are never invoked"),
`plugins/types.ts` ("page:fragments (trusted-only)"), `emdash-runtime.ts` (sandboxed →
`page:metadata` only). **Anything needing browser JS/CSS must ship trusted** — deliver via the
`page:fragments` hook or by inlining in a layout (see the `astro-injection` skill), **never a route**.

## 2. Capabilities

`emdash/src/plugins/manifest-schema.ts`:

**Current (use these):** `network:request`, `network:request:unrestricted`, `content:read`,
`content:write`, `media:read`, `media:write`, `users:read`, `email:send`,
`hooks.email-transport:register`, `hooks.email-events:register`, `hooks.page-fragments:register`.

**Deprecated (warned at bundle/validate, HARD-FAILED at publish; auto-normalized for the runtime):**
`network:fetch`→`network:request`, `network:fetch:any`→`network:request:unrestricted`,
`read:content`/`write:content`, `read:media`/`write:media`, `read:users`,
`email:provide`/`email:intercept`, `page:inject`→`hooks.page-fragments:register`.

`content:write`⇒`content:read`; `media:write`⇒`media:read`; `network:request:unrestricted`⇒
`network:request`. Scope network with `allowedHosts: ["api.example.com"]`.

## 3. Hooks and their required capability

A hook declared **without its required capability is silently skipped** (console.warn at
registration). Map (`hooks.ts` `HOOK_REQUIRED_CAPABILITY`):

- `page:fragments` → `hooks.page-fragments:register`
- `content:beforeSave` → `content:write`; other `content:*` → `content:read`
- `media:beforeUpload` → `media:write`; `media:afterUpload` → `media:read`
- `comment:*` → `users:read`
- `email:beforeSend|afterSend` → `hooks.email-events:register`; `email:deliver` →
  `hooks.email-transport:register`
- Lifecycle (`plugin:install|activate|deactivate|uninstall`) and `cron` need **no** capability.

So declaring `page:fragments` but forgetting `hooks.page-fragments:register` = no error, a
silently dead hook. Check the warn log first when a hook "does nothing".

## 4. Routes — always JSON

The public route handler returns `apiSuccess(result.data)` — a JSON envelope
(`emdash/src/astro/routes/api/plugins/[pluginId]/[...path].ts:84`). Therefore:

- A handler's return value is JSON-serialized. You **cannot** set `Content-Type`/status, and
  **`throw new Response(...)` does not serve raw JS/CSS** — never build `/client.js`-style routes.
  (v0.2.0 of this repo removed its old `client.js`/`client.css` routes for exactly this reason.)
- **Marketplace route names** must match `/^[a-zA-Z0-9][a-zA-Z0-9_\-/]*$/` — alphanumeric, `_`,
  `-`, `/`. **No dots.** `client.js` is an invalid bundle route name.
- Sandboxed route `request` is a serialized `{ url, method, headers }` (no `.json()`); a parsed
  body arrives as `routeCtx.input`. Handlers take `(routeCtx, pluginCtx)`. Mark public routes
  `public: true`.

## 5. Descriptor vs sandbox-entry — the default-export rule

- **Descriptor** (`src/index.ts`): returns `PluginDescriptor` (`id`, `version`,
  `format: "standard"`, `entrypoint`, `capabilities`, `allowedHosts`, `adminPages`). For the
  bundle CLI to probe the backend for routes/hooks, this must be a **NAMED export only — no
  `export default`** (a default factory makes the CLI omit routes and crash in `extractManifest`).
- **Backend** (`src/sandbox-entry.ts`): **must** `export default { hooks, routes }`.
  `emdash/src/plugins/adapt-sandbox-entry.ts` reads that default and errors if neither is present.

## 6. Settings (KV) and the Block Kit admin form

- Persist under `settings:<key>`; seed defaults in a `plugin:install` hook. In sandbox prefer one
  `kv.list("settings:")` over N `kv.get`s.
- **Single source of truth** (this repo, v0.2.0): `src/lib/settings.ts` holds `DEFAULTS`,
  `SETTINGS_SCHEMA`, `coerceSetting`, and `loadSettings`; the admin form and `index.ts` re-export
  derive from it — never hand-edit the form.
- Manifest `admin.settingsSchema` field types (`manifest-schema.ts`): `string` (`multiline?`),
  `number` (`min?`,`max?`), `boolean`, `select` (`options[]`), `secret`, `url`, `email`.
- Admin UI = Block Kit blocks (`header`, `context`, `form` with `toggle`/`select`/`text_input`/
  `number_input`, `divider`). An `admin` route returns `{ blocks }`; on `form_submit` returns
  `{ blocks, toast }` after persisting `interaction.values`. `adminPages: [{ path, label, icon? }]`.

## 7. Build → validate → bundle → publish

1. **Build** with `tsdown` to `dist/` (externalize the `emdash` peer). This repo:
   `tsdown src/index.ts src/sandbox-entry.ts src/runtime.ts src/middleware.ts --format esm --dts
   --clean --platform neutral --external emdash --external emdash/plugin --external astro`.
2. **`exports`** point to built `dist/*` files, not `src/*.ts` — the CLI maps `dist/*` back to
   `src/*` (`bundle-utils.ts` `findSourceExports`/`getSourceFromDist`). Pair `import`(dist `.js`)
   with `types`(dist `.d.ts`); set `main`/`files: ["dist", …]`.
3. **`emdash plugin validate`** (this repo: `npm run bundle:validate`) — warns on deprecated
   capabilities, checks manifest/route-names/exports.
4. **`emdash plugin bundle`** — builds the tarball (needs the named-only descriptor + default-export
   backend from §5).
5. **`emdash plugin publish`** — hard-fails on any deprecated capability. (This repo automates
   release via Changesets — don't bump versions by hand; see `AGENTS.md`.)

## Source of truth

`node_modules/emdash/src/` after `npm install` — `plugins/manifest-schema.ts`, `plugins/hooks.ts`,
`plugins/define-plugin.ts`, `plugins/adapt-sandbox-entry.ts`, `cli/commands/{plugin,bundle-utils}.ts`,
`page/fragments.ts`, `emdash-runtime.ts`. Repo: `github.com/emdash-cms/emdash`. **When a specific
string matters, grep the installed source — don't trust this file blindly across versions.**

## After using this skill — suggest an improvement

This skill should get sharper every time it runs. Before ending a turn where you used it,
compare what you actually found against what this file claims, then surface a concrete
suggestion — and offer to apply it:

- **Stale/wrong** — a claim here contradicted reality → quote the line and give the fix.
- **Missing** — you hit a gotcha or needed something this file doesn't cover → draft the bullet.
- **Drift check** — you verified a string against `node_modules/emdash/src`; if the installed
  version ≠ v0.16.1, record any capability / hook / route / CLI difference you saw.

Emit a short `📝 skill update:` note (exact section + proposed text), or
`📝 skill: matched reality, no change` if nothing came up. Prefer an Edit to this file over
letting the lesson evaporate; if the lesson is project state, not reusable guidance, write it
to memory instead.
