# astro-analyzer-wasm

Internal workspace package for the built WebAssembly bundle of `astro-analyzer`.

- Rust source lives in [crates/astro-analyzer](../../crates/astro-analyzer).
- Build output is emitted into `dist/` and consumed by future JS tooling packages.
- This package is private and not meant for direct installation.

## Build

From the repo root:

- `pnpm build:astro-analyzer:wasm`
- `pnpm build:astro-analyzer:wasm-dev`

These commands run `wasm-pack` for `crates/astro-analyzer` and write the generated JS wrapper,
TypeScript declarations, and `.wasm` binary into this package's `dist/` directory.
