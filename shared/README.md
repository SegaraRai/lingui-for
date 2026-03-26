# shared

Private shared packages for internal helpers used by the public packages.

These packages are not meant to be consumed directly by users and are only for internal use within the monorepo.

These packages MUST NOT have any dependencies except for `devDependencies` and `peerDependencies` that
are also dependencies of the `lingui-for-*` packages because it is not distributed as a separate package.
