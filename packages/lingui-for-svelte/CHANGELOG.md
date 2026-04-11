# lingui-for-svelte

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

- [#21](https://github.com/SegaraRai/lingui-for/pull/21) [`f0da859`](https://github.com/SegaraRai/lingui-for/commit/f0da8598bd7611770e29aaa47c3ba38fd1cac4be) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Allocate internal Babel wrapper markers uniquely during Svelte compilation to avoid collisions with user-defined identifiers.

- [#11](https://github.com/SegaraRai/lingui-for/pull/11) [`79c895c`](https://github.com/SegaraRai/lingui-for/commit/79c895c28ca94cbf4a4fdeccc451d9dfc16fa5ba) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Improved source map accuracy.

- [#13](https://github.com/SegaraRai/lingui-for/pull/13) [`024d9af`](https://github.com/SegaraRai/lingui-for/commit/024d9afc1efdeea188d6bcebd7e3f21f97d98858) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Fix synthetic source normalization for nested owned macros so Svelte builds correctly rewrite nested `$translate(...)` cases during extraction and compile planning.

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

- [`dc83eb2`](https://github.com/SegaraRai/lingui-for/commit/dc83eb2ea094d3e15fb245bd9fc68edbc3bf68c9) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Updated property type of `<RuntimeTrans>`.

- [`3619cfb`](https://github.com/SegaraRai/lingui-for/commit/3619cfb1006ff8ec308d5634b182a705b7361cf6) Thanks [@SegaraRai](https://github.com/SegaraRai)! - **BREAKING CHANGE** Disallow bare `t`, `plural`, `select`, and `selectOrdinal` string translations in `.svelte` files, requiring reactive `$t`-style usage or explicit `*.eager` calls for non-reactive snapshots.

- [`a81d0bf`](https://github.com/SegaraRai/lingui-for/commit/a81d0bf7d620e864154a506630c1020557c08ddb) Thanks [@SegaraRai](https://github.com/SegaraRai)! - **BREAKING CHANGE** Remove some exports from `lingui-for-svelte` and `lingui-for-svelte/runtime`.

- [#6](https://github.com/SegaraRai/lingui-for/pull/6) [`6f9f5e1`](https://github.com/SegaraRai/lingui-for/commit/6f9f5e1bb2470ebff0e5424e31e1ca6c1cd103c5) Thanks [@SegaraRai](https://github.com/SegaraRai)! - **BREAKING CHANGE** Changed rich-text whitespace handling to be framework-aware by default. `<Trans>` and related component macros now normalize inter-node whitespace with `auto` semantics unless you opt back into JSX behavior with the new `whitespace` option.

  Added a `whitespace` setting for Svelte and Astro transforms/extractors so callers can choose between framework-aware behavior and JSX-compatible behavior when generating messages.

  **BREAKING CHANGE** The extractor exports are now factories. Update `extractors: [svelteExtractor, ...]` and `extractors: [astroExtractor, ...]` to `extractors: [svelteExtractor(), ...]` and `extractors: [astroExtractor(), ...]`.

- [`cf0f06d`](https://github.com/SegaraRai/lingui-for/commit/cf0f06d5dd63a7d006e36f6c0d089ad4a59f338a) Thanks [@SegaraRai](https://github.com/SegaraRai)! - **BREAKING CHANGE** Throws an error if lingui context is not set.

### Patch Changes

- [`1b90b9c`](https://github.com/SegaraRai/lingui-for/commit/1b90b9c774fe5ec54a4b3830e82ce80f2e99d3e0) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Improved reactivity performance.

## 0.1.1

### Patch Changes

- 86454f6: Migrate to Trusted Publishing.

## 0.1.0

### Minor Changes

- 997bc6f: Initial Release.
