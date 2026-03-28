# unplugin-markup-import

## 0.2.0

### Minor Changes

- [`838bbd5`](https://github.com/SegaraRai/lingui-for/commit/838bbd5dfe812cb8a371a73db4e8edd4fb4e1bcd) Thanks [@SegaraRai](https://github.com/SegaraRai)! - **BREAKING CHANGE** Drop support for bun, esbuild, rspack and webpack.

- [`5c4bcae`](https://github.com/SegaraRai/lingui-for/commit/5c4bcaea3eef2b579cde9137b0d37f221898cc91) Thanks [@SegaraRai](https://github.com/SegaraRai)! - **BREAKING CHANGE** Route all non-self markup imports through generated facade modules by default, add an `externalize` option to opt specific imports out, and skip applying the plugin during dev server runs.

### Patch Changes

- [`838bbd5`](https://github.com/SegaraRai/lingui-for/commit/838bbd5dfe812cb8a371a73db4e8edd4fb4e1bcd) Thanks [@SegaraRai](https://github.com/SegaraRai)! - Added `include` and `exclude` options.

  To fix type definition file generation, the plugin now generates temporary files during the build.
  This requires knowing the target markup files ahead of time, which makes the previous automatic
  detection based on the module graph no longer feasible. Users must now explicitly specify the
  location of their markup files using these new options.

## 0.1.1

### Patch Changes

- 86454f6: Migrate to Trusted Publishing.

## 0.1.0

### Minor Changes

- 997bc6f: Initial Release.
