# @lingui-for/framework-core

[![npm](https://img.shields.io/npm/v/@lingui-for/framework-core)](https://www.npmjs.com/package/@lingui-for/framework-core)

Shared framework compile, config, and runtime helpers for the [lingui-for](https://github.com/SegaraRai/lingui-for) package family.

> [!WARNING]
> This package is built specifically for the lingui-for package family and is primarily an implementation dependency of [`lingui-for-svelte`](../lingui-for-svelte) and [`lingui-for-astro`](../lingui-for-astro). It is published so those integrations can share compiled helpers, but it is not intended as a general-purpose public API. Most applications should not depend on it directly, and its API and behavior may change without notice.

## What Lives Here

- Lingui config loading and `defineConfig` plumbing shared by the framework integrations.
- Wasm loader entrypoints for the Rust `lingui-analyzer` build.
- Shared compile utilities, Babel wrappers, source-map helpers, and macro presence checks.
- Shared rich-text runtime formatting used by framework runtime components.

## Entrypoints

- `@lingui-for/framework-core`
- `@lingui-for/framework-core/compile`
- `@lingui-for/framework-core/compile/wasm-loader`
- `@lingui-for/framework-core/compile/wasm-loader-vite`
- `@lingui-for/framework-core/config`
- `@lingui-for/framework-core/runtime`
- `@lingui-for/framework-core/vendor/babel-core`
- `@lingui-for/framework-core/vendor/babel-types`

## Development

From the workspace root:

```sh
vp run build:wasm
vp run --filter @lingui-for/framework-core build
vp run --filter @lingui-for/framework-core check
vp run --filter @lingui-for/framework-core test
```

The package build depends on `lingui-for-workspace#build:wasm`, which emits the generated Wasm bundle into [`shared/lingui-analyzer-wasm/dist`](../../shared/lingui-analyzer-wasm/dist).

## Notes

- Public framework APIs live in `lingui-for-svelte` and `lingui-for-astro`.
- Keep code here framework-neutral unless both framework packages genuinely share the behavior.
- The Wasm source remains in [`crates/lingui-analyzer`](../../crates/lingui-analyzer); this package only loads and wraps the generated artifact.
