# e2e-svelte

Verification app for [`lingui-for-svelte`](../../packages/lingui-for-svelte).

This project is not a product example to maintain as polished documentation. It exists to catch regressions in extraction, compilation, SSR output, hydration, and locale switching inside a small SvelteKit app.

## What It Covers

- route-local macros in `.svelte`
- reactive `$t(...)` usage with Svelte 5 runes
- rich text with `Trans`
- ICU component macros such as `Plural`, `Select`, and `SelectOrdinal`
- explicit ids, comments, and context variants
- descriptors imported from plain TypeScript
- extracted catalogs and compiled locale output
- browser hydration and client-side locale switching

## Important Routes

- `/`: app shell and locale persistence flow
- `/settings`: locale switching UI
- `/playground/basic`: direct macro usage
- `/playground/reactive`: `$t` with rune-backed state
- `/playground/syntax`: translations across different Svelte syntax positions
- `/playground/rich-text`: rich text and embedded elements
- `/playground/components`: ICU component macros
- `/playground/ids`: explicit ids, comments, and context coverage

## Commands

From this directory:

```sh
pnpm install
pnpm run dev
pnpm run build
pnpm run test
```

Useful scripts:

- `pnpm run lingui:extract`: extract messages
- `pnpm run lingui:compile`: compile catalogs
- `pnpm run lingui:build`: run extract and compile
- `pnpm run build`: rebuild catalogs and build the SvelteKit app
- `pnpm run preview`: run the built app
- `pnpm run check`: run TypeScript and Svelte checks
- `pnpm run test:e2e run`: run SSR/e2e-style Vitest checks
- `pnpm run test:browser run`: run browser hydration tests

## Related Packages

- [`lingui-for-svelte`](../../packages/lingui-for-svelte)
- [`unplugin-lingui-macro`](../../packages/unplugin-lingui-macro)

## Notes

- The app intentionally keeps verification-focused routes separate from the main app shell.
- Test expectations live in [`src/app.e2e.test.ts`](./src/app.e2e.test.ts), [`src/extract.e2e.test.ts`](./src/extract.e2e.test.ts), and [`src/hydration.browser.test.ts`](./src/hydration.browser.test.ts).
