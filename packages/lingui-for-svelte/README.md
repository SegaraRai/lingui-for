# lingui-for-svelte

[![npm](https://img.shields.io/npm/v/lingui-for-svelte)](https://www.npmjs.com/package/lingui-for-svelte)
[![Documentation](https://img.shields.io/badge/docs-lingui--for.roundtrip.dev-blue)](https://lingui-for.roundtrip.dev/frameworks/svelte/getting-started)

Macro-first Lingui integration for Svelte 5.

It provides:

- a Svelte-aware macro transform for `.svelte` files
- a Lingui extractor for `.svelte`
- runtime helpers for installing Lingui context in the component tree
- unplugin entrypoints for Vite and other bundlers

**Requirements:** Svelte `^5.0.0`, `@lingui/core` `^5.0.0`, Node.js 18+

## Install

```sh
pnpm add @lingui/core lingui-for-svelte
pnpm add -D @lingui/cli
```

If you also use Lingui macros in plain `.js` or `.ts` files, add `unplugin-lingui-macro` too:

```sh
pnpm add -D unplugin-lingui-macro
```

## Quick Start

Configure Vite:

```ts
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import linguiForSvelte from "lingui-for-svelte/unplugin/vite";
import linguiMacro from "unplugin-lingui-macro/vite";

export default defineConfig({
  plugins: [linguiMacro(), linguiForSvelte(), sveltekit()],
});
```

If you only use macros in `.svelte` files, you can remove `unplugin-lingui-macro`.

Configure Lingui extraction:

```ts
import babelExtractor from "@lingui/cli/api/extractors/babel";
import { svelteExtractor } from "lingui-for-svelte/extractor";

export default {
  locales: ["en", "ja"],
  sourceLocale: "en",
  catalogs: [
    {
      path: "src/lib/i18n/locales/{locale}",
      include: ["src"],
      exclude: ["src/lib/i18n/locales/**"],
    },
  ],
  extractors: [svelteExtractor, babelExtractor],
};
```

Initialize Lingui near the root of the component tree. After running `lingui compile`, import the compiled message catalogs:

```svelte
<script lang="ts">
  import { setupI18n } from "@lingui/core";
  import { setLinguiContext } from "lingui-for-svelte";
  import { catalog } from "$lib/i18n/catalog";

  const { data, children } = $props();

  const i18n = setupI18n({ locale: data.locale, messages: catalog });
  setLinguiContext(i18n);
</script>

{@render children?.()}
```

> [!INFO]
> `catalog` is a locale-keyed object (`{ en: ..., ja: ... }`). `data.locale` is the active locale resolved server-side and passed down via SvelteKit's layout data.
>
> See [Load Compiled Catalogs](https://lingui-for.roundtrip.dev/guides/load-compiled-catalogs) for how to structure the catalog file and choose a loading strategy.
> See [Locale Resolution](https://lingui-for.roundtrip.dev/frameworks/svelte/locale-resolution) for how to resolve the locale from URL params, cookies, and browser headers.

Use macros in Svelte components:

```svelte
<script lang="ts">
  import { t, Trans } from "lingui-for-svelte/macro";

  let count = $state(1);
</script>

<h1>{$t`Hello from Svelte`}</h1>

<p><Trans>{count} item selected</Trans></p>
```

## Entrypoints

- `lingui-for-svelte`: runtime exports such as `setLinguiContext` and `RuntimeTrans`
- `lingui-for-svelte/macro`: authoring macros such as `t`, `Trans`, `Plural`, `Select`, `SelectOrdinal`, `msg`, and `defineMessage`
- `lingui-for-svelte/extractor`: `svelteExtractor` for Lingui CLI extraction
- `lingui-for-svelte/unplugin/*`: bundler plugins for Vite, Rollup, Webpack, esbuild, Rolldown, Rspack, and Bun

## Notes

- The primary authoring API is `lingui-for-svelte/macro`. Runtime helpers exist mainly as the compilation target.
- Initialize Lingui context before translated markup runs. In practice, a root layout is the safest place.
- `$t` is a reactive store-like form specific to Svelte — it re-evaluates when the active locale changes. It is not a Svelte 5 rune despite the `$` prefix.
- Plain `.js`, `.ts`, `.svelte.js`, and `.svelte.ts` macro support comes from `unplugin-lingui-macro`, not from the Svelte transform itself.

## Repository References

These links point to paths inside the source repository and are only useful when browsing the repo directly.

- Docs source: [`apps/docs/src/content/docs/frameworks/svelte/getting-started.mdx`](../../apps/docs/src/content/docs/frameworks/svelte/getting-started.mdx)
- Verification app: [`examples/e2e-svelte`](../../examples/e2e-svelte)
