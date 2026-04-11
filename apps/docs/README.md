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
vp run dev
vp run build
vp run check
```

Useful scripts:

- `vp run dev`: start the local docs site
- `vp run build`: build the static site
- `vp run preview`: preview the built site
- `vp run i18n:extract`: extract Lingui messages from docs source
- `vp run i18n:build`: extract messages, compile catalogs, and format generated locale output
- `vp run check`: run Astro type/content checks
