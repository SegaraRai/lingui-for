---
title: "Svelte: Caveats"
description: Svelte-specific behavior and limitations to keep in mind.
---

## Reactive macros are Svelte-specific

`$t`, `$plural`, `$select`, and `$selectOrdinal` exist because Svelte has a store and reactivity
model that can host them naturally. Other frameworks do not have these forms. In Svelte, bare `t`
(without `$`) is a compile-time error to prevent silently dropping locale reactivity.

See [Reactive Macros](/frameworks/svelte/reactive-macros) for the full explanation, including the
`*.eager` escape hatch.

## i18n context must be set before translation runs

`$t` and other reactive macros resolve the i18n instance lazily, but the context must still be
available by the time compiled markup executes. Initialize with `setLinguiContext` at the module
level of the component's script block, not inside `onMount`, `$effect`, or any callback. Same-component
initialization (setting and using context in the same file) is supported because the macro output
is deferred.

See [i18n Context](/frameworks/svelte/i18n-context) for initialization patterns including
same-component setup and Svelte islands.

## Runtime helpers are not the primary API

The runtime layer (`lingui-for-svelte/runtime`) is the compilation target for macros. Its API may
change without a major version bump. Prefer `lingui-for-svelte/macro` unless you are working on
the integration itself.

## Component macro whitespace is framework-aware by default

Rich-text Component Macros use framework-aware whitespace handling by default instead of raw JSX
semantics. See [Whitespace in Component Macros](/guides/whitespace-in-component-macros) if your
project needs to force `jsx` behavior or keep extraction and transform settings aligned.

## Plain `.js`, `.ts`, `.svelte.js`, and `.svelte.ts`

Plain JavaScript and TypeScript files (including `.svelte.js` and `.svelte.ts`) go through the
plain JS/TS pipeline, not the Svelte syntax transform. Use `@lingui/core/macro` with
`unplugin-lingui-macro` for those files.

See [Plain JS/TS Setup](/guides/plain-js-ts) for setup instructions and the recommended descriptor
pattern.
