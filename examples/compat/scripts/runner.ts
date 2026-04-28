import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertResolvedPackageVersions } from "./assertions.ts";
import { loadCases } from "./cases.ts";
import { run } from "./command.ts";
import {
  copyFixture,
  patchFixtureConfig,
  prepareFixturePackageJson,
  prepareLocalTarballs,
  validatePackagePatches,
} from "./fixture.ts";
import { OPTION, parseArgs } from "./options.ts";
import { repoRoot } from "./paths.ts";
import { verifyProjectSnapshots } from "./snapshots.ts";
import type { CompatCase, Options } from "./types.ts";

const DEFAULT_TMP_PREFIX = "lingui-for-compat-";

export function main(args: string[]): void {
  const cases = loadCases();
  const options = parseArgs(args);

  if (options.list) {
    for (const compatCase of cases) {
      console.log(`${compatCase.name}: ${compatCase.description}`);
    }
    return;
  }

  if (options.names.length === 0) {
    runAllCasesInIsolatedProcesses(options, cases);
    return;
  }

  const selectedCases = options.names.map((name) => {
    const compatCase = cases.find((item) => item.name === name);
    if (!compatCase) {
      throw new Error(
        `Unknown compatibility case "${name}". Run "vp run test:compat --list" for available cases.`,
      );
    }
    return compatCase;
  });

  for (const compatCase of selectedCases) {
    runCompatCase(compatCase, options);
  }
}

function runAllCasesInIsolatedProcesses(
  options: Options,
  cases: CompatCase[],
): void {
  for (const compatCase of cases) {
    const args = [process.argv[1], OPTION.case, compatCase.name];
    if (options.keep) {
      args.push(OPTION.keep);
    }
    if (options.skipInstall) {
      args.push(OPTION.skipInstall);
    }
    if (options.updateSnapshots) {
      args.push(OPTION.update);
    }
    if (options.tmpRoot) {
      args.push(OPTION.tmpRoot, options.tmpRoot);
    }
    run(process.execPath, args, repoRoot);
  }
}

function runCompatCase(compatCase: CompatCase, options: Options): void {
  const tmpRoot = options.tmpRoot ? path.resolve(options.tmpRoot) : tmpdir();
  const worktree = mkdtempSync(
    path.join(tmpRoot, `${DEFAULT_TMP_PREFIX}${compatCase.name}-`),
  );

  console.log(`\n==> ${compatCase.name}`);
  console.log(compatCase.description);
  console.log(`worktree: ${worktree}`);

  try {
    const tarballDir = path.join(worktree, "tarballs");
    mkdirSync(tarballDir);
    validatePackagePatches(compatCase);
    const tarballs = prepareLocalTarballs(tarballDir);

    for (const project of compatCase.projects) {
      const projectRoot = path.join(worktree, path.basename(project.cwd));
      copyFixture(project.cwd, projectRoot);
      prepareFixturePackageJson(projectRoot, compatCase, project, tarballs);
      patchFixtureConfig(projectRoot);

      if (!options.skipInstall) {
        run("vp", ["install", "--no-frozen-lockfile"], projectRoot);

        assertResolvedPackageVersions(projectRoot, compatCase);

        for (const command of project.commands) {
          run(command[0], command.slice(1), projectRoot);
        }

        verifyProjectSnapshots(
          projectRoot,
          compatCase,
          project,
          options.updateSnapshots,
        );
      }
    }
  } finally {
    if (options.keep) {
      console.log(`kept worktree: ${worktree}`);
    } else {
      rmSync(worktree, { force: true, recursive: true });
    }
  }
}
