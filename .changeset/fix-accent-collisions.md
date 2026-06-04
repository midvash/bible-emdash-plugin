---
"@midvash/emdash-plugin-bible": patch
---

Fix ambiguous book abbreviations. "Jó" now resolves to **Job** (not João/John) via
an accent-aware override — plain "Jo" still resolves to João/John. "Mc" now
resolves only to **Mark** ("Mc" was wrongly also listed under Micah's English
abbreviations). Adds a guard test that fails if any two books ever share the same
accent-aware abbreviation.
