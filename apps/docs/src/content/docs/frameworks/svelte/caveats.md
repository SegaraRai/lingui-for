---
title: "Svelte: Caveats"
description: Svelte-specific behavior and limitations to keep in mind.
---

## Reactive macros are Svelte-specific

`lingui-for-svelte` exposes reactive ergonomics like `$t(...)` because Svelte has a native store and
reactivity model that can support them.

## Ensure Lingui context is initialized before translation runs

The runtime uses deferred accessors so that same-component setup is possible, but translation still
needs a valid Lingui context by the time compiled markup runs. Initialize early in the component's
top-level script.

```svelte
<script lang="ts">
  import { setupI18n } from "@lingui/core";
  import { setLinguiContext } from "lingui-for-svelte";

  // This must run before any $t or Trans in this component's markup.
  const i18n = setupI18n({ locale: "en", messages: {} });
  setLinguiContext(i18n);
</script>
```

In practice, prefer initializing once in a layout component rather than in individual pages.

## Runtime helpers are not the primary API

The runtime layer exists to support compiled macros. Prefer `lingui-for-svelte/macro` unless you are
working on the integration itself.

## Plain `.js`, `.ts`, `.svelte.js`, and `.svelte.ts`

Plain JavaScript and TypeScript macro support is handled by `unplugin-lingui-macro`, not by the
Svelte syntax transform. That split is intentional and follows Lingui's official macro model more
closely.
