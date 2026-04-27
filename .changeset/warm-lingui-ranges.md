---
"@lingui-for/framework-core": minor
"lingui-for-astro": minor
"lingui-for-svelte": minor
"unplugin-lingui-macro": minor
---

Support Lingui 6 as the primary Lingui version while preserving Lingui 5 compatibility.

Package peer and dependency ranges now target Lingui 6 while continuing to accept Lingui 5, and the compatibility matrix covers both versions across the Astro, SvelteKit, and plain Vite fixtures. The matrix installs packed local tarballs into isolated temporary projects so the checks verify the published package shape instead of relying on workspace overrides.

Runtime macro transforms now follow Lingui's `descriptorFields: "auto"` behavior. This keeps descriptor messages available in non-production builds for debugging and source-map oriented tests, while allowing Lingui to omit messages in production builds.
