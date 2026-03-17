# lingui-for

_Bring Lingui's macro-first localization model to Svelte and Astro._

Documentation: <https://lingui-for.roundtrip.dev>

lingui-for exists for teams who want the strengths of Lingui in frameworks that need framework-specific integration. It keeps Lingui's core authoring model intact while making it feel natural in Svelte and Astro.

That means you can keep the parts of Lingui that are actually valuable: powerful macros, interpolation, rich-text translations, extract and compile workflows, and compact compiled message output. And you get them in a form that matches each framework instead of fighting it.

In Svelte, that means translations fit naturally into the framework's reactive model. In Astro, that means request-aware translation with clear runtime boundaries. The goal is not to invent a new i18n system. The goal is to make Lingui work properly where users already want to use it.

## Why lingui-for

- Full Lingui-style macro authoring in Svelte and Astro.
- Support for interpolation and rich-text translations, including component macros such as `Trans`, `Plural`, `Select`, and `SelectOrdinal`.
- The usual Lingui extraction and compilation workflow, so existing Lingui knowledge still applies.
- Access to Lingui's runtime advantages, including compact compiled message output.
- Framework-aware behavior instead of a generic wrapper:
  request-aware in Astro, reactive in Svelte.
- Smooth adoption without switching to a different message model.

## Framework Fit

lingui-for does not force identical behavior across frameworks.

- Svelte gets reactive ergonomics because Svelte has a reactivity model that can host them naturally.
- Astro gets request-scoped translation because Astro is server-oriented and mostly non-reactive.

That asymmetry is intentional. The goal is not identical implementation. The goal is to deliver Lingui's value in the way each framework can support well.

## Choose Your Path

- Learn the design goals: <https://lingui-for.roundtrip.dev/concepts>
- Start with Svelte: <https://lingui-for.roundtrip.dev/frameworks/svelte/getting-started>
- Start with Astro: <https://lingui-for.roundtrip.dev/frameworks/astro/getting-started>
- Browse the macro reference: <https://lingui-for.roundtrip.dev/macros/core-macros>
- Working on this repository: jump to [For Contributors](#for-contributors)

## Packages

- [`packages/lingui-for-svelte`](./packages/lingui-for-svelte): Lingui integration for Svelte.
- [`packages/lingui-for-astro`](./packages/lingui-for-astro): Lingui integration for Astro.
- [`packages/unplugin-lingui-macro`](./packages/unplugin-lingui-macro): Unplugin wrapper for Lingui macro transforms.

For package-level setup and API details, start with the README inside each package directory.

## For Contributors

```sh
pnpm install
pnpm run build
pnpm run test
```

Useful commands from the workspace root:

- `pnpm run build`: Build libraries, examples, and docs.
- `pnpm run check`: Run TypeScript and markup checks across the workspace.
- `pnpm run test`: Run the Vitest suite.
- `pnpm run dev:docs`: Start the docs app.
- `pnpm run dev:e2e-svelte`: Start the Svelte verification app.
- `pnpm run dev:e2e-astro`: Start the Astro verification app.
- `pnpm run build:wasm`: Rebuild the Astro analyzer Wasm package in release mode.
- `pnpm run build:wasm-dev`: Rebuild the Astro analyzer Wasm package in dev mode.

## Repository Details

### Workspace Apps

- [`apps/docs`](./apps/docs): Documentation site.
- [`examples/e2e-svelte`](./examples/e2e-svelte): End-to-end Svelte verification app.
- [`examples/e2e-astro`](./examples/e2e-astro): End-to-end Astro verification app.

### Internal Packages and Crates

- [`packages/unplugin-markup-import`](./packages/unplugin-markup-import): Shared markup import tooling used by the integrations.
- [`packages/astro-analyzer-wasm`](./packages/astro-analyzer-wasm): Internal Wasm package used by Astro analysis code.
- [`crates/astro-analyzer`](./crates/astro-analyzer): Rust crate for analyzing Astro files, compiled to Wasm for use in the integrations.

### Requirements

- Node.js
- pnpm
- Rust for rebuilding `astro-analyzer-wasm`

### Repository Layout

```text
.
|- apps/
|  |- docs/
|- examples/
|  |- e2e-astro/
|  |- e2e-svelte/
|- packages/
|  |- astro-analyzer-wasm/
|  |- lingui-for-astro/
|  |- lingui-for-svelte/
|  |- unplugin-lingui-macro/
|  |- unplugin-markup-import/
|- crates/
|  |- astro-analyzer/
```

### Notes

- Public package usage and API details should live in each package README.
- The example apps exist to catch regressions in extraction, compilation, and runtime behavior.
- The docs app is the primary place for user-facing guides and framework documentation.
