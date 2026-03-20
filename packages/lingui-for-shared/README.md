# lingui-for-shared

Private shared package for internal helpers used by the `lingui-for-*` packages.

This package is not a public API surface. Consumers inside the monorepo should depend on it via
`workspace:*` and bundle imported helpers into their own distributed output.

This package MUST NOT have any dependencies except for `devDependencies` and `peerDependencies` that
are also dependencies of the `lingui-for-*` packages because it is not distributed as a separate package.
