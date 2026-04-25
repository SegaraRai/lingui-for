---
"@lingui-for/framework-core": patch
"lingui-for-astro": patch
---

Fix Astro message extraction and transform output for interpolation markup.

Translated messages are now preserved when they appear inside Astro interpolation markup, including fragment-wrapped markup such as ``{<><span>{t`First`}</span><span>{t`Second`}</span></>}``. `Trans` components that wrap interpolation markup now extract their rich-text placeholders instead of collapsing the whole interpolation to a single `{0}` placeholder.

Astro comment-only interpolations are also handled more consistently when they appear around translated content, so comments no longer cause neighboring messages to be skipped during extraction or leave invalid comment expressions in transformed output.

Internally, Astro interpolation analysis now keeps the relationship between generated expression roots and their original markup instead of relying on placeholder order.
