---
title: "Astro: Caveats"
description: Astro-specific boundaries and tradeoffs.
---

## Astro is request-scoped

Astro does not have a built-in component reactivity model for server-rendered `.astro` files.
`lingui-for-astro` focuses on request-bound translation rather than reactive translation stores.
Initialize Lingui context in middleware and it will be available for the duration of that request.

## Runtime helpers are not the primary API

The runtime exists mainly as the compilation target for macros. Prefer `lingui-for-astro/macro`
unless you are implementing tooling or debugging the transform itself.

## MDX is optional

MDX support is opt-in and should be enabled consistently in both:

- the Astro integration
- the Lingui extractor list

## Client framework islands keep their own runtime model

If you embed Svelte or React islands in Astro, those islands should use their own Lingui integration
path. `lingui-for-astro` handles `.astro` and Astro-hosted MDX, not the internal runtime of every
client framework.
