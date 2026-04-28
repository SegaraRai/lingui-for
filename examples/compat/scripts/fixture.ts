import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { run } from "./command.ts";
import { repoRoot } from "./paths.ts";
import {
  LOCAL_PACKAGES,
  PACKAGE,
  PACKAGE_PATH,
  VERSIONS,
  type CompatCase,
  type CompatProject,
  type LocalTarballs,
} from "./types.ts";

const IGNORED_FIXTURE_BASENAMES = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".svelte-kit",
  ".sveltekit-build",
  ".vite",
  "build",
]);

export function prepareLocalTarballs(tarballDir: string): LocalTarballs {
  const tarballs = {} as LocalTarballs;
  for (const name of LOCAL_PACKAGES) {
    const packageRoot = path.join(repoRoot, PACKAGE_PATH[name]);
    tarballs[name] = packLocalPackage(packageRoot, tarballDir);
  }

  return tarballs;
}

export function validatePackagePatches(compatCase: CompatCase): void {
  const projectPackagePaths = new Set(
    compatCase.projects.map((project) =>
      path.normalize(path.join(project.cwd, "package.json")),
    ),
  );

  for (const patch of compatCase.patches) {
    const patchPath = path.normalize(patch.path);
    if (projectPackagePaths.has(patchPath)) {
      continue;
    }

    throw new Error(
      `${compatCase.name} contains unsupported workspace package patch "${patch.path}". Compat patches currently apply only to project package.json files; package patches would need to be applied before local tarballs are packed.`,
    );
  }
}

export function copyFixture(projectCwd: string, destination: string): void {
  cpSync(path.join(repoRoot, projectCwd), destination, {
    dereference: false,
    filter: (source) => shouldCopyFixtureFile(source),
    force: true,
    recursive: true,
  });
}

export function prepareFixturePackageJson(
  projectRoot: string,
  compatCase: CompatCase,
  project: CompatProject,
  tarballs: LocalTarballs,
): void {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.packageManager = VERSIONS.packageManager;
  packageJson.dependencies ??= {};
  packageJson.devDependencies ??= {};

  applyProjectPackagePatches(packageJson, compatCase.patches, project.cwd);
  replaceCatalogDependencies(packageJson);
  injectLocalPackages(packageJson, project, tarballs);
  injectVersionMatrixDependencies(packageJson, compatCase, project);
  injectPackageOverrides(packageJson, compatCase, tarballs);

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

export function patchFixtureConfig(projectRoot: string): void {
  const viteConfigPath = path.join(projectRoot, "vite.config.ts");
  if (!existsSync(viteConfigPath)) {
    return;
  }
  const viteConfig = readFileSync(viteConfigPath, "utf8");
  writeFileSync(
    viteConfigPath,
    viteConfig.replaceAll(PACKAGE.vitePlus, PACKAGE.vite),
  );
}

function packLocalPackage(packageRoot: string, tarballDir: string): string {
  const before = new Set(readdirSync(tarballDir));
  run("vp", ["pm", "pack", `--pack-destination=${tarballDir}`], packageRoot);
  const created = readdirSync(tarballDir).filter(
    (entry) => entry.endsWith(".tgz") && !before.has(entry),
  );
  if (created.length !== 1) {
    throw new Error(
      `Expected vp pm pack to create one tarball for ${packageRoot}, got ${created.length}.`,
    );
  }
  return `file:../tarballs/${created[0]}`;
}

function shouldCopyFixtureFile(source: string): boolean {
  const basename = path.basename(source);
  return !IGNORED_FIXTURE_BASENAMES.has(basename);
}

function applyProjectPackagePatches(
  packageJson: Record<string, any>,
  patches: CompatCase["patches"],
  projectCwd: string,
): void {
  const projectPackagePath = path.join(projectCwd, "package.json");
  for (const patch of patches) {
    if (path.normalize(patch.path) !== path.normalize(projectPackagePath)) {
      continue;
    }

    for (const [section, dependencies] of Object.entries(patch.sections)) {
      packageJson[section] ??= {};
      Object.assign(packageJson[section], dependencies);
    }
  }
}

function replaceCatalogDependencies(packageJson: Record<string, any>): void {
  for (const section of ["dependencies", "devDependencies"] as const) {
    const dependencies = packageJson[section] as Record<string, string>;
    for (const [name, version] of Object.entries(dependencies)) {
      if (version !== "catalog:") {
        continue;
      }
      if (name in VERSIONS.catalog) {
        dependencies[name] =
          VERSIONS.catalog[name as keyof typeof VERSIONS.catalog];
      } else if (name === PACKAGE.vitePlus) {
        delete dependencies[name];
      } else {
        throw new Error(
          `Unsupported catalog dependency in compat fixture: ${name}`,
        );
      }
    }
  }
}

function injectLocalPackages(
  packageJson: Record<string, any>,
  project: CompatProject,
  tarballs: LocalTarballs,
): void {
  for (const [section, packages] of Object.entries(
    project.localPackages ?? {},
  )) {
    packageJson[section] ??= {};
    for (const name of packages) {
      packageJson[section][name] = tarballs[name];
    }
  }
}

function injectVersionMatrixDependencies(
  packageJson: Record<string, any>,
  compatCase: CompatCase,
  project: CompatProject,
): void {
  const versions = VERSIONS.lingui[compatCase.lingui];
  Object.assign(packageJson.dependencies, pick(versions, [PACKAGE.linguiCore]));
  Object.assign(
    packageJson.devDependencies,
    pick(versions, [PACKAGE.linguiCli, PACKAGE.linguiConf]),
  );

  delete packageJson.devDependencies[PACKAGE.vitePlus];
  Object.assign(packageJson.dependencies, project.dependencies ?? {});
  Object.assign(packageJson.devDependencies, project.devDependencies ?? {});
}

function injectPackageOverrides(
  packageJson: Record<string, any>,
  compatCase: CompatCase,
  tarballs: LocalTarballs,
): void {
  const versions = VERSIONS.lingui[compatCase.lingui];
  packageJson.pnpm ??= {};
  packageJson.pnpm.overrides ??= {};
  Object.assign(packageJson.pnpm.overrides, {
    [PACKAGE.frameworkCore]: tarballs[PACKAGE.frameworkCore],
    [PACKAGE.markupImport]: tarballs[PACKAGE.markupImport],
    ...versions,
  });
}

function pick<T extends Record<string, string>, K extends keyof T>(
  source: T,
  keys: K[],
): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<
    T,
    K
  >;
}
