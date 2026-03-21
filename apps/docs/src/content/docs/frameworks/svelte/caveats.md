---
title: "Svelte: Caveats"
description: Svelte-specific behavior and limitations to keep in mind.
---

## Reactive macros are Svelte-specific

`$t`, `$plural`, `$select`, and `$selectOrdinal` exist because Svelte has a store and reactivity
model that can host them naturally. Other frameworks do not have these forms.

See [Reactive Macros](/frameworks/svelte/reactive-macros) for the full explanation.

## i18n context must be set before translation runs

`$t` and other reactive macros resolve the i18n instance lazily, but the context must still be
available by the time compiled markup executes. Initialize with `setLinguiContext` at the top of
the component's script block, not inside a callback or effect.

See [i18n Context](/frameworks/svelte/i18n-context) for initialization patterns including
same-component setup and Svelte islands.

## Runtime helpers are not the primary API

The runtime layer exists to support compiled macros. Prefer `lingui-for-svelte/macro` unless you
are working on the integration itself.

## Plain `.js`, `.ts`, `.svelte.js`, and `.svelte.ts`

Plain JavaScript and TypeScript macro support is handled by `unplugin-lingui-macro`, not by the
Svelte syntax transform. That split is intentional and follows Lingui's official macro model more
closely.

See [Plain JS/TS Setup](/guides/plain-js-ts) for setup instructions and the recommended descriptor
pattern.
