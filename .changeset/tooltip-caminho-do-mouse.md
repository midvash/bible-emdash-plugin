---
"@midvash/emdash-plugin-bible": patch
---

Tooltip no longer disappears while the pointer travels from the reference to "Read more". An invisible bridge now fills the gap between the reference and the tooltip, the hide delay went from 200ms to 350ms, and the tooltip is never hidden while the pointer is over it. The reference's native `title` is parked while the tooltip is open, so the browser no longer shows a second tooltip on top of ours.
