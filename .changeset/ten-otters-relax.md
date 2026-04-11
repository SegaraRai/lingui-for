---
"lingui-for-svelte": minor
"lingui-for-astro": minor
"unplugin-lingui-macro": minor
---

Unify transform-time Lingui config loading around a new `config` option and
`defineConfig` helpers.

`lingui-for-svelte` and `lingui-for-astro` now load Lingui config files during
transforms using Lingui-compatible config discovery and `jiti`. The old
`linguiConfig` transform option has been replaced by `config`, which accepts a
config file path, `URL`, or direct config object. Framework-specific settings
should now live under `framework.svelte` or `framework.astro`, and the packages
now export `/config` helpers for authoring typed config objects.

`unplugin-lingui-macro` now uses the same `config` option name instead of
`linguiConfig`.
