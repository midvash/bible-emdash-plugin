---
"@midvash/emdash-plugin-bible": minor
---

Use the API's new `?preview=N` to shrink whole-chapter tooltips.

The Midvash API now returns `text` for whole-chapter references and honors `?preview=N`. `fetchVerse` requests a capped preview for chapter refs (a full chapter can be ~13 KB for a hover card), the tooltip appends an ellipsis when the text is truncated, and the client pre-warm skips chapters so their payload stays small on hover. The `normalizeVerseData` backfill is now a no-op safeguard for chapter entries cached before the fix.
