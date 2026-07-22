---
"@midvash/emdash-plugin-bible": patch
---

Fix: whole-chapter tooltips stayed broken for references cached before v0.6.0. `fetchVerse`/`fetchPassages` now normalize the payload on cache read (not just on fresh fetch), so a pre-existing KV entry without `text` (e.g. `Psalm 23`) is healed transparently instead of served as-is.
