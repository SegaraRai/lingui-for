# @lingui-for/framework-core

## 0.4.1

### Patch Changes

- [#26](https://github.com/SegaraRai/lingui-for/pull/26) [`b7a6385`](https://github.com/SegaraRai/lingui-for/commit/b7a63851068664371855c444e0c2ec9cd49f5a57) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Broaden dependency version ranges for Babel, Lingui macro, and oxc-parser packages.

## 0.4.0

### Minor Changes

- [#22](https://github.com/SegaraRai/lingui-for/pull/22) [`a76b579`](https://github.com/SegaraRai/lingui-for/commit/a76b579be0fddce9cbc68edb1387608ff738f831) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Restrict rich-text whitespace modes to the owning framework.

  `lingui-for-astro` now accepts only `"astro"` and `"jsx"` for `framework.astro.whitespace`, while `lingui-for-svelte` now accepts only `"svelte"` and `"jsx"` for `framework.svelte.whitespace`. The previous public `"auto"` mode is removed.
