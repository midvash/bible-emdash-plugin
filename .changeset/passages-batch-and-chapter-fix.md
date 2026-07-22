---
"@midvash/emdash-plugin-bible": minor
---

Use the Midvash API's batch endpoint and fix whole-chapter tooltips.

- **Whole-chapter references now render their text.** The API's chapter response omits `text`/`verse`/`verseEnd`; the client now backfills them (joins `verses[]`), so refs like `Psalm 23` no longer show an error.
- **New `passages` route** resolves many references in one `GET /v1/passages` call, seeding the same KV cache single lookups read.
- **Client pre-warms** every reference on a page in one batched call once the browser is idle, so the first hover is instant.
- **`scan` MCP tool** gained an `includeText` option that returns each detected verse's text via one batched call instead of N follow-ups.
