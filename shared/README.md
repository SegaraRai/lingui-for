# shared

Private shared packages for internal helpers used by the public packages.

These packages are not meant to be consumed directly by users and are only for internal use within the monorepo.

## Packages

- [`common`](./common): Private TypeScript utilities shared by workspace packages.
- [`lingui-analyzer-wasm`](./lingui-analyzer-wasm): Generated Wasm package for the Rust analyzer output.
- [`test-helpers`](./test-helpers): Shared test utilities.

## Dependency Rule

Shared packages must not introduce runtime dependencies that would be hidden from the published `lingui-for-*` packages. Keep dependencies in `devDependencies` or `peerDependencies` unless the package is intentionally promoted to a published runtime dependency.
