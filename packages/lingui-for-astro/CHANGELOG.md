# lingui-for-astro

## 0.4.1

### Patch Changes

- [#26](https://github.com/SegaraRai/lingui-for/pull/26) [`b7a6385`](https://github.com/SegaraRai/lingui-for/commit/b7a63851068664371855c444e0c2ec9cd49f5a57) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Broaden dependency version ranges for Babel, Lingui macro, and oxc-parser packages.

- Updated dependencies [[`b7a6385`](https://github.com/SegaraRai/lingui-for/commit/b7a63851068664371855c444e0c2ec9cd49f5a57)]:
  - @lingui-for/framework-core@0.4.1

## 0.4.0

### Minor Changes

- [#22](https://github.com/SegaraRai/lingui-for/pull/22) [`a76b579`](https://github.com/SegaraRai/lingui-for/commit/a76b579be0fddce9cbc68edb1387608ff738f831) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Restrict rich-text whitespace modes to the owning framework.

  `lingui-for-astro` now accepts only `"astro"` and `"jsx"` for `framework.astro.whitespace`, while `lingui-for-svelte` now accepts only `"svelte"` and `"jsx"` for `framework.svelte.whitespace`. The previous public `"auto"` mode is removed.

- [#22](https://github.com/SegaraRai/lingui-for/pull/22) [`a76b579`](https://github.com/SegaraRai/lingui-for/commit/a76b579be0fddce9cbc68edb1387608ff738f831) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Unify transform-time Lingui config loading around a new `config` option and
  `defineConfig` helpers.

  `lingui-for-svelte` and `lingui-for-astro` now load Lingui config files during
  transforms using Lingui-compatible config discovery and `jiti`. The old
  `linguiConfig` transform option has been replaced by `config`, which accepts a
  config file path, `URL`, or direct config object. Framework-specific settings
  should now live under `framework.svelte` or `framework.astro`, and the packages
  now export `/config` helpers for authoring typed config objects.

  `unplugin-lingui-macro` now uses the same `config` option name instead of
  `linguiConfig`.

### Patch Changes

- [#13](https://github.com/SegaraRai/lingui-for/pull/13) [`024d9af`](https://github.com/SegaraRai/lingui-for/commit/024d9afc1efdeea188d6bcebd7e3f21f97d98858) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Improve `<Trans>` validation by rejecting unsupported child syntax with file and location-aware diagnostics in Svelte and Astro.

- [#11](https://github.com/SegaraRai/lingui-for/pull/11) [`79c895c`](https://github.com/SegaraRai/lingui-for/commit/79c895c28ca94cbf4a4fdeccc451d9dfc16fa5ba) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Improved source map accuracy.

- [#22](https://github.com/SegaraRai/lingui-for/pull/22) [`a76b579`](https://github.com/SegaraRai/lingui-for/commit/a76b579be0fddce9cbc68edb1387608ff738f831) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Allow using `svelteExtractor` and `astroExtractor` directly in Lingui `extractors` arrays without calling them, while preserving the existing factory form for custom options.

- [#15](https://github.com/SegaraRai/lingui-for/pull/15) [`909d4de`](https://github.com/SegaraRai/lingui-for/commit/909d4de976dc41da2857e9b6645d7715f914e5ce) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Improve `<Trans>` rich-text lowering to use framework-native output and expand supported wrapper syntax in Svelte and Astro.

- Updated dependencies [[`a76b579`](https://github.com/SegaraRai/lingui-for/commit/a76b579be0fddce9cbc68edb1387608ff738f831)]:
  - @lingui-for/framework-core@0.4.0

## 0.2.2

### Patch Changes

- [`950bcdb`](https://github.com/SegaraRai/lingui-for/commit/950bcdba323598bdb191776fb5445b20f29cad5c) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Fixed an issue where transformed `msg` descriptors could produce invalid code when used in `return` or `throw` statements because automatic semicolon insertion could treat the descriptor object as starting on the next statement.

  This change normalizes whitespace after the `/*i18n*/` marker so any newline between `/*i18n*/` and `{` is rewritten to a single space, keeping descriptor expressions in the safe `/*i18n*/ { ... }` form.

## 0.2.1

### Patch Changes

- [`2db96be`](https://github.com/SegaraRai/lingui-for/commit/2db96bec881789ac311f7ed1ebaadce016767a72) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Downgraded dependency versions to make package resolution easier.

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
