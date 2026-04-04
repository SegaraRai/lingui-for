---
"lingui-for-svelte": patch
---

Fix synthetic source normalization for nested owned macros so Svelte builds correctly rewrite nested `$translate(...)` cases during extraction and compile planning.
