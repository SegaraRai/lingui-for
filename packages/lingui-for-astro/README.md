# lingui-for-astro

[![npm](https://img.shields.io/npm/v/lingui-for-astro)](https://www.npmjs.com/package/lingui-for-astro)
[![Documentation](https://img.shields.io/badge/docs-lingui--for.roundtrip.dev-blue)](https://lingui-for.roundtrip.dev/frameworks/astro/getting-started)

Macro-first Lingui integration for Astro.

It provides:

- an Astro integration for transforming `.astro` files
- a Lingui extractor for `.astro`
- runtime helpers for request-scoped Lingui context
- unplugin entrypoints for direct bundler use when needed

**Requirements:** Astro `^5.0.0` or `^6.0.0`, `@lingui/core` `^5.0.0`, Node.js 18+

## Install

```sh
vp add @lingui/core lingui-for-astro
vp add -D @lingui/cli @lingui/conf

# or
npm install @lingui/core lingui-for-astro
npm install -D @lingui/cli @lingui/conf

# or
pnpm add @lingui/core lingui-for-astro
pnpm add -D @lingui/cli @lingui/conf

# or
yarn add @lingui/core lingui-for-astro
yarn add -D @lingui/cli @lingui/conf
```

If you also use Lingui macros in plain `.js` or `.ts` files, add `unplugin-lingui-macro` too:

```sh
vp add -D unplugin-lingui-macro

# or run one of:
npm install -D unplugin-lingui-macro
pnpm add -D unplugin-lingui-macro
yarn add -D unplugin-lingui-macro
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
import { defineConfig } from "@lingui/conf";
import { astroExtractor } from "lingui-for-astro/extractor";

export default defineConfig({
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
});
```

Initialize Lingui in middleware before pages render. After running `lingui compile`, import the compiled message catalogs:

```ts
import { defineMiddleware } from "astro:middleware";
import { setupI18n } from "@lingui/core";
import { setLinguiContext } from "lingui-for-astro";
import { catalog } from "./lib/i18n/catalog";

export const onRequest = defineMiddleware((context, next) => {
  const locale = resolveLocale(context); // your locale resolution logic
  const i18n = setupI18n({ locale, messages: catalog });
  setLinguiContext(context.locals, i18n);
  return next();
});
```

> [!INFO]
> `catalog` is a locale-keyed object (`{ en: ..., ja: ... }`).
> See [Load Compiled Catalogs](https://lingui-for.roundtrip.dev/guides/load-compiled-catalogs) for how to structure the catalog file and choose a loading strategy.

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
- Astro translations are request-scoped. Install Lingui context before translated content renders, preferably in middleware.
- Astro middleware is the recommended initialization point in all output modes. Page frontmatter setup also works for simple page-level cases, but it should be treated as an escape hatch rather than the default pattern.
- `lingui-for-astro` handles `.astro` files. For UI framework islands (Svelte, React, Vue, etc.), use the corresponding Lingui integration for that framework. See the [Lingui documentation](https://lingui.dev) for available integrations.
- MDX is not supported. If you need translated MDX content, keep separate `.mdx` files per locale.
- Plain `.js` and `.ts` macro support comes from `unplugin-lingui-macro`, not from the Astro transform itself.

## Repository References

These links point to paths inside the source repository and are only useful when browsing the repo directly.

- Docs source: [`apps/docs/src/content/docs/frameworks/astro/getting-started.mdx`](../../apps/docs/src/content/docs/frameworks/astro/getting-started.mdx)
- Verification app: [`examples/e2e-astro`](../../examples/e2e-astro)
