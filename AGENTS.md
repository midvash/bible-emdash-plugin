# Agent playbook — @midvash/emdash-plugin-bible (maintainer side)

You are maintaining this plugin. Consuming sites file issues; you turn them into
tested fixes and PRs. Follow this loop exactly. (Human contributors: see
[`CONTRIBUTING.md`](./CONTRIBUTING.md).)

## Project facts

- **Trusted (in-process) plugin**, distributed on npm. Tooltips need client JS/CSS,
  which EmDash only lets trusted plugins inject (via the `page:fragments` hook).
  A sandboxed/marketplace install can't run the tooltips — never "fix" a bug by
  assuming sandbox script injection works; it doesn't.
- Source of truth for settings: `src/lib/settings.ts` (defaults, admin schema,
  and the Block Kit form all derive from it — don't hand-edit the form).
- Client assets are built once in `src/lib/client-assets.ts` and shipped via the
  `page:fragments` hook (`src/sandbox-entry.ts`) or `getBibleByMidvashSnippets`
  (`src/runtime.ts`). Plugin **routes always return JSON** — never serve JS/CSS
  from a route.
- Strong test suite in `test/` (run in Node + happy-dom). Coverage thresholds are
  enforced.

## Triage → fix → PR (do this per issue)

1. **Pick & dedupe.** `gh issue list --state open --label bug`. Read the issue;
   check it isn't already fixed or duplicated.
2. **Reproduce as a FAILING test FIRST.** Translate the issue's "exact input →
   expected output" into a test:
   - reference parsing → `test/parser.test.ts`
   - SSR `<a>` linkifying → `test/linkify.test.ts`
   - API/URL/cache → `test/midvash.test.ts`
   - book names / collisions → `test/books.test.ts`
   - settings / admin form → `test/settings.test.ts`, `test/routes.test.ts`
   - client behavior (scan/tooltip) → `test/client-bundle.test.ts`
   Run `npm test` and confirm it's RED. If you can't reproduce, comment on the
   issue, add the `needs-repro` label, and stop.
3. **Fix** in `src/` (smallest change that makes the test green). Don't break the
   single-source settings model.
4. **Verify the gate:** `npm run check` (typecheck + tests + coverage) AND
   `npm run bundle:validate` must pass.
5. **Changeset:** `npx changeset` → `patch` for a fix, `minor` for a feature.
   Write one user-facing line (it becomes the changelog entry).
6. **Docs:** if behavior/config changed, update `README.md`, `README.pt-BR.md`,
   `README.es.md` together.
7. **PR:** branch `fix/<slug>` (or `feat/<slug>`), then
   `gh pr create --fill --base main` with `Fixes #<issue>` in the body. CI must be
   green before merge. After merge, the Release workflow handles versioning &
   publishing — do not bump versions by hand (the descriptor version is synced by
   `scripts/sync-descriptor-version.mjs`).
8. **Close the loop:** the release Action comments the published version on the
   merged PR; if asked, comment on the original issue (`fixed in vX.Y.Z`) so the
   consuming site can confirm after its Renovate bump.

## Guardrails

- Never push to `main` directly; always PR.
- Never publish manually unless the Release workflow is broken (then:
  `npm run version-packages` → review → `npm publish --provenance`).
- Capability names: use `network:request` (not the deprecated `network:fetch`).
- Keep changes minimal and well-tested; this plugin is consumed by live sites.
