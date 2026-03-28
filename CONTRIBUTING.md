# Contributing

## Requirements

- [Vite+](https://viteplus.dev/)
  - [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) will be installed automatically by Vite+. If not, you can install them manually: Node.js 24+ and pnpm 10+.
- [Rust](https://www.rust-lang.org/) for building `lingui-analyzer` (`lingui-analyzer-wasm`)

## Getting Started

```sh
vp install
vp run build
vp run test
```

Useful commands from the workspace root:

- `cargo test`: Run Rust tests.
- `cargo fmt && vp run format`: Format code.
- `vp run build`: Build libraries, examples, and docs.
- `vp run check`: Run formatting checks, type checks, and markup checks across the workspace.
- `vp run test`: Run the Vitest suite.
- `vp run dev:docs`: Start the docs app.
- `vp run dev:e2e-astro`: Start the Astro verification app.
- `vp run dev:e2e-svelte`: Start the Svelte verification app.

## Workspace Apps

- [`apps/docs`](./apps/docs): Documentation site.
- [`examples/conformance`](./examples/conformance): Conformance tests with examples of various patterns and their expected output.
- [`examples/e2e-astro`](./examples/e2e-astro): End-to-end Astro verification app.
- [`examples/e2e-svelte`](./examples/e2e-svelte): End-to-end Svelte verification app.

## Internal Packages and Crates

- [`packages/unplugin-markup-import`](./packages/unplugin-markup-import): Shared markup import tooling used by the integrations.
- [`shared/lingui-analyzer-wasm`](./shared/lingui-analyzer-wasm): Internal Wasm package used by extraction and compilation code.
- [`crates/lingui-analyzer`](./crates/lingui-analyzer): Rust crate for Svelte/Astro analysis and lowering, compiled to Wasm for use in the integrations.

## Repository Layout

```text
.
|- apps/
|  |- docs/
|- examples/
|  |- conformance/
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
