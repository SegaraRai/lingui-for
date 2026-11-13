import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "vite-plus/test";

import {
  changelogAnchor,
  changelogVersions,
  compareVersions,
  npmTag,
  previousReleaseVersion,
  readReleasePackages,
  releaseVersions,
  renderDraft,
} from "./release-draft.ts";

const prompt = readFileSync(
  path.join(import.meta.dirname, "release-notes-prompt.md"),
  "utf8",
);

test("versions sort by semantic version precedence", () => {
  const versions = [
    "1.0.0",
    "0.10.0",
    "1.0.0-rc.1",
    "0.2.0",
    "1.0.0-alpha",
    "1.0.0-rc.0",
    "1.0.0-alpha.1",
  ];

  expect(versions.sort(compareVersions)).toEqual([
    "0.2.0",
    "0.10.0",
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-rc.0",
    "1.0.0-rc.1",
    "1.0.0",
  ]);
});

test("the previous release is the highest tag of the same package below the version", () => {
  const tags = [
    "lingui-for-svelte@0.6.1",
    "lingui-for-svelte@0.7.0",
    "lingui-for-svelte@0.8.0",
    "lingui-for-svelte@0.7.1-rc.0",
    "lingui-for-svelte-extra@0.7.1",
    "@lingui-for/framework-core@0.7.1",
    "v0.7.1",
  ];

  expect(previousReleaseVersion(tags, "lingui-for-svelte", "0.7.1")).toBe(
    "0.7.0",
  );
  expect(
    previousReleaseVersion(tags, "@lingui-for/framework-core", "0.7.2"),
  ).toBe("0.7.1");
  expect(
    previousReleaseVersion(tags, "lingui-for-svelte", "0.6.1"),
  ).toBeUndefined();
  expect(previousReleaseVersion(tags, "lingui-for-svelte", "0.7.1-rc.1")).toBe(
    "0.7.1-rc.0",
  );
});

test("changelog headings provide the released versions", () => {
  const changelog = [
    "# lingui-for-svelte",
    "",
    "## 0.7.2",
    "",
    "### Patch Changes",
    "",
    "## 0.7.1",
    "",
    "## 0.7.0-rc.1",
    "",
    "### 0.6.0",
    "",
  ].join("\n");

  expect(changelogVersions(changelog)).toEqual([
    "0.7.2",
    "0.7.1",
    "0.7.0-rc.1",
  ]);
});

test("a release covers the changelog versions after the previous release", () => {
  const versions = ["0.7.3", "0.7.2", "0.7.1", "0.7.0"];

  expect(releaseVersions(versions, "0.7.2", "0.7.0")).toEqual([
    "0.7.2",
    "0.7.1",
  ]);
  expect(releaseVersions(versions, "0.7.1", undefined)).toEqual([
    "0.7.1",
    "0.7.0",
  ]);
});

test("changelog anchors match GitHub heading fragments", () => {
  expect(changelogAnchor("0.7.2")).toBe("072");
  expect(changelogAnchor("1.0.0-RC.1")).toBe("100-rc1");
});

test("prereleases use the next dist-tag", () => {
  expect(npmTag("0.7.2")).toBe("latest");
  expect(npmTag("1.0.0-rc.1")).toBe("next");
});

test("the draft holds the request, the instructions, and the changelog links", () => {
  const body = renderDraft({
    repository: "owner/repo",
    commit: "0123456789abcdef0123456789abcdef01234567",
    package: {
      name: "lingui-for-astro",
      version: "0.8.0",
      dir: "packages/lingui-for-astro",
      changelogVersions: ["0.8.0", "0.7.3", "0.7.2"],
    },
    previous: "0.7.2",
    batch: ["@lingui-for/framework-core@0.8.0", "lingui-for-astro@0.8.0"],
    prompt,
  });

  expect(body).toContain(
    "The Release workflow created draft GitHub Releases for `@lingui-for/framework-core@0.8.0`, `lingui-for-astro@0.8.0`.",
  );
  expect(body).toContain(
    "gh release edit <tag> --repo owner/repo --draft=false",
  );
  expect(body).toContain(
    "Instructions for a coding agent: write the GitHub Release notes for lingui-for-astro@0.8.0",
  );
  expect(body).toContain("Users upgrade from lingui-for-astro@0.7.2.");
  expect(body).toContain("under the dist-tag `latest`");
  expect(body).toMatch(
    /## Changelogs\n\n- \[`lingui-for-astro` 0\.8\.0\]\(https:\/\/github\.com\/owner\/repo\/blob\/0123456789abcdef0123456789abcdef01234567\/packages\/lingui-for-astro\/CHANGELOG\.md#080\)\n- \[`lingui-for-astro` 0\.7\.3\]\(.*#073\)\n$/,
  );
  expect(body).not.toMatch(/\{\{\w+\}\}/);
});

test("the instructions cannot contain a comment terminator", () => {
  expect(() =>
    renderDraft({
      repository: "owner/repo",
      commit: "0123456789abcdef0123456789abcdef01234567",
      package: {
        name: "lingui-for-astro",
        version: "0.8.0",
        dir: "packages/lingui-for-astro",
        changelogVersions: [],
      },
      previous: undefined,
      batch: ["lingui-for-astro@0.8.0"],
      prompt: "Run `gh release view --json body`.",
    }),
  ).toThrow("must not contain `--`");
});

test("the workspace provides a release package for each public package", () => {
  const packages = readReleasePackages();

  expect(packages.map(({ name }) => name).sort()).toEqual([
    "@lingui-for/framework-core",
    "lingui-for-astro",
    "lingui-for-svelte",
    "unplugin-lingui-macro",
    "unplugin-markup-import",
  ]);
  for (const releasePackage of packages) {
    expect(releasePackage.changelogVersions).toContain(releasePackage.version);
  }
});
