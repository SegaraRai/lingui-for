# lingui-for Documentation

Documentation site for lingui-for.

Production URL: <https://lingui-for.roundtrip.dev/>

This app is built with Astro and Starlight and contains the user-facing guides, framework setup pages, macro references, and conceptual documentation for the workspace.

## What Lives Here

- framework guides for Svelte and Astro
- macro reference pages
- installation and workflow guides
- the public docs site configuration and sidebar structure

Most authored content lives under [`src/content`](./src/content).

## Commands

From this directory:

```sh
pnpm run dev
pnpm run build
pnpm run check
```

Useful scripts:

- `pnpm run dev`: start the local docs site
- `pnpm run build`: build the static site
- `pnpm run preview`: preview the built site
- `pnpm run lingui:extract`: extract Lingui messages from docs source
- `pnpm run lingui:compile`: compile catalogs
- `pnpm run lingui:build`: run extract and compile
- `pnpm run check`: run Astro type/content checks
