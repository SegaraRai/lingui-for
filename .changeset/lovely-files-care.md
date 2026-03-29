---
"lingui-for-svelte": patch
"lingui-for-astro": patch
---

Fixed an issue where transformed `msg` descriptors could produce invalid code when used in `return` or `throw` statements because automatic semicolon insertion could treat the descriptor object as starting on the next statement.

This change normalizes whitespace after the `/*i18n*/` marker so any newline between `/*i18n*/` and `{` is rewritten to a single space, keeping descriptor expressions in the safe `/*i18n*/ { ... }` form.
