# unplugin-lingui-macro

## 0.3.1

### Patch Changes

- [#26](https://github.com/SegaraRai/lingui-for/pull/26) [`b7a6385`](https://github.com/SegaraRai/lingui-for/commit/b7a63851068664371855c444e0c2ec9cd49f5a57) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Broaden dependency version ranges for Babel, Lingui macro, and oxc-parser packages.

## 0.3.0

### Minor Changes

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

## 0.2.1

### Patch Changes

- [`2db96be`](https://github.com/SegaraRai/lingui-for/commit/2db96bec881789ac311f7ed1ebaadce016767a72) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Downgraded dependency versions to make package resolution easier.

## 0.2.0

### Minor Changes

- [`038570e`](https://github.com/SegaraRai/lingui-for/commit/038570e4a67ff9f3969857f303598e5281f4b052) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Updated document.

## 0.1.1

### Patch Changes

- 86454f6: Migrate to Trusted Publishing.

## 0.1.0

### Minor Changes

- 997bc6f: Initial Release.
