# AGENTS.md for lingui-for

## Core Rules

- Always use Svelte 5 syntax with runes.
- Use Vite+ (`vp`) instead of `pnpm` for all commands.
- DO NOT invoke `vp` or `pnpm` from test code.

## Common Commands

- `vp run build`: build the package
- `vp run test`: run tests with Vitest
  - Our codebase requires building packages before running tests. Run `vp run build` before `vp run test` to ensure tests run correctly.
- `vp run format`: format code
- `vp run check`: run type checks and other static checks

## Project Dependencies

- `crates/astro-analyzer` and `packages/astro-analyzer-wasm`
  Build required for `packages/lingui-for-astro`, `examples/*`, and `apps/*`.
  Run `vp run build:wasm` from the workspace root to build both.
- `packages/unplugin-markup-import`
  Build required for `packages/lingui-for-svelte`, `packages/lingui-for-astro`, `examples/*`, and `apps/*`.
  Run `vp run build:lib` from the workspace root to build all libraries in correct order.
- `packages/lingui-for-astro`, `packages/lingui-for-svelte`, and `packages/unplugin-lingui-macro`
  Build required for `examples/*`, and `apps/*`.
  Run `vp run build:lib` from the workspace root to build all libraries in correct order.

Run `vp run build` from the workspace root to build all libraries and examples in correct order.
