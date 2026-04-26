---
"@lingui-for/framework-core": patch
"lingui-for-astro": patch
---

Fix Astro interpolation markup in translated content.

Messages are now preserved when they appear inside Astro interpolation markup, including fragment-wrapped markup such as ``{<><span>{t`First`}</span><span>{t`Second`}</span></>}``. HTML comments inside Astro interpolation markup no longer cause neighboring messages to be skipped during extraction or leave invalid comment expressions in transformed output.

`Trans` in Astro now also preserves interpolation expressions that contain elements, fragments, or HTML comments. These expressions are carried as rich-text placeholders and restored as Astro markup at runtime.

This is intentionally a minimal adapter behavior: the outer `Trans` does not recursively extract text or nested `Trans` components inside those preserved expressions. If a conditional branch inside an outer `Trans` contains user-facing text that should be translated, use `t` inside that branch.
