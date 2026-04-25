---
"@lingui-for/framework-core": patch
"lingui-for-astro": patch
---

Fix Astro extraction for valid interpolation patterns that previously failed or missed messages.

Messages are now extracted correctly from Astro files that include comment-only interpolations, such as `{/* ... */}` or `{<!-- ... -->}`. This fixes failures when comments appear between otherwise valid translated expressions.

Messages are also extracted from fragment-wrapped interpolation markup, such as ``{<><span>{t`First`}</span><span>{t`Second`}</span></>}``, matching the form Astro accepts when multiple nodes need to be returned from one interpolation.

Internally, Astro interpolation analysis now tracks generated expression roots more explicitly and uses dedicated helper shapes for fragments and adjacent root lists.
