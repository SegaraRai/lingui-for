import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { compatRoot } from "./paths.ts";
import {
  PACKAGE,
  type CompatCase,
  type CompatCaseConfig,
  type PackageVersionAssertion,
} from "./types.ts";

export function loadCases(): CompatCase[] {
  const casesDir = path.join(compatRoot, "cases");
  return readdirSync(casesDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => {
      const config = JSON.parse(
        readFileSync(path.join(casesDir, entry), "utf8"),
      ) as CompatCaseConfig;
      return {
        name: config.name,
        description: config.description,
        lingui: config.lingui,
        assertions: {
          packages: [
            ...defaultPackageAssertions(config),
            ...(config.assertions?.packages ?? []),
            ...config.projects.flatMap((project) => project.assertions ?? []),
          ],
        },
        patches: config.patches ?? [],
        projects: config.projects,
      };
    });
}

function defaultPackageAssertions(
  config: CompatCaseConfig,
): PackageVersionAssertion[] {
  const packages: PackageVersionAssertion[] = [];

  for (const project of config.projects) {
    packages.push(
      {
        cwd: project.cwd,
        name: PACKAGE.linguiCore,
        major: config.lingui,
      },
      {
        cwd: project.cwd,
        name: PACKAGE.linguiCli,
        major: config.lingui,
      },
      {
        cwd: project.cwd,
        name: PACKAGE.linguiConf,
        major: config.lingui,
      },
    );
  }

  return packages;
}
