### What the plugin can access

- **Network:** only `https://api.midvash.com`, to fetch verse text and the list of translations.
- **Editor draft:** reads the `content` field of the entry open in the editor and proposes one change to it (the inserted quote). You review the change in the editor; nothing is saved until you save.
- **Plugin storage:** your settings and a cache of verse text.

### What it sends

Only the Bible reference and the translation (for example `john 3:16` in `kjv`). No post content, user data, cookies or tracking.

### Reporting a vulnerability

Email [contact@midvash.com](mailto:contact@midvash.com) or open a private advisory at [github.com/midvash/bible-emdash-plugin/security](https://github.com/midvash/bible-emdash-plugin/security/advisories/new). Please don't open a public issue for security problems.
