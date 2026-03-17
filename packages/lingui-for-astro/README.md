# lingui-for-astro

Documentation: <https://lingui-for.roundtrip.dev/frameworks/astro/getting-started>

Macro-first Lingui integration for Astro.

It provides:

- an Astro integration for transforming `.astro` files
- a Lingui extractor for `.astro`
- runtime helpers for request-scoped Lingui context
- unplugin entrypoints for direct bundler use when needed

## Install

```sh
pnpm add @lingui/core lingui-for-astro
pnpm add -D @lingui/cli
```

If you also use Lingui macros in plain `.js` or `.ts` files, add `unplugin-lingui-macro` too:

```sh
pnpm add -D unplugin-lingui-macro
```

## Quick Start

Configure Astro:

```ts
import { defineConfig } from "astro/config";
import linguiForAstro from "lingui-for-astro/integration";
import linguiMacro from "unplugin-lingui-macro/vite";

export default defineConfig({
  integrations: [linguiForAstro()],
  vite: {
    plugins: [linguiMacro()],
  },
});
```

If you only use macros in `.astro` files, you can remove `unplugin-lingui-macro`.

Configure Lingui extraction:

```ts
import babelExtractor from "@lingui/cli/api/extractors/babel";
import { astroExtractor } from "lingui-for-astro/extractor";

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
  extractors: [astroExtractor, babelExtractor],
};
```

Initialize Lingui in middleware before pages render:

```ts
import { defineMiddleware } from "astro:middleware";
import { setupI18n } from "@lingui/core";
import { setLinguiContext } from "lingui-for-astro";

export const onRequest = defineMiddleware((context, next) => {
  const i18n = setupI18n({
    locale: "en",
    messages: {},
  });

  setLinguiContext(context.locals, i18n);
  return next();
});
```

Use macros in `.astro` files:

```astro
---
import { t, Trans } from "lingui-for-astro/macro";
---

<h1>{t`Hello from Astro`}</h1>

<p><Trans>Macro-first translation in Astro</Trans></p>
```

## Entrypoints

- `lingui-for-astro`: runtime exports such as `setLinguiContext`, `getLinguiContext`, and `RuntimeTrans`
- `lingui-for-astro/macro`: authoring macros such as `t`, `Trans`, `Plural`, `Select`, `SelectOrdinal`, `msg`, and `defineMessage`
- `lingui-for-astro/extractor`: `astroExtractor` for Lingui CLI extraction
- `lingui-for-astro/integration`: Astro integration entrypoint for `.astro` transforms
- `lingui-for-astro/unplugin/*`: bundler plugins for Vite, Rollup, Webpack, esbuild, Rolldown, Rspack, and Bun

## Notes

- The primary authoring API is `lingui-for-astro/macro`. Runtime helpers exist mainly as the compilation target.
- Astro translations are request-scoped. Install Lingui context in middleware or page setup before translated content renders.
- `lingui-for-astro` handles `.astro` files. Svelte or React islands should use their own Lingui integration path.
- MDX is not supported. If you need translated MDX content, keep separate `.mdx` files per locale.
- Plain `.js` and `.ts` macro support comes from `unplugin-lingui-macro`, not from the Astro transform itself.

## Repository References

- Docs source: [`apps/docs/src/content/docs/frameworks/astro/getting-started.mdx`](../../apps/docs/src/content/docs/frameworks/astro/getting-started.mdx)
- Verification app: [`examples/e2e-astro`](../../examples/e2e-astro)
