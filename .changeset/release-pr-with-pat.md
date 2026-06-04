---
---

CI only — no package release. Wires the Release workflow to use an optional
`RELEASE_PR_TOKEN` PAT for the Changesets step, so the auto-opened "Version
Packages" PR triggers CI (the default `GITHUB_TOKEN` is barred from triggering
workflows on PRs it opens, as an anti-loop guard). Falls back to `GITHUB_TOKEN`
when the secret isn't set, so the release flow keeps working.
