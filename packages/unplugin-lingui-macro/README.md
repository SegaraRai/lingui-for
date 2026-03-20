# unplugin-lingui-macro

[![npm](https://img.shields.io/npm/v/unplugin-lingui-macro)](https://www.npmjs.com/package/unplugin-lingui-macro)
[![Documentation](https://img.shields.io/badge/docs-lingui--for.roundtrip.dev-blue)](https://lingui-for.roundtrip.dev/guides/install-and-first-translation)

Bundler plugin for compiling Lingui macros in plain JavaScript and TypeScript modules.

**Requirements:** `@lingui/core` `^5.0.0`, Node.js 18+

This package is useful when your app uses Lingui macros outside framework-owned files such as `.svelte` or `.astro`.

It provides:

- Lingui macro compilation through `unplugin`
- Vite, Rollup, Webpack, esbuild, Rolldown, Rspack, and Bun entrypoints
- optional `linguiConfig` overrides for macro and runtime bindings

## Install

```sh
vp add -D unplugin-lingui-macro

# or run one of:
npm install -D unplugin-lingui-macro
pnpm add -D unplugin-lingui-macro
yarn add -D unplugin-lingui-macro
```

You will usually also want Lingui itself:

```sh
vp add @lingui/core
vp add -D @lingui/cli

# or
npm install @lingui/core
npm install -D @lingui/cli

# or
pnpm add @lingui/core
pnpm add -D @lingui/cli

# or
yarn add @lingui/core
yarn add -D @lingui/cli
```

## Quick Start

Vite:

```ts
import { defineConfig } from "vite";
import linguiMacro from "unplugin-lingui-macro/vite";

export default defineConfig({
  plugins: [linguiMacro()],
});
```

Then use Lingui macros in plain modules:

```ts
import { t } from "@lingui/core/macro";

export const pageTitle = t`Settings`;
```

## What It Transforms

The plugin scans script-like files and only runs when it finds Lingui macro imports.

By default it supports Lingui macro imports from:

- `@lingui/core/macro`
- `@lingui/macro`
- `@lingui/react/macro`

These are used only to detect whether a file needs transformation. `@lingui/react/macro` is included so that React projects importing from that path are handled correctly in plain `.js` and `.ts` files alongside React islands.

Framework packages such as `lingui-for-svelte` and `lingui-for-astro` can also pass their own macro package names through `linguiConfig`.

## Options

```ts
import linguiMacro from "unplugin-lingui-macro/vite";

export default {
  plugins: [
    linguiMacro({
      linguiConfig: {
        runtimeConfigModule: {
          i18n: ["@lingui/core", "i18n"],
        },
      },
    }),
  ],
};
```

Supported option shape:

- `linguiConfig`: partial Lingui config forwarded to the Lingui Babel macro plugin. See the [Lingui configuration reference](https://lingui.dev/ref/conf) for available fields.

## Entrypoints

- `unplugin-lingui-macro`: base unplugin instance
- `unplugin-lingui-macro/vite`
- `unplugin-lingui-macro/rollup`
- `unplugin-lingui-macro/webpack`
- `unplugin-lingui-macro/esbuild`
- `unplugin-lingui-macro/rolldown`
- `unplugin-lingui-macro/rspack`
- `unplugin-lingui-macro/bun`
- `unplugin-lingui-macro/types`

## Notes

- This package is for plain script modules. Use framework-specific packages for framework-owned files such as `.svelte` and `.astro`.
- The transform runs only for files that actually import Lingui macros.
- It does not perform Lingui extraction by itself. Extraction still comes from Lingui CLI and the relevant extractor setup.

## Repository References

These links point to paths inside the source repository and are only useful when browsing the repo directly.

- Docs source: [`apps/docs/src/content/docs/guides/install-and-first-translation.mdx`](../../apps/docs/src/content/docs/guides/install-and-first-translation.mdx)
- Used by: [`packages/lingui-for-svelte`](../lingui-for-svelte) and [`packages/lingui-for-astro`](../lingui-for-astro)
