---
name: midvash-api
description: >-
  Contract reference for the public Midvash Bible API (api.midvash.com, no auth) used by this
  plugin. Use when touching src/lib/midvash.ts, adding/validating Bible versions or book slugs,
  building "read more" URLs, debugging a failed lookup, or wiring caching. Covers the full
  endpoint set, response & error shapes, caching/ETag/CORS headers, and version & book slug
  rules. Facts checked against the live API on 2026-07-21 — hit `GET /v1` (discovery) and
  `/v1/versions` for the current truth. Version values for this plugin live in `src/lib/settings.ts`.
---

# Midvash API

Public Bible API. Base `https://api.midvash.com`. **No auth.** JSON. Fronted by Cloudflare
(`cf-cache-status: HIT`). The in-repo client is `src/lib/midvash.ts` (with its own KV cache);
this skill documents the upstream contract. `GET /v1` returns a live endpoint list — query it
first if anything below looks stale.

## Endpoints (from `GET /v1`)

```
GET /v1                                      endpoint discovery
GET /v1/versions                             list versions  (?language=<code> to filter)
GET /v1/versions/{slug}                      single version metadata
GET /v1/books                                list books (multilingual names/slugs/abbrev)
GET /v1/books/{slug}                         single book
GET /v1/{version}/{book}/{chapter}           whole chapter
GET /v1/{version}/{book}/{chapter}/{verse}   single verse OR range ("16" or "16-20")
GET /v1/passages?refs=…&version=…            BATCH lookup (≤50 refs, free-text, ","-sep)
GET /v1/votd                                 verse of the day
GET /v1/parse?ref=…                          parse a free-text reference (no verse text)
```

- `{version}` — a slug from `/v1/versions` (e.g. `naa`, `niv`, `rvr1960`).
- `{book}` — English lowercase slug (`john`, `psalms`, `1-corinthians`) = `BookData.slug` in
  `src/lib/books.ts`. (Localized slugs are also exposed via `/v1/books`.)
- The plugin uses chapter + verse/range (`fetchVerse`) and **batch** (`fetchPassages`).

## Batch — `GET /v1/passages` (verified live 2026-07-21)

`?refs=` is a **comma-separated list of FREE-TEXT refs** (e.g. `john 3:16,genesis 1:1-3,psalms 23`
— same grammar `/v1/parse` accepts), NOT dotted notation. Up to **50** refs; `version=<slug>` required.

```json
{ "data": [ {…verse/chapter payload…, "reference":"John 3:16"},
            { "ref":"notabook 99", "error":"Book \"notabook\" not found." } ],
  "meta": { "total":2, "version":"naa", "resolved":1, "failed":1 } }
```
Order preserved; a bad ref becomes `{ ref, error }` **in place** (batch doesn't fail). An invalid
*version* 404s the whole batch. Cache: all-OK batch = immutable 1 yr; any failure = 300 s.
⚠️ Note the plugin passes its own `slug` tokens (English book slugs) as free text — the API accepts
those too (`john 3:16` resolves). The in-repo `fetchPassages` joins tokens with `,` and maps results
back by index, seeding the same `cache:verse:…` KV keys `fetchVerse` reads.

⚠️ **Chapter shape still inconsistent (as of 2026-07-21):** a whole-chapter item (batch or
`/v1/{version}/{book}/{chapter}`) STILL returns only `verses[]` — no `text`/`verse`/`verseEnd` —
and `?preview=N` is NOT honored, contrary to what an API-side changelog may claim. `/openapi.json`
and `/docs` were still **404**. The plugin backfills client-side via `normalizeVerseData` (joins
`verses[]` → `text`, sets `verse:1`/`verseEnd:len`). Keep that workaround until the live API is
re-verified as fixed.

## Success shapes (verified live)

**Single verse** — `GET /v1/nvi/john/3/16`:
```json
{ "data": { "version":"nvi","book":"john","bookName":"John","chapter":3,
            "verse":16,"verseEnd":16,"text":"…","verses":["…"] },
  "meta": { "reference":"John 3:16","total":1 } }
```

**Range** — `GET /v1/niv/john/3/16-18`: same `data` keys; `verse:16,verseEnd:18`, `text` is the
joined passage, `verses` has one per verse; `meta:{reference,total:3}`.

**Whole chapter** — `GET /v1/naa/psalms/23`: `data` has only `version,book,bookName,chapter,verses[]`.
⚠️ **No `verse`/`verseEnd`/`text`** — code reading `data.text` gets `undefined` for a chapter ref;
join `data.verses` when `verse` is absent. (Still an API-side consistency wrinkle — drafted as an
upstream issue.)

**`meta` is `{ reference, total }`** — there is **no `cached`** field; cache state is the plugin's
own KV layer.

## Error shapes (verified live — HTTP 404)

```json
{ "error": { "code":"VERSION_NOT_FOUND", "message":"Version \"zzz\" not found." } }
{ "error": { "code":"BOOK_NOT_FOUND",    "message":"Book \"notabook\" not found." } }
{ "error": { "code":"VERSE_NOT_FOUND",   "message":"Verse(s) out of range. John 3 has 36 verses.",
             "details": { "chapter":3,"maxVerses":36,"requestedStart":999,"requestedEnd":999 } } }
```
Shape `{ error: { code, message, details? } }`. The client treats any non-2xx as **null** — degrade
gracefully (no tooltip, not an error). Don't surface these to the page.

## Caching, ETag & CORS (response headers, verified)

- `cache-control: public, max-age=31536000, s-maxage=31536000, immutable` — verse text is **immutable,
  cached 1 year**. The plugin's 30-day KV cache is largely redundant with this.
- `etag: "v1-nvi-43-3-16-16"` — send **`If-None-Match`** for `304` (`access-control-allow-headers:
  Content-Type, If-None-Match`).
- `access-control-allow-origin: *`, `…-methods: GET, HEAD, OPTIONS` — **CORS is open**; the plugin
  still proxies via the host so the host origin can KV-cache. `x-robots-tag: noindex, nofollow`.

## Versions — and where they live in this plugin

`/v1/versions` → `{ data: [{ slug, name, shortName, language, hasOldTestament, hasNewTestament,
totalBooks, totalChapters }] }`. Live: **86 versions, ~30 languages.** Don't hardcode the full list.

This plugin's exposed versions are defined **once** in `src/lib/settings.ts` (the `defaultVersion`
select options) — add/rename versions there, not in the admin form. What it exposes:

