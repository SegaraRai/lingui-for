---
"lingui-for-svelte": minor
---

**BREAKING CHANGE** Disallow bare `t`, `plural`, `select`, and `selectOrdinal` string translations in `.svelte` files, requiring reactive `$t`-style usage or explicit `*.eager` calls for non-reactive snapshots.
