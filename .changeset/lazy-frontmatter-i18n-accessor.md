---
"lingui-for-astro": minor
---

Fix same-component initialization. `t` macros can now be used in the same `.astro` file that calls `setLinguiContext`.

Previously, the compiler-injected prelude called `getLinguiContext` eagerly at the top of the frontmatter, before user code had a chance to run — causing a runtime error when a page managed its own Lingui context. The prelude now uses a lazy accessor (`createFrontmatterI18n`) that defers the context lookup until the first macro call.
