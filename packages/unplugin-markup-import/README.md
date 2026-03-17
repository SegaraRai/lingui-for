# unplugin-markup-import

Experimental build helper for preserving markup modules in the [lingui-for](https://github.com/SegaraRai/lingui-for) project build.

> [!WARNING]
> This package is built specifically for the lingui-for monorepo and is not intended as a general-purpose tool. As such, it is experimental, carries no support commitment, and its API and behavior may change without notice. Unless you are solving a similar packaging problem for shipped `.svelte` or `.astro` runtime files, you probably do not want this package.

## What It Does

`unplugin-markup-import` is an unplugin-based build helper that preserves selected markup files in bundle output and rewrites certain relative imports through generated facade modules.

In this repository it is used during package builds so runtime markup files can be emitted correctly from published packages.

Current framework handling:

- `svelte`
- `astro`

## Where It Is Used Here

- [`packages/lingui-for-svelte/tsdown.config.ts`](../lingui-for-svelte/tsdown.config.ts)
- [`packages/lingui-for-astro/tsdown.config.ts`](../lingui-for-astro/tsdown.config.ts)

## Install

```sh
pnpm add -D unplugin-markup-import
```

## Minimal Usage

Rolldown / tsdown style usage:

```ts
import markupImport from "unplugin-markup-import/rolldown";

export default {
  plugins: [markupImport()],
};
```

Astro-markup-only usage:

```ts
import markupImport from "unplugin-markup-import/rolldown";

export default {
  plugins: [markupImport({ frameworks: ["astro"] })],
};
```

## Options

```ts
import markupImport from "unplugin-markup-import/rolldown";

markupImport({
  rootDir: process.cwd(),
  sourceDir: "src",
  frameworks: ["svelte"],
});
```

Supported options:

- `rootDir`: base directory used to resolve the default `sourceDir`
- `sourceDir`: directory containing markup files to scan and rewrite
- `frameworks`: markup frameworks to preserve; supported values are `"svelte"` and `"astro"`

## Entrypoints

- `unplugin-markup-import`
- `unplugin-markup-import/vite`
- `unplugin-markup-import/rollup`
- `unplugin-markup-import/webpack`
- `unplugin-markup-import/esbuild`
- `unplugin-markup-import/rolldown`
- `unplugin-markup-import/rspack`
- `unplugin-markup-import/bun`
- `unplugin-markup-import/types`

## Notes

- This package exists to solve a packaging detail in lingui-for, not to provide a polished public abstraction.
- The public surface is intentionally small, but the underlying behavior is specialized.
- Expect rough edges if you try to use it outside this repository.
