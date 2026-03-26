# Contributing

## Getting Started

```sh
vp install
vp run build
vp run test
```

Useful commands from the workspace root:

- `vp run build`: Build libraries, examples, and docs.
- `vp run check`: Run TypeScript and markup checks across the workspace.
- `vp run test`: Run the Vitest suite.
- `vp run dev:docs`: Start the docs app.
- `vp run dev:e2e-svelte`: Start the Svelte verification app.
- `vp run dev:e2e-astro`: Start the Astro verification app.
- `vp run build:wasm`: Rebuild the Lingui analyzer Wasm package in release mode.
- `vp run build:wasm-dev`: Rebuild the Lingui analyzer Wasm package in dev mode.

## Workspace Apps

- [`apps/docs`](./apps/docs): Documentation site.
- [`examples/conformance`](./examples/conformance): Conformance tests with examples of various patterns and their expected output.
- [`examples/e2e-svelte`](./examples/e2e-svelte): End-to-end Svelte verification app.
- [`examples/e2e-astro`](./examples/e2e-astro): End-to-end Astro verification app.

## Internal Packages and Crates

- [`packages/unplugin-markup-import`](./packages/unplugin-markup-import): Shared markup import tooling used by the integrations.
- [`shared/lingui-analyzer-wasm`](./shared/lingui-analyzer-wasm): Internal Wasm package used by extraction and compilation code.
- [`crates/lingui-analyzer`](./crates/lingui-analyzer): Rust crate for Svelte/Astro analysis and lowering, compiled to Wasm for use in the integrations.

## Requirements

- Node.js
- Vite+
- Rust for building `lingui-analyzer` (`lingui-analyzer-wasm`)

## Repository Layout

```text
.
|- apps/
|  |- docs/
|- examples/
|  |- e2e-astro/
|  |- e2e-svelte/
|- crates/
|  |- lingui-analyzer/
|- packages/
|  |- lingui-for-astro/
|  |- lingui-for-svelte/
|  |- unplugin-lingui-macro/
|  |- unplugin-markup-import/
|- shared/
|  |- lingui-analyzer-wasm/
|  |- common/
|  |- compile/
|  |- runtime/
|  |- test-helpers/
```

## Notes

- Public package usage and API details should live in each package README.
- The example apps exist to catch regressions in extraction, compilation, and runtime behavior.
- The docs app is the primary place for user-facing guides and framework documentation.
