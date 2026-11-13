// Prints the npm dist-tag of each public package, so the Release workflow stages a prerelease
// under `next` and any other version under `latest`.
//
//   node tools/release/npm-tags.ts
//
// Each line holds the dist-tag and the package name, separated by a tab.

import { npmTag, readReleasePackages } from "./release-draft.ts";

for (const { name, version } of readReleasePackages()) {
  console.log(`${npmTag(version)}\t${name}`);
}
