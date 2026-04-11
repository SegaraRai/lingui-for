---
"@lingui-for/framework-core": minor
"lingui-for-astro": minor
"lingui-for-svelte": minor
---

Restrict rich-text whitespace modes to the owning framework.

`lingui-for-astro` now accepts only `"astro"` and `"jsx"` for `framework.astro.whitespace`, while `lingui-for-svelte` now accepts only `"svelte"` and `"jsx"` for `framework.svelte.whitespace`. The previous public `"auto"` mode is removed.
