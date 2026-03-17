# astro-analyzer

Internal Rust crate for Astro source analysis.

This crate parses `.astro` source with [tree-sitter-astro](https://github.com/SegaraRai/tree-sitter-astro) and returns structural metadata used by [`lingui-for-astro`](../../packages/lingui-for-astro) during transform and extraction work.

It is not published independently and is not intended to be consumed directly outside this repository.

## What It Does

- parses `.astro` source
- identifies frontmatter, expressions, and component candidates
- returns byte-range based analysis data for downstream transforms
- exposes a Wasm entrypoint consumed by the workspace

The Wasm-facing entrypoint is `analyzeAstro` in [`src/lib.rs`](./src/lib.rs).

## Where It Is Used

- built into [`astro-analyzer-wasm`](../../packages/astro-analyzer-wasm)
- consumed by [`lingui-for-astro`](../../packages/lingui-for-astro)

## Commands

From the workspace root:

```sh
cargo test -p astro-analyzer
pnpm run build:wasm
pnpm run build:wasm-dev
```

From this directory:

```sh
cargo test
wasm-pack build --target web --release --out-dir ../../packages/astro-analyzer-wasm/dist --out-name index
```

## Structure

- [`src/lib.rs`](./src/lib.rs): crate entrypoint and Wasm export
- [`src/parse.rs`](./src/parse.rs): parsing layer
- [`src/analyze.rs`](./src/analyze.rs): analysis output and traversal logic
- [`tests/analysis.rs`](./tests/analysis.rs): regression tests

## Notes

- This crate is `publish = false`. Wasm package is also private and not meant for direct installation.
- The generated Wasm artifacts are written into `packages/astro-analyzer-wasm/dist`.
- If you change analysis behavior here, `lingui-for-astro` transform behavior may change as well.
