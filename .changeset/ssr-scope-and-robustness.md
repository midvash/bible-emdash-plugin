---
"@midvash/emdash-plugin-bible": minor
---

SSR linkifier: scope references to article content, robustness + perf fixes.

- **Scope (issue #37)**: the SSR linkifier no longer wraps references inside
  page chrome (`<nav>`, `<header>`, `<footer>`, `<aside>`, `<head>`) or non-
  content widgets (`<title>`, `<option>`, `<select>`, `<optgroup>`,
  `<button>`, `<svg>`, `<math>`, `<noscript>`, `<iframe>`). This matches the
  client scanner's default `selectors` (`article`, `.prose`, `.post-content`,
  `main`) and avoids sitewide-repeated links that Google reads as
  over-optimization.
- **Robustness (issue #40)**: the tag scanner is now attribute-aware — a `>`
  inside a quoted attribute value (e.g. `<img alt="2 > 1">`) is correctly
  ignored when seeking the tag end, so the body that follows is no longer
  mis-parsed.
- **Perf (issue #39)**: a cheap probe regex runs first; pages with no
  reference candidate are returned unchanged (same string instance), skipping
  the full streaming parse entirely.
- **SEO**: linkified anchors now include a `title` attribute matching the
  reference (e.g. `title="João 3:16"`) for crawler context. The plugin still
  does NOT add `rel="nofollow"` or `target="_blank"` — link equity flows
  in-document to midvash.com, by design.

This is a `minor` bump because the default scope changed: references that
used to be linkified inside `<nav>` / `<header>` / `<footer>` (etc.) no
longer are. Sites that relied on that behavior should move the references
into article content.
