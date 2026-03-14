- Always use Svelte 5 syntax with runes.
- In `packages/lingui-svelte/src/runtime/*.svelte`, you can import ONLY `*.svelte` and/or `./component-utils`.
  You must not import individual ts files since tsdown do not rewrite import paths of svelte.
- DO NOT invoke `pnpm` from test code.
