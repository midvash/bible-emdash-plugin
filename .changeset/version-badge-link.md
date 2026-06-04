---
"@midvash/emdash-plugin-bible": minor
---

The version badge (e.g. "NAA", "NIV", "ACF") in the tooltip header is now a
real `<a href>` pointing at the version's index page on midvash.com
(`https://midvash.com/{language}/{version}`). Another in-document SEO link
distinct from the article-body anchor — passes additional link equity to the
version's slug page.

Same SEO contract as the verse anchor:
- ✅ no `rel="nofollow"` — juice passes
- ✅ no `target="_blank"` — in-document, crawlers preferred
- ✅ `title="<VERSION> on Midvash"` for crawler context
- ✅ `rel="noopener"` only (window-opener guard)

Visual: the badge keeps its pill styling — link underline is suppressed and a
subtle brightness shift on hover/focus signals it's clickable. When the
upstream returns an empty `version`, the badge falls back to a non-linked
`<span>` (or is hidden entirely when `showVersionBadge` is off).

If you target the badge via CSS, the selector remains
`.midvash-tooltip__badge`. Selectors targeting `span.midvash-tooltip__badge`
specifically should switch to the class-only form.
