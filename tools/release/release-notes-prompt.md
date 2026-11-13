Instructions for a coding agent: write the GitHub Release notes for {{tag}}, check that the
release is ready to publish, and report the result to the maintainer.

## Release state

The Release workflow ran on commit {{commit}} on `main`. It has completed these steps:

1. It built and tested every package.
2. It uploaded the npm packages to the npm staging area under the dist-tag `{{npmTag}}`. npm
   serves a staged version only after a maintainer approves it with 2FA, and the maintainer
   might not have approved it yet.
3. It created a draft GitHub Release for each package version that it staged: {{batch}}.

After the npm approval, the maintainer advances the `stable` branch to the release commit. This
push deploys the production docs at https://lingui-for.roundtrip.dev. The maintainer might do it
before or after the publication of the drafts.

The tag {{tag}} does not exist yet. GitHub creates it on commit {{commit}} when the maintainer
publishes the draft. A missing tag and a draft URL that starts with `untagged` are expected.

## Tasks

1. Write the release notes as described in "Release notes", and replace the body of the draft.
2. Check the release state as described in "Release checks".
3. Report to the maintainer as described in "Report". Do not publish the draft until the
   maintainer tells you to.

## Release notes

{{range}}

Changelog sections:

{{changelogs}}

The links point to commit {{commit}}. Read every linked section before you write.

Follow these rules:

- Write in English for people who use `{{name}}`. Follow the rules in `AGENTS.md` at the root
  of the repository.
- Use only facts from the changelog sections. Do not add internal refactoring, tests, or CI
  changes.
- Read the code at commit {{commit}}, and run examples or tests in the checkout when they help
  you confirm an entry. When the checkout does not contain the commit, fetch it from `origin`.
  Do not switch branches, and restore every file that you change for this check.
- When the code or a check disagrees with a changelog entry, do not correct the entry from your
  own conclusion. Describe the difference in your report to the maintainer.
- Merge entries that describe the same change in several versions.
- Leave out the "Updated dependencies" lists. When the release only follows a new version of a
  dependency in this repository, such as `@lingui-for/framework-core`, write one sentence that
  names that dependency and its version, and say which user-visible changes it brings.
- A minor version before 1.0 can break existing code. List an entry under "Breaking changes"
  when it tells users to change configuration or code. Keep its migration step.
- Omit a heading that has no entries.
- Keep the "Changelogs" section and its links unchanged at the end.
- The notes replace the whole body, including the request above this comment and the comment
  itself.

Use this structure:

```md
<One or two sentences that summarize the release for users.>

## Breaking changes

- <Change, followed by the migration step>

## Features

- <New capability>

## Fixes

- <Corrected behavior>

## Changelogs

<The existing list of links>
```

## Release checks

Check these conditions:

- npm serves version {{version}} of `{{name}}`. Use `vp exec pnpm view {{name}}@{{version}} version`.
- The npm dist-tag `{{npmTag}}` of `{{name}}` points to version {{version}}. Use
  `vp exec pnpm view {{name}} dist-tags`.
- npm reports a provenance attestation for version {{version}}. Use
  `vp exec pnpm view {{name}}@{{version}} dist.attestations`.
- The `stable` branch on `origin` points to commit {{commit}}, or to a later commit that
  contains it. Use `git fetch origin stable` and `git merge-base`.

## Report

Report these items to the maintainer, once for all drafts of the Release run:

- The differences between the code and the changelog entries, if any.
- The result of each release check, for each package.
- The next action:
  - When npm does not serve a package, name the missing packages and stop. Ask the maintainer
    to review the staged versions with `vp exec pnpm stage list` and approve them with
    `vp exec pnpm stage approve`.
  - Otherwise, propose that the maintainer let you publish the drafts. When `stable` does not
    contain the release commit, add a reminder to advance it with
    `git push origin {{commit}}:refs/heads/stable`. This step does not block the publication.

Do not report an expected state, such as the missing tag, as a problem.
