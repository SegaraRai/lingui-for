# lingui-for-astro

## 0.2.0

### Minor Changes

- [`3ae22d6`](https://github.com/SegaraRai/lingui-for/commit/3ae22d65e18569544491b6e2c8b4a6d5618294a2) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Add `@lingui/cli`, `@lingui/conf`, and `@lingui/core` as peer dependencies.

- [`d270eff`](https://github.com/SegaraRai/lingui-for/commit/d270efff9530b3b24d880bf8f7f41ac87b43ad89) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Fix same-component initialization. `t` macros can now be used in the same `.astro` file that calls `setLinguiContext`.

  Previously, the compiler-injected prelude called `getLinguiContext` eagerly at the top of the frontmatter, before user code had a chance to run, causing a runtime error when a page managed its own Lingui context. The prelude now uses a lazy accessor (`createFrontmatterI18n`) that defers the context lookup until the first macro call.

- [`25ee5d0`](https://github.com/SegaraRai/lingui-for/commit/25ee5d05b458b206136b2f37a824e5dda58486bf) Thanks [@SegaraRai](https://github.com/SegaraRai)! - **BREAKING CHANGE** Remove some exports from `lingui-for-astro` and `lingui-for-astro/runtime`.

- [#6](https://github.com/SegaraRai/lingui-for/pull/6) [`6f9f5e1`](https://github.com/SegaraRai/lingui-for/commit/6f9f5e1bb2470ebff0e5424e31e1ca6c1cd103c5) Thanks [@SegaraRai](https://github.com/SegaraRai)! - **BREAKING CHANGE** Changed rich-text whitespace handling to be framework-aware by default. `<Trans>` and related component macros now normalize inter-node whitespace with `auto` semantics unless you opt back into JSX behavior with the new `whitespace` option.

  Added a `whitespace` setting for Svelte and Astro transforms/extractors so callers can choose between framework-aware behavior and JSX-compatible behavior when generating messages.

  **BREAKING CHANGE** The extractor exports are now factories. Update `extractors: [svelteExtractor, ...]` and `extractors: [astroExtractor, ...]` to `extractors: [svelteExtractor(), ...]` and `extractors: [astroExtractor(), ...]`.

### Patch Changes

- [`aef6453`](https://github.com/SegaraRai/lingui-for/commit/aef645394b314351e3c0427025f21aeffc876ee5) Thanks [@SegaraRai](https://github.com/SegaraRai)! - `getLinguiContext` now accepts `Astro.locals` directly (type `object`) instead of the full `Astro` object, making it symmetric with `setLinguiContext`. The internal `AstroLike` interface has been removed.

- [`7ee8b8c`](https://github.com/SegaraRai/lingui-for/commit/7ee8b8c03512ced8b8217daf72338ab7ba86b2be) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Fixed issue where the Astro extractor extracts extra messages.

## 0.1.1

### Patch Changes

- 86454f6: Migrate to Trusted Publishing.

## 0.1.0

### Minor Changes

- 997bc6f: Initial Release.
