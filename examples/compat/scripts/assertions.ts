import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { CompatCase, PackageVersionAssertion } from "./types.ts";

export function assertResolvedPackageVersions(
  projectRoot: string,
  compatCase: CompatCase,
): void {
  for (const assertion of compatCase.assertions.packages) {
    const version =
      assertion.source === "moduleVersion"
        ? readResolvedModuleVersion(projectRoot, assertion, compatCase.name)
        : readResolvedPackageVersion(projectRoot, assertion, compatCase.name);
    const actualMajor = version.split(".")[0];

    if (actualMajor !== assertion.major) {
      throw new Error(
        `${compatCase.name}:${assertion.cwd} resolved ${assertion.name}@${version}, expected major ${assertion.major}.`,
      );
    }

    const issuer = assertion.issuerPackage
      ? `${assertion.issuerPackage} -> `
      : "";
    console.log(`✓ ${issuer}${assertion.name}@${version}`);
  }
}

function readResolvedPackageVersion(
  projectRoot: string,
  assertion: PackageVersionAssertion,
  caseName: string,
): string {
  const packageJsonPath = resolvePackageJson(projectRoot, assertion, caseName);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    version?: unknown;
  };

  if (typeof packageJson.version !== "string") {
    throw new TypeError(
      `${caseName}:${projectRoot} resolved ${assertion.name}, but its package.json did not contain a string version.`,
    );
  }

  return packageJson.version;
}

function resolvePackageJson(
  projectRoot: string,
  assertion: PackageVersionAssertion,
  caseName: string,
): string {
  const script = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const { createRequire } = require('node:module');",
    "let req = createRequire(path.join(process.argv[1], 'package.json'));",
    "if (process.argv[3]) {",
    "  req = createRequire(req.resolve(process.argv[3]));",
    "}",
    "let current = path.dirname(req.resolve(process.argv[2]));",
    "for (;;) {",
    "  const packageJson = path.join(current, 'package.json');",
    "  if (fs.existsSync(packageJson)) {",
    "    process.stdout.write(packageJson);",
    "    break;",
    "  }",
    "  const parent = path.dirname(current);",
    "  if (parent === current) throw new Error(`Could not find package.json for ${process.argv[2]}.`);",
    "  current = parent;",
    "}",
  ].join("");
  const result = spawnSync(
    process.execPath,
    ["-e", script, projectRoot, assertion.name, assertion.issuerPackage ?? ""],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${caseName}:${projectRoot} could not locate ${assertion.name}/package.json.\n${result.stderr}`,
    );
  }

  return result.stdout.trim();
}

function readResolvedModuleVersion(
  projectRoot: string,
  assertion: PackageVersionAssertion,
  caseName: string,
): string {
  const script = [
    "const path = require('node:path');",
    "const { createRequire } = require('node:module');",
    "let req = createRequire(path.join(process.argv[1], 'package.json'));",
    "if (process.argv[3]) {",
    "  req = createRequire(req.resolve(process.argv[3]));",
    "}",
    "Promise.resolve(req(process.argv[2])).then((mod) => {",
    "  const version = mod && mod.version;",
    "  if (typeof version !== 'string') {",
    "    throw new Error(`${process.argv[2]} did not expose a string version export.`);",
    "  }",
    "  process.stdout.write(version);",
    "}).catch((error) => {",
    "  console.error(error && error.stack ? error.stack : String(error));",
    "  process.exitCode = 1;",
    "});",
  ].join("");
  const result = spawnSync(
    process.execPath,
    ["-e", script, projectRoot, assertion.name, assertion.issuerPackage ?? ""],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${caseName}:${projectRoot} could not read ${assertion.name}.version.\n${result.stderr}`,
    );
  }

  return result.stdout.trim();
}
