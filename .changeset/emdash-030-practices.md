---
"@midvash/emdash-plugin-bible": minor
---

EmDash 0.30 support: auto-generated admin settings form (descriptor `settingsSchema`), HTTP caching on the public `lookup`/`versions` routes (`cacheControl`), an explicit `plugins:manage` permission on the `scan` route, and `scan` exposed as an agent-callable MCP tool. Fully backward compatible — older EmDash hosts ignore the new fields.
