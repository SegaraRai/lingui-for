# e2e-astro

Verification app for [`lingui-for-astro`](../../packages/lingui-for-astro).

This project exists to validate `lingui-for-astro` in a realistic Astro app with request-scoped translations, mixed framework islands, rich text, extraction, and transition behavior.

## What It Covers

- request-scoped translations in `.astro` pages
- `setLinguiContext` through Astro middleware
- shared descriptors imported from plain TypeScript
- Svelte and React islands inside Astro
- rich text translation output
- ICU macro formatting
- locale cookie reuse across requests
- dynamic routing
- transition behavior with and without `ClientRouter`
- extracted catalogs and compiled locale output

## Important Routes

- `/`: overview page linking all verification routes
- `/server`: request-scoped Astro translations
- `/islands`: Svelte and React islands in the same app
- `/rich-text`: linked and emphasized translations
- `/formats`: plural, select, and ordinal formatting
- `/routing/[slug]`: dynamic route and locale cookie behavior
- `/settings`: locale persistence UI
- `/transitions`: client transition checks

## Commands

From this directory:

```sh
pnpm run dev
pnpm run build
pnpm run test
```

Useful scripts:

- `pnpm run lingui:extract`: extract messages
- `pnpm run lingui:compile`: compile catalogs
- `pnpm run lingui:build`: run extract and compile
- `pnpm run build`: rebuild catalogs and build the Astro app
- `pnpm run preview`: preview the built app
- `pnpm run check`: run TypeScript and Astro checks
- `pnpm run test`: build first, then run the Vitest suite

## Related Packages

- [`lingui-for-astro`](../../packages/lingui-for-astro)
- [`lingui-for-svelte`](../../packages/lingui-for-svelte)
- [`unplugin-lingui-macro`](../../packages/unplugin-lingui-macro)

## Notes

- This example intentionally mixes Astro pages with Svelte and React islands to verify integration boundaries.
- Test expectations live in [`src/app.e2e.test.ts`](./src/app.e2e.test.ts) and [`src/extract.e2e.test.ts`](./src/extract.e2e.test.ts).
