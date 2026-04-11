# @lingui-for/internal-lingui-analyzer-wasm

Internal workspace package for the built WebAssembly bundle of `lingui-analyzer`.

- Rust source lives in [crates/lingui-analyzer](../../crates/lingui-analyzer).
- Build output is emitted into `dist/` and consumed by test tooling.
- This package is private and not meant for direct installation.

## Build

From the repo root:

- `vp run build:wasm`

This command runs `wasm-pack` for `crates/lingui-analyzer` and writes the generated JS wrapper, TypeScript declarations, and `.wasm` binary into this package's `dist/` directory.

Set `LINGUI_WASM_PREBUILT=1` to skip rebuilding when `dist/` already contains the expected Wasm output. Set `LINGUI_WASM_DEBUG=1` to build the Wasm target in debug mode.
