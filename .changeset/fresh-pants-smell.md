---
"unplugin-markup-import": minor
---

**BREAKING CHANGE** Route all non-self markup imports through generated facade modules by default, add an `externalize` option to opt specific imports out, and skip applying the plugin during dev server runs.
