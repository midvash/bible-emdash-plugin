---
"@midvash/emdash-plugin-bible": minor
---

Tooltip distinguishes "verse not found" from "couldn't load" (issue #41).

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
