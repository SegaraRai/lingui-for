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
- `vp run build:wasm`: Build the `lingui-analyzer` Wasm package into `shared/lingui-analyzer-wasm/dist`.
- `vp run build:lib`: Build the public libraries.
- `vp run build:examples`: Build the verification examples.
- `vp run build:docs`: Build the docs app.
- `vp run check`: Run formatting checks, type checks, and markup checks across the workspace.
- `vp run test`: Build first, then run the Vitest suite.
- `vp run dev:docs`: Start the docs app.
- `vp run dev:e2e-astro`: Start the Astro verification app.
- `vp run dev:e2e-svelte`: Start the Svelte verification app.

## Workspace Apps

- [`apps/docs`](./apps/docs): Documentation site.
- [`examples/config-types`](./examples/config-types): Type-level checks for framework config combinations.
- [`examples/conformance`](./examples/conformance): Conformance tests with examples of various patterns and their expected output.
- [`examples/e2e-astro`](./examples/e2e-astro): End-to-end Astro verification app.
- [`examples/e2e-svelte`](./examples/e2e-svelte): End-to-end Svelte verification app.

## Internal Packages and Crates

- [`crates/lingui-analyzer`](./crates/lingui-analyzer): Rust crate for Svelte/Astro analysis and lowering, compiled to Wasm for use in the integrations.
- [`packages/framework-core`](./packages/framework-core): Shared compile, config, Wasm-loading, Babel, and runtime helpers used by `lingui-for-svelte` and `lingui-for-astro`.
- [`packages/unplugin-markup-import`](./packages/unplugin-markup-import): Shared markup import tooling used by the integrations.
- [`shared/common`](./shared/common): Private TypeScript helpers shared by workspace packages.
- [`shared/lingui-analyzer-wasm`](./shared/lingui-analyzer-wasm): Internal Wasm package used by extraction and compilation code.
- [`shared/test-helpers`](./shared/test-helpers): Private test utilities shared by package and conformance tests.

## Framework Integration Notes

- Svelte integration work should use Svelte 5 runes and the reactive macro model documented in [`packages/lingui-for-svelte/REACTIVITY.md`](./packages/lingui-for-svelte/REACTIVITY.md).
- Framework-specific compile behavior belongs in `packages/lingui-for-svelte` or `packages/lingui-for-astro`.
- Shared compile, config, Wasm-loading, Babel, and runtime helpers belong in `packages/framework-core` only when both framework integrations use the behavior.

## Repository Layout

```text
.
|- apps/
|  |- docs/
|- examples/
|  |- config-types/
|  |- conformance/
|  |- e2e-astro/
|  |- e2e-svelte/
|- crates/
|  |- lingui-analyzer/
|- packages/
|  |- framework-core/
|  |- lingui-for-astro/
|  |- lingui-for-svelte/
|  |- unplugin-lingui-macro/
|  |- unplugin-markup-import/
|- shared/
|  |- common/
|  |- lingui-analyzer-wasm/
|  |- test-helpers/
```

## Notes

- Public package usage and API details should live in each package README.
- The example apps exist to catch regressions in extraction, compilation, and runtime behavior.
- The docs app is the primary place for user-facing guides and framework documentation.
