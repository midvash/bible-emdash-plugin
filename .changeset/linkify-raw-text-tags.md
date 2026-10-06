---
"@midvash/emdash-plugin-bible": patch
---

SSR linkifier: treat `<script>`/`<style>`/`<textarea>`/`<title>` content and HTML comments as raw text. A literal `<a>` inside the plugin's own tooltip CSS comment opened a skip scope that never closed, so no reference on the page was linkified server-side.
