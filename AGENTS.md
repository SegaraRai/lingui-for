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

## Common Pitfalls

- `vp fmt` does not support `.astro` and `.svelte` files. Use `vp run format` instead, which runs both Prettier and `vp fmt` under the hood.
- Always use `vp run build`, `vp run test`, `vp run check` instead of `vp *`. This ensures that all pre-requisite steps are run before the command, such as building packages before testing.

## Project Dependencies

- `crates/astro-analyzer` and `packages/astro-analyzer-wasm`
  Build required for `packages/lingui-for-astro`, `examples/*`, and `apps/*`.
- `packages/unplugin-markup-import`
  Build required for `packages/lingui-for-svelte`, `packages/lingui-for-astro`, `examples/*`, and `apps/*`.
- `packages/lingui-for-astro`, `packages/lingui-for-svelte`, and `packages/unplugin-lingui-macro`
  Build required for `examples/*`, and `apps/*`.

All `vp run *` commands handle dependencies automatically so you don't need to worry about the build order when working on the project.
Just run the command for the package you're working on, and it will take care of building any dependencies as needed.
