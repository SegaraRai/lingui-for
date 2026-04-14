---
"@lingui-for/framework-core": minor
"lingui-for-astro": minor
"lingui-for-svelte": minor
---

Align framework macro package configuration with Lingui's replacement semantics and centralize framework config types.

Custom `framework.svelte.packages` and `framework.astro.packages` values now replace the default framework macro package instead of adding to it. Framework runtime export constants are now owned by each framework package, while framework-core only exports shared Lingui constants.

The Rust analyzer's transform-only module and public WASM APIs now use transform terminology instead of compile terminology.
