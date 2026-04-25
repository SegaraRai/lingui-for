# AGENTS.md for lingui-for

## Core Rules

- Always use Svelte 5 syntax with runes.
- Use Vite+ (`vp`) instead of `npx` and `pnpm` for all commands.
- DO NOT invoke `vp` or `pnpm` from test code.

## Writing Tests

When writing tests, the most important thing is the accuracy of the test code. It’s not about having all tests pass.
If you believe a test case is correct, don’t modify it; instead, **mark it as `test.fails`** so that you can review it later to determine whether the test or the implementation is incorrect.

## Terminology

- `extract`: Read source code and collect Lingui messages for catalogs. This path should not describe runtime code rewriting.
- `transform`: Rewrite source code for runtime use. This includes macro lowering, runtime import injection, transform plans, and final transformed source generation.
- `compile`: Use only as an umbrella term for shared TypeScript package structure that supports both extract and transform, such as `packages/*/src/compile` and `@lingui-for/framework-core/compile`. Do not use `compile` for transform-only Rust crate modules or APIs.
- `lower`: A transform-stage implementation detail that rewrites framework macro forms into Lingui macro/runtime forms.

## Common Commands

- `cargo test`: run Rust tests
- `vp run build`: build the package
- `vp run test`: run tests with Vitest
  - You can pass extra arguments to Vitest, such as `vp run test <filename>`.
- `cargo fmt && vp run format`: format code (workspace root only)
- `vp run check`: run formatting checks and type checks
- `vp exec <command>`: run an external package command, such as `vp exec lingui extract`.
- `vp add <package>`: add a new package

TIP: Run `cargo fmt && vp run format` → `vp run check` → `vp run test` sequentially to ensure a smooth development workflow.

## Common Pitfalls

- **IMPORTANT**: DO NOT run `vp run build`, `vp run check`, or `vp run test` concurrently. Run sequentially to avoid conflicts in build artifacts. Build is cached so it’s not a problem to run them one after another.
- DO NOT use `vp test`, `vp pack`, or `vp build`. Use `vp run build` from the workspace root.

## Project Dependencies

- `packages/unplugin-markup-import`
  Build required for `packages/lingui-for-svelte`, `packages/lingui-for-astro`, `examples/*`, and `apps/*`.
- `packages/lingui-for-astro`, `packages/lingui-for-svelte`, and `packages/unplugin-lingui-macro`
  Build required for `examples/*`, and `apps/*`.

All `vp run *` commands handle dependencies automatically so you don't need to worry about the build order when working on the project.
Just run the command for the package you're working on, and it will take care of building any dependencies as needed.
