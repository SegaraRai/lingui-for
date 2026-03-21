---
"lingui-for-astro": patch
---

`getLinguiContext` now accepts `Astro.locals` directly (type `object`) instead of the full `Astro` object, making it symmetric with `setLinguiContext`. The internal `AstroLike` interface has been removed.
