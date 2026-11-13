# Contributing

## Requirements

- [Vite+](https://viteplus.dev/)
  - [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) will be installed automatically by Vite+. If not, you can install them manually: Node.js 24+ and pnpm 10+.
- [Rust](https://www.rust-lang.org/) for building `lingui-analyzer` (`lingui-analyzer-wasm`)

## Getting Started

```sh
vp install
vp run build
vp run test
```

Useful commands from the workspace root:

- `cargo test`: Run Rust tests.
- `cargo fmt && vp run format`: Format code.
- `vp run build`: Build libraries, examples, and docs.
- `vp run build:wasm`: Build the `lingui-analyzer` Wasm package into `shared/lingui-analyzer-wasm/dist`.
- `vp run build:lib`: Build the public libraries.
- `vp run build:examples`: Build the verification examples.
- `vp run build:docs`: Build the docs app.
- `vp run check`: Run formatting checks, type checks, and markup checks across the workspace.
- `vp run test`: Build first, then run the Vitest suite.
- `vp run dev:docs`: Start the docs app.
- `vp run dev:e2e-astro`: Start the Astro verification app.
- `vp run dev:e2e-svelte`: Start the Svelte verification app.

## Workspace Apps

- [`apps/docs`](./apps/docs): Documentation site.
- [`examples/compat`](./examples/compat): Isolated compatibility matrix for Lingui, framework, and Vite version combinations.
- [`examples/config-types`](./examples/config-types): Type-level checks for framework config combinations.
- [`examples/conformance`](./examples/conformance): Conformance tests with examples of various patterns and their expected output.
- [`examples/e2e-astro`](./examples/e2e-astro): End-to-end Astro verification app.
- [`examples/e2e-svelte`](./examples/e2e-svelte): End-to-end Svelte verification app.

## Internal Packages and Crates

- [`crates/lingui-analyzer`](./crates/lingui-analyzer): Rust crate for Svelte/Astro analysis and lowering, compiled to Wasm for use in the integrations.
- [`packages/framework-core`](./packages/framework-core): Shared compile, config, Wasm-loading, Babel, and runtime helpers used by `lingui-for-svelte` and `lingui-for-astro`.
- [`packages/unplugin-markup-import`](./packages/unplugin-markup-import): Shared markup import tooling used by the integrations.
- [`shared/common`](./shared/common): Private TypeScript helpers shared by workspace packages.
- [`shared/lingui-analyzer-wasm`](./shared/lingui-analyzer-wasm): Internal Wasm package used by extraction and compilation code.
- [`shared/test-helpers`](./shared/test-helpers): Private test utilities shared by package and conformance tests.
- [`tools/release`](./tools/release): Private scripts that the Release workflow runs.
- [`tools/sites`](./tools/sites): Private scripts that prepare and deploy the docs to Cloudflare Workers.

## Framework Integration Notes

- Svelte integration work should use Svelte 5 runes and the reactive macro model documented in [`packages/lingui-for-svelte/REACTIVITY.md`](./packages/lingui-for-svelte/REACTIVITY.md).
- Framework-specific compile behavior belongs in `packages/lingui-for-svelte` or `packages/lingui-for-astro`.
- Shared compile, config, Wasm-loading, Babel, and runtime helpers belong in `packages/framework-core` only when both framework integrations use the behavior.

## Repository Layout

```text
.
|- apps/
|  |- docs/
|- examples/
|  |- config-types/
|  |- conformance/
|  |- e2e-astro/
|  |- e2e-svelte/
|- crates/
|  |- lingui-analyzer/
|- packages/
|  |- framework-core/
|  |- lingui-for-astro/
|  |- lingui-for-svelte/
|  |- unplugin-lingui-macro/
|  |- unplugin-markup-import/
|- shared/
|  |- common/
|  |- lingui-analyzer-wasm/
|  |- test-helpers/
|- tools/
|  |- release/
|  |- sites/
```

## Releases

Each public package under `packages/` releases at its own version.
`@lingui-for/framework-core`, `lingui-for-astro`, and `lingui-for-svelte` release at one shared
version. `versioning.fixed` in [pnpm-workspace.yaml](./pnpm-workspace.yaml) lists them, and
`versioning.ignore` lists every private package. These lists accept exact names only, so add a
new package to `versioning.ignore` when it is private.
[tools/release/versioning.test.ts](./tools/release/versioning.test.ts) checks the lists.

Record each new feature and each other user-visible package change with `vp exec pnpm change`,
and commit the intent file in `.changeset/` with the change. `vp exec pnpm change status` shows
the release plan.

When `.changeset/` changes on `main`, the [Version PR](./.github/workflows/version-pr.yml)
workflow runs `pnpm version -r`, which consumes the intents, updates the `CHANGELOG.md` of each
released package, and appends to `.changeset/ledger.yaml`. The workflow keeps the result in a
pull request from `version/main` with the `release` label. `github-actions[bot]` creates this
pull request, so its workflow runs might wait for a maintainer to approve them in the Actions
tab. The CI workflow tests the pull request, and the [Release](./.github/workflows/release.yml)
workflow builds the npm packages and packs them with `pnpm publish -r --dry-run`. Wait for both
runs to pass, then merge the pull request with **Squash and merge**.

The merge changes `.changeset/ledger.yaml` on `main`, which starts the Release workflow. The
CI workflow skips this push, and the Release workflow runs the CI jobs itself. After the tests
pass, the Release workflow uploads the npm packages to npm's staging area from the
`npm-release` environment. A version with a prerelease suffix receives the npm tag `next`; any
other version receives `latest`.

To check a release without uploading packages, start **Actions → Release → Run workflow** on
`main` with the default dry run. Clear **dry-run** to run the uploads again after a failed
release.

Staged versions are not installable until a maintainer approves them with 2FA. Review them with
`vp exec pnpm stage list`, then run `vp exec pnpm stage approve` and select every package. Use
`vp exec pnpm stage reject <stage-id>` to remove a staged version.

After the staging succeeds, the Release workflow creates a draft GitHub Release named
`<package>@<version>` for each package version that it staged. Its body lists links to the
changelog sections since the previous published GitHub Release of the package.
[tools/release/release-draft.ts](./tools/release/release-draft.ts) writes this body. The body
starts with a short request for a coding agent, and an HTML comment holds the detailed
instructions from
[tools/release/release-notes-prompt.md](./tools/release/release-notes-prompt.md). Give the
request to an agent in your checkout of this repository. The agent reads every draft of the run
with `gh`, follows the instructions, and replaces each body with the notes. It also checks that
npm serves the new versions under the expected dist-tag with provenance. When npm serves every
version, the agent proposes to publish the drafts and publishes them only after you tell it to.
Review the notes before you approve. GitHub creates each tag when its draft is published. A
rerun of the workflow keeps an existing draft and skips a published release.

### npm setup

1. Create the `npm-release` GitHub environment with a deployment branch rule for `main` only.
   Add yourself as a required reviewer if every staging should wait for an approval.
2. Add this repository's `release.yml` and the `npm-release` environment as the trusted
   publisher of each package on npmjs.com, and allow staged publishing for it.
3. For a package that does not exist on npm yet, add a short-lived granular token as the
   `NPM_TOKEN` environment secret. Delete it after the first publication, and add the trusted
   publisher of the new package.

npm adds provenance only to trusted publications from a public repository.

## Docs deployments

The docs app deploys to the Cloudflare Worker `lingui-for-docs`.
[Sites](./.github/workflows/sites.yml) builds and checks the docs on pull requests and pushes to
`main` and `stable`.

| Source              | Environment        | URL                                                |
| ------------------- | ------------------ | -------------------------------------------------- |
| Push to `stable`    | `sites-production` | `https://lingui-for.roundtrip.dev/`                |
| Push to `main`      | `sites-preview`    | `https://main.lingui-for-preview.roundtrip.dev/`   |
| Pull request `#<n>` | `sites-pr-preview` | `https://pr-<n>.lingui-for-preview.roundtrip.dev/` |

`stable` holds the code and documentation of the published packages. Apply documentation
fixes for the published versions to `stable`, and bring them into `main`. After a package release
succeeds and npm serves the approved versions, advance `stable` to the release commit with
`git push origin <release-commit>:refs/heads/stable`. The release notes agent reminds you when
`stable` does not contain the release commit. A push with `GITHUB_TOKEN` starts no workflow, so
start **Actions → Sites → Run workflow** on `stable` if automation advances it.

`PUBLIC_SITE_URL` selects the origin of the canonical URLs and sitemaps in the build. Sites sets
it to the URL in the table above. `SITE_DEPLOYMENT` selects `preview` or `production`.
[tools/sites](./tools/sites) checks the URLs in the build, copies the static assets without
source maps and build metadata, and writes Cloudflare Build Output under
`.deploy/docs/.cloudflare/output/v0/` from
[apps/docs/cloudflare.config.ts](./apps/docs/cloudflare.config.ts). Preview builds send
`X-Robots-Tag: noindex` and block crawlers in `robots.txt`. The deploy job downloads the checked
Build Output and runs `cf` with `--prebuilt`, so it does not build application code. Only that
step receives the Cloudflare token. After the deployment, it checks the routes, the indexing
policy, the canonical URL, and the trailing slash redirects. To roll back, select the previous
version in the Deployments dashboard of the Worker.

For local checks, run `vp run @lingui-for/internal-tools-sites#check:urls`, and run
`vp run @lingui-for/internal-tools-sites#check:production` with `SITE_DEPLOYMENT=production`
for a `cf deploy --dry-run` without credentials.

### Pull request Previews

Pull requests do not publish Previews by default. Two controls request one:

| Control                  | Who can use it            | Pull requests            | Effect                          |
| ------------------------ | ------------------------- | ------------------------ | ------------------------------- |
| `preview` label          | People with triage access | This repository          | Publishes each new commit       |
| `/preview` comment       | People with write access  | This repository          | Publishes the current head once |
| `/preview <sha>` comment | People with write access  | This repository or forks | Publishes that head commit once |

The `<sha>` value must be the full SHA of the current head commit, because a fork can add
commits after a review. A fork's Sites run needs approval, and it must finish before
`/preview <sha>`. [Site Preview](./.github/workflows/site-preview.yml) publishes the build of
the Sites run without rebuilding it, so a Preview requires a build from the last 7 days.

Site Preview runs from the default branch and holds the Cloudflare token, so it never executes
pull request code. It reads labels, head commits, and permissions from the GitHub API, takes
only the static assets from the artifact, and writes the Worker configuration from the default
branch. [Site Preview Request](./.github/workflows/site-preview-request.yml) only starts Site
Preview after labeling, because public repositories disable `pull_request_target` by default.
The workflow reports the URL in one comment on the pull request and adds the `preview:active`
label. A daily run deletes the Previews of closed pull requests that have this label.

### Cloudflare setup

1. Use the `roundtrip.dev` zone in the target Cloudflare account. Leave Workers Builds
   disconnected from this repository.
2. Create a token scoped to that account with Workers **Admin** for the first deployment and
   **Workers Routes Write** for the `roundtrip.dev` zone. After provisioning, Workers **Editor** is
   enough for deployments. Create a second token with Workers **Admin** scoped to
   `lingui-for-docs` for Preview cleanup.
3. The first deployment from `main` initializes the Worker without production routes and
   attaches `lingui-for-preview.roundtrip.dev` for Preview traffic. Cloudflare provisions the
   wildcard DNS records and certificates. The first deployment from `stable` attaches
   `lingui-for.roundtrip.dev`. Remove the old GitHub Pages DNS record for that hostname first.

### GitHub setup

1. Under **Settings → Environments**, create `sites-preview`, `sites-pr-preview`,
   `sites-pr-preview-cleanup`, and `sites-production`. Restrict the deployment branches to `main`
   for the first three and to `stable` for `sites-production`.
2. Add `CLOUDFLARE_API_TOKEN` as an environment secret in each environment.
   `sites-pr-preview-cleanup` uses the cleanup token, and `sites-pr-preview` uses a Workers
   **Editor** token, because its job handles pull request artifacts. Add `CLOUDFLARE_ACCOUNT_ID`
   as a repository variable.
3. Create the `preview` and `preview:active` labels.
4. Create `stable` from the last release commit, protect it from force pushes and deletion,
   and require the `Build and verify` check on pull requests to `main` and `stable`.
5. Under **Settings → Pages**, disable GitHub Pages, and delete the `github-pages` environment.

## GitHub Actions

Workflows reference each action by an exact version, and
[.github/workflows/actions.lock](./.github/workflows/actions.lock) pins every action to a commit
SHA. After you add or update an action, run `gh actions-lock` with the
[gh-actions-lock](https://github.com/github/gh-actions-lock) extension, and commit the
lockfile. Run `gh actions-lock --no-fix` to check the lockfile without changing it.

[CODEOWNERS](./.github/CODEOWNERS) requests a maintainer review for workflows, release scripts,
dependency manifests, and generated release files. The
[Protected paths](./.github/workflows/protected-paths.yml) workflow rejects changes to
`.github/`, the ledger, changelogs, and `tools/release/` from forks.

## Notes

- Public package usage and API details should live in each package README.
- The example apps exist to catch regressions in extraction, compilation, and runtime behavior.
- The docs app is the primary place for user-facing guides and framework documentation.
