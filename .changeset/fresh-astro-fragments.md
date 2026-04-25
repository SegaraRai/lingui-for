---
"@lingui-for/framework-core": patch
"lingui-for-astro": patch
---

Fix Astro message extraction and transform output for interpolation markup.

Translated messages are now preserved when they appear inside Astro interpolation markup, including fragment-wrapped markup such as ``{<><span>{t`First`}</span><span>{t`Second`}</span></>}``. `Trans` components that wrap interpolation markup now preserve the rich-text placeholder structure instead of collapsing the whole interpolation to a single `{0}` placeholder.

Astro fragments and HTML comments inside translated interpolation markup are treated as rich-text placeholders, so they can be carried through extraction and transform output consistently. This also prevents comment-only interpolations from causing neighboring messages to be skipped during extraction or leaving invalid comment expressions in transformed output.

Internally, Astro interpolation analysis now keeps the relationship between generated expression roots and their original markup instead of relying on placeholder order.
