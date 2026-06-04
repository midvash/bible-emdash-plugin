# CLAUDE.md

Read the full maintainer playbook in @AGENTS.md before making changes.

Golden rules:

- **Test-first.** Every fix begins with a test that is RED before the change and
  GREEN after. Suite is in `test/`; run `npm run check`.
- **Never push to `main`.** Branch → PR with `Fixes #<issue>` → CI green → merge.
- **Add a changeset** for every user-facing change: `npx changeset` (patch=fix,
  minor=feature). Releases are automatic — don't bump versions by hand.
- **`src/lib/settings.ts` is the single source of truth** for settings.
- This is a **trusted** plugin; tooltips ship via the `page:fragments` hook.
  Plugin routes always return JSON — never serve JS/CSS from a route.
- Use `network:request` (not the deprecated `network:fetch`).
