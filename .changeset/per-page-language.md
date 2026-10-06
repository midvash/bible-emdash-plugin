---
"@midvash/emdash-plugin-bible": minor
---

Multilingual sites: each page now follows its own locale. The SSR linkifier reads `Astro.currentLocale` and the injected client reads EmDash's `page.locale`, so an English page links to midvash.com/en and shows English tooltip strings, a Spanish page to /es, and so on. New settings `versionPtBr`, `versionEn` and `versionEs` pick the version for pages that aren't in the main `language` (main-language pages keep `defaultVersion`). The tooltip now sends the page's `lang` and `v` to `/lookup` and `/passages`, and those routes ignore an unsupported `lang`.
