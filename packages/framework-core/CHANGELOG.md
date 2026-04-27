# @lingui-for/framework-core

## 0.5.1

### Patch Changes

- [#36](https://github.com/SegaraRai/lingui-for/pull/36) [`c97a39a`](https://github.com/SegaraRai/lingui-for/commit/c97a39aff9d7e236e515e719c73cb4802843ed86) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Fix Astro interpolation markup in translated content.

  Messages are now preserved when they appear inside Astro interpolation markup, including fragment-wrapped markup such as ``{<><span>{t`First`}</span><span>{t`Second`}</span></>}``. HTML comments inside Astro interpolation markup no longer cause neighboring messages to be skipped during extraction or leave invalid comment expressions in transformed output.

  `Trans` in Astro now also preserves interpolation expressions that contain elements, fragments, or HTML comments. These expressions are carried as rich-text placeholders and restored as Astro markup at runtime.

  This is intentionally a minimal adapter behavior: the outer `Trans` does not recursively extract text or nested `Trans` components inside those preserved expressions. If a conditional branch inside an outer `Trans` contains user-facing text that should be translated, use `t` inside that branch.

## 0.5.0

### Minor Changes

- [#30](https://github.com/SegaraRai/lingui-for/pull/30) [`405b612`](https://github.com/SegaraRai/lingui-for/commit/405b6122b6821d3d2e9c9ecefc201fdf2fd538b9) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Custom `framework.svelte.packages` and `framework.astro.packages` values now replace the default framework macro package instead of adding to it.

## 0.4.1

### Patch Changes

- [#26](https://github.com/SegaraRai/lingui-for/pull/26) [`b7a6385`](https://github.com/SegaraRai/lingui-for/commit/b7a63851068664371855c444e0c2ec9cd49f5a57) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Broaden dependency version ranges for Babel, Lingui macro, and oxc-parser packages.

## 0.4.0

### Minor Changes

- [#22](https://github.com/SegaraRai/lingui-for/pull/22) [`a76b579`](https://github.com/SegaraRai/lingui-for/commit/a76b579be0fddce9cbc68edb1387608ff738f831) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Restrict rich-text whitespace modes to the owning framework.

  `lingui-for-astro` now accepts only `"astro"` and `"jsx"` for `framework.astro.whitespace`, while `lingui-for-svelte` now accepts only `"svelte"` and `"jsx"` for `framework.svelte.whitespace`. The previous public `"auto"` mode is removed.
