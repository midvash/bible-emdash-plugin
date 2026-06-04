# Agent playbook — consuming sites (reporter side)

Drop this into the agent instructions (`AGENTS.md` / `CLAUDE.md`) of each site
that uses `@midvash/emdash-plugin-bible`. It tells the site's agent how to report
a plugin bug cleanly and how to close the loop after a fix ships.

## When you suspect a Bible-plugin bug

1. **Confirm it's the plugin, not your content/config.** Check the admin settings
   (language, default version, selectors). Reproduce with the smallest possible
   input.
2. **Capture the essentials:**
   - Plugin version: `npm ls @midvash/emdash-plugin-bible`
   - The **exact input** (a reference string, text, or HTML fragment)
   - **Expected vs actual** output
   - Install mode (trusted vs sandboxed), configured language + version
3. **Dedupe**, then file against the template:
   ```bash
   gh issue list --repo midvash/emdash-plugin-bible --state all \
     --search "<keywords of the bug>"

   gh issue create --repo midvash/emdash-plugin-bible \
     --title "<concise, specific title>" \
     --label "bug,from:<this-repo-name>" \
     --body "Plugin version: <x.y.z>
   Install mode: trusted
   Language: pt-br   Default version: naa
   Input: <exact input>
   Expected: <...>
   Actual: <...>"
   ```
   Record the issue URL it prints.

## After a fix is released

- Renovate opens a bump PR for `@midvash/emdash-plugin-bible`. Patch bumps
  auto-merge; review minor/major (pre-1.0 minors may break).
- Once bumped, **verify the original repro is fixed** on this site.
- Comment the result on the upstream issue and let the maintainer close it
  (or close it yourself if you confirmed the fix):
  ```bash
  gh issue comment <url> --body "Confirmed fixed on <this-repo> at v<x.y.z>. Thanks!"
  ```

## Don't

- Don't open an issue without the exact input + expected/actual — it can't become
  a test, and it'll bounce back as `needs-repro`.
- Don't patch the plugin inside this repo (e.g. `patch-package`) as a "fix" —
  report upstream so every site benefits. Use a local patch only as a temporary
  unblock, and link it in the issue.
- Don't expect tooltips from a sandboxed/marketplace install — this plugin must be
  installed trusted (npm + `astro.config`).
