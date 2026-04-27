# Compatibility Matrix

This directory contains small compatibility fixtures for dependency-version
testing. The runner copies the repository to a temporary worktree, applies the
selected case manifest from `cases/`, installs there, and runs the target
fixture commands. Local package manifests and lockfiles are not modified.

Fixtures:

- `astro-basic`: Astro integration, Astro macro extraction, and Astro build.
- `sveltekit-basic`: SvelteKit plugin, Svelte macro extraction, and SvelteKit
  build.
- `vite-basic`: plain Vite with `unplugin-lingui-macro`.

```sh
vp run test:compat -- --list
vp run test:compat -- --case lingui6-astro6
```

Use `--keep` to retain the temporary copy for debugging.
