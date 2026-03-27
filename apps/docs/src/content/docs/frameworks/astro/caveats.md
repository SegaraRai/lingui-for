---
title: "Astro: Caveats"
description: Astro-specific boundaries and tradeoffs.
---

## Astro is not a reactive component runtime

Astro does not have a built-in component reactivity model for `.astro` files.
`lingui-for-astro` therefore focuses on build-time or request-time translation, not reactive
translation stores. Once a page renders, translated strings are fixed: there is no equivalent of
Svelte's `$t` that re-evaluates when the locale changes on the client.

Initialize Lingui in middleware (recommended for all output modes) or in page frontmatter for
simple static sites. See [i18n Context](/frameworks/astro/i18n-context) for details.

## Runtime helpers are not the primary API

The runtime (`lingui-for-astro/runtime`) is the compilation target for macros. Its API may change
without a major version bump. Prefer `lingui-for-astro/macro` unless you are implementing tooling
or debugging the transform itself.

## Component macro whitespace is framework-aware by default

Rich-text Component Macros use framework-aware whitespace handling by default instead of raw JSX
semantics. See [Whitespace in Component Macros](/guides/whitespace-in-component-macros) if your
project needs to force `jsx` behavior or keep extraction and transform settings aligned.

## MDX is not supported

`.mdx` files in Astro are compiled through a Remark/Rehype pipeline that is separate from the
Vite transform that powers `lingui-for-astro`. Injecting macro calls into that pipeline is not
supported. For translated MDX content, maintain separate `.mdx` files per locale.

## Client framework islands keep their own runtime model

If you embed Svelte or React islands in Astro, those islands must use their own Lingui integration.
`lingui-for-astro` only handles the `.astro` compilation step. See
[Using Islands](/frameworks/astro/using-islands) for the recommended split.