- **pt-br:** `naa ara arc acf nvi nvt ntlh aa as21 jfaa kja kjf msgpt nbv`
- **en:** `esv kjv nkjv niv nlt msg`
- **es:** `rvr1960 ntv nvies`

### ✅ Resolved (was a gotcha): Spanish-NVI slug
The API's Spanish NVI slug is **`nvies`** (not `nvi-es`). v0.1.0 used `nvi-es` → silent 404; **v0.2.0
fixed it to `nvies`** in `src/lib/settings.ts`. Confirm against `/v1/versions?language=es`
(`ntv, nvies, rvr1960, rvr1909, rvg`) before adding any Spanish version.

## Books

`/v1/books` → `[{ id, name:{en,pt-br,es,fr,de,it,zh,ru,ko,…}, slug:{…}, abbrev:{…} }]` — authoritative
multilingual book data (more languages than the plugin's 3). The plugin hardcodes this in
`src/lib/books.ts`; `/v1/books` is the upstream source of truth if you stop hardcoding.

## "Read more" URLs

`buildReadMoreUrl` → `https://midvash.com/{lang}/{version}/{localizedSlug}/{chapter}[/{verse}[-{end}]]`.
`localizedSlug` strips diacritics + hyphenates the canonical book name; the site also accepts the
English slug and 307-redirects.

## Plugin caching

- Key `cache:verse:{version}:{slug}:{chapter}:{verseStart}-{verseEnd}` (chapter-only → `0-0`); default
  TTL 30 days. Versions under `cache:versions:{language}` ~1 day. Timeout via `AbortController`
  (default 5 s); non-2xx/timeout → `null`.

See also: `.claude/skills/emdash-plugin/` (KV/`ctx.http`) and `AGENTS.md`.

## After using this skill — suggest an improvement

This skill should get sharper every time it runs. Before ending a turn where you used it,
compare what you actually found against what this file claims, then surface a concrete
suggestion — and offer to apply it:

- **Stale/wrong** — a claim here contradicted reality → quote the line and give the fix.
- **Missing** — you hit a gotcha or needed something this file doesn't cover → draft the bullet.
- **Drift check** — re-hit `GET /v1` (discovery) and `/v1/versions`; if an endpoint, field,
  error code, or version slug changed since 2026-07-21, update the matching section here.

Emit a short `📝 skill update:` note (exact section + proposed text), or
`📝 skill: matched reality, no change` if nothing came up. Prefer an Edit to this file over
letting the lesson evaporate; if the lesson is project state, not reusable guidance, write it
to memory instead.
