### Is it free?

Yes. The plugin is MIT licensed and the [Midvash Bible API](https://api.midvash.com) is free and public, with no account or API key.

### Which Bible translations are available?

23 openly licensed translations in English, Portuguese and Spanish, including KJV, BSB, WEB, ASV, Young's Literal, Darby, Geneva 1599, Douay-Rheims, Bíblia Livre (Almeida), Almeida 1911, Reina-Valera 1909 and Reina-Valera Gómez. The API only serves translations it is allowed to share, so copyrighted ones like NIV or ESV are not offered.

### Why don't I see a hover tooltip on my pages?

Tooltips need a script on every public page, and EmDash only allows that for trusted plugins. Use the npm edition (see *Installation*) if you want tooltips.

### Where does the verse go when I insert it?

At the end of the text, as a quote. EmDash's editor API replaces the whole field and has no cursor position. The editor shows the change first, and nothing is saved until you save.

### The panel doesn't appear. Why?

It shows only on entries that were saved at least once, in the `posts`, `pages` or `projects` collections, with a Portable Text field named `content`.

### Which languages can I type references in?

English, Portuguese and Spanish book names and their usual abbreviations: `1 Corinthians 13`, `1 Coríntios 13`, `1 Corintios 13`, `1 Cor 13`.

### What is Midvash?

[Midvash](https://midvash.com) is a daily Bible devotional with study tools on the web, iOS and Android. This plugin and the public API are part of how we share Scripture freely.
