# Contributing

This plugin is maintained by [Midvash](https://midvash.com). Even though the repo
is solo-maintained, it runs a real OSS loop: consuming sites file issues, fixes
land via PRs with CI + a failing test, and releases go out automatically through
[Changesets](https://github.com/changesets/changesets). Humans and AI agents
follow the same process — see [`AGENTS.md`](./AGENTS.md) for the agent playbook.

## The loop

```
consumer site → issue (with exact repro) → branch + failing test → fix → PR (Fixes #N)
   → CI (typecheck + tests + bundle validate) → merge → Changesets release (npm + GitHub Release)
   → Renovate bumps the consumers → consumer verifies the fix → issue closed
```

## Reporting a bug

Open a [Bug report](https://github.com/midvash/emdash-plugin-bible/issues/new/choose).
The single most useful thing is the **exact input and expected vs actual output**
(a reference string, a text snippet, or an HTML fragment) — that becomes a test.

From a consuming project's agent, the report is filed with the GitHub CLI:

```bash
# 1) Always dedupe first
gh issue list --repo midvash/emdash-plugin-bible --state all --search "Jó Job resolves to John"

# 2) File it against the template
gh issue create --repo midvash/emdash-plugin-bible \
  --title 'Parser: "Jó 1:1" resolves to John instead of Job' \
  --label "bug,from:blog-a" \
  --body 'Plugin version: 0.2.0
Input: Jó 1:1
Expected: book of Job (slug "job")
Actual: resolves to John (slug "john")'
```

## Developing a fix

```bash
npm install
npm run check          # typecheck + tests + coverage thresholds (must pass)
```

1. Branch from `main`: `git switch -c fix/<short-slug>`.
2. **Write the failing test first** (red → green). The suite lives in `test/`;
   most bugs are a one-line input → expected-output case in
   `test/parser.test.ts`, `test/linkify.test.ts`, `test/midvash.test.ts`, etc.
3. Make the change in `src/`. Keep `src/lib/settings.ts` the single source of
   truth for settings.
4. `npm run check` and `npm run bundle:validate` must pass.
5. Add a changeset: `npx changeset` → pick **patch** (fix) or **minor**
   (feature; this is pre-1.0, so minor may include breaking changes), and write a
   user-facing line. This drives the version bump + changelog.
6. Open a PR with `Fixes #<issue>`. CI gates the merge; once green, merge it.

## Releasing

Releases are automatic. When PRs with changesets land on `main`, the
[Release workflow](./.github/workflows/release.yml) opens a **"Version Packages"**
PR. Merging that PR:

- bumps `package.json` + syncs the descriptor version (`scripts/sync-descriptor-version.mjs`),
- updates `CHANGELOG.md`,
- publishes to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements),
- creates the GitHub Release.

**One-time setup:** add a repo secret `NPM_TOKEN` — an npm **automation** token
(bypasses 2FA) for the `@midvash` scope. Provenance needs the workflow's
`id-token: write` permission (already set).

The marketplace tarball (`npm run bundle`) is built separately with
`emdash plugin bundle`; see the README. Note it only ships the JSON API when
sandboxed — the tooltip feature requires a trusted install.

## Labels

Set up once with the GitHub CLI (run from the repo root):

```bash
gh label create "from:blog-a" --color BFD4F2 --description "Reported by blog A" --force
gh label create "from:blog-b" --color BFD4F2 --description "Reported by blog B" --force
gh label create "needs-triage" --color FBCA04 --description "Awaiting triage" --force
gh label create "needs-repro" --color FEF2C0 --description "Can't reproduce yet" --force
```

(`bug` and `enhancement` already exist by default.)

## Consuming projects

Each site that uses the plugin should let [Renovate](https://docs.renovatebot.com/)
auto-bump it. A ready config is in
[`docs/consumers/renovate.json`](./docs/consumers/renovate.json), and the agent
playbook for those repos is in
[`docs/consumers/AGENTS.md`](./docs/consumers/AGENTS.md).
