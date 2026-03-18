---
title: "Astro: Caveats"
description: Astro-specific boundaries and tradeoffs.
---

## Astro is not a reactive component runtime

Astro does not have a built-in component reactivity model for `.astro` files.
`lingui-for-astro` therefore focuses on build-time or request-time translation, not reactive
translation stores.

In `static` output, initialize Lingui in page frontmatter.
In `server` and `hybrid` output, initialize it in middleware so it is available for the duration of
that request.

## Runtime helpers are not the primary API

The runtime exists mainly as the compilation target for macros. Prefer `lingui-for-astro/macro`
unless you are implementing tooling or debugging the transform itself.

## MDX is not supported

We have no plans to support MDX in Astro. MDX files are typically processed through static
analysis, and embedding translation macros within them would interfere with that pipeline.
For translated MDX content, we recommend maintaining separate `.mdx` files per locale.

## Client framework islands keep their own runtime model

If you embed Svelte or React islands in Astro, those islands should use their own Lingui integration
path. `lingui-for-astro` handles `.astro` files, not the internal runtime of every client framework.
