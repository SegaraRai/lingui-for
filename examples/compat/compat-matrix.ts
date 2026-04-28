import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type PackageSection = "dependencies" | "devDependencies" | "peerDependencies";

type PackagePatch = {
  path: string;
  sections: Partial<Record<PackageSection, Record<string, string>>>;
};

type CompatCase = {
  name: string;
  description: string;
  lingui: LinguiMajor;
  assertions: CompatAssertions;
  patches: PackagePatch[];
  projects: CompatProject[];
};

type CompatProject = {
  cwd: string;
  commands: string[][];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  localPackages?: Partial<Record<PackageSection, LocalPackageName[]>>;
  assertions?: PackageVersionAssertion[];
};

type CompatCaseConfig = Omit<CompatCase, "assertions"> & {
  assertions?: Partial<CompatAssertions>;
};

type CompatAssertions = {
  packages: PackageVersionAssertion[];
};

type PackageVersionAssertion = {
  cwd: string;
  name: string;
  major: string;
  issuerPackage?: string;
  source?: "packageJson" | "moduleVersion";
};

type Options = {
  names: string[];
  list: boolean;
  keep: boolean;
  skipInstall: boolean;
  tmpRoot: string | undefined;
};

const PACKAGE = {
  frameworkCore: "@lingui-for/framework-core",
  linguiAstro: "lingui-for-astro",
  linguiSvelte: "lingui-for-svelte",
  markupImport: "unplugin-markup-import",
  macro: "unplugin-lingui-macro",
  linguiBabelMacro: "@lingui/babel-plugin-lingui-macro",
  linguiCli: "@lingui/cli",
  linguiConf: "@lingui/conf",
  linguiCore: "@lingui/core",
  vite: "vite",
  vitePlus: "vite-plus",
  typesNode: "@types/node",
  typescript: "typescript",
} as const;

const PACKAGE_PATH = {
  [PACKAGE.frameworkCore]: "packages/framework-core",
  [PACKAGE.markupImport]: "packages/unplugin-markup-import",
  [PACKAGE.macro]: "packages/unplugin-lingui-macro",
  [PACKAGE.linguiAstro]: "packages/lingui-for-astro",
  [PACKAGE.linguiSvelte]: "packages/lingui-for-svelte",
} as const;

const COMMAND = {
  vp: "vp",
  cmdWindows: "cmd.exe",
} as const;

const VERSION_MAJOR = {
  package: "0",
  lingui5: "5",
  lingui6: "6",
} as const;

const VERSIONS = {
  packageManager: "pnpm@10.33.0",
  lingui: {
    [VERSION_MAJOR.lingui5]: {
      [PACKAGE.linguiBabelMacro]: "^5.0.0",
      [PACKAGE.linguiCli]: "^5.9.5",
      [PACKAGE.linguiConf]: "^5.9.5",
      [PACKAGE.linguiCore]: "^5.9.5",
    },
    [VERSION_MAJOR.lingui6]: {
      [PACKAGE.linguiBabelMacro]: "^6.0.0",
      [PACKAGE.linguiCli]: "^6.0.0",
      [PACKAGE.linguiConf]: "^6.0.0",
      [PACKAGE.linguiCore]: "^6.0.0",
    },
  },
  catalog: {
    [PACKAGE.typesNode]: "^25.6.0",
    [PACKAGE.typescript]: "^5.9.3",
  },
} as const;

const LOCAL_PACKAGES = [
  PACKAGE.frameworkCore,
  PACKAGE.markupImport,
  PACKAGE.macro,
  PACKAGE.linguiAstro,
  PACKAGE.linguiSvelte,
] as const;

const IGNORED_FIXTURE_BASENAMES = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".svelte-kit",
  ".sveltekit-build",
  ".vite",
]);

const TAR_DIR = "tarballs";
const CASES_DIR = "cases";
const DEFAULT_TMP_PREFIX = "lingui-for-compat-";
const OPTION = {
  case: "--case",
  keep: "--keep",
  list: "--list",
  skipInstall: "--skip-install",
  tmpRoot: "--tmp-root",
  separator: "--",
} as const;

type LinguiMajor = keyof typeof VERSIONS.lingui;
type LocalPackageName = (typeof LOCAL_PACKAGES)[number];
type LocalTarballs = Record<LocalPackageName, string>;

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const cases = loadCases();
const options = parseArgs(process.argv.slice(2));

if (options.list) {
  for (const compatCase of cases) {
    console.log(`${compatCase.name}: ${compatCase.description}`);
  }
  process.exit(0);
}

if (options.names.length === 0) {
  runAllCasesInIsolatedProcesses(options);
  process.exit(0);
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

function runAllCasesInIsolatedProcesses(options: Options): void {
  for (const compatCase of cases) {
    const args = [process.argv[1], OPTION.case, compatCase.name];
    if (options.keep) {
      args.push(OPTION.keep);
    }
    if (options.skipInstall) {
      args.push(OPTION.skipInstall);
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
    const tarballDir = path.join(worktree, TAR_DIR);
    mkdirSync(tarballDir);
    const tarballs = prepareLocalTarballs(tarballDir);

    for (const project of compatCase.projects) {
      const projectRoot = path.join(worktree, path.basename(project.cwd));
      copyFixture(project.cwd, projectRoot);
      prepareFixturePackageJson(projectRoot, compatCase, project, tarballs);
      patchFixtureConfig(projectRoot);

      if (!options.skipInstall) {
        run(COMMAND.vp, ["install", "--no-frozen-lockfile"], projectRoot);
      }

      assertResolvedPackageVersions(projectRoot, compatCase);

      for (const command of project.commands) {
        run(command[0], command.slice(1), projectRoot);
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

function prepareLocalTarballs(tarballDir: string): LocalTarballs {
  const tarballs = {} as LocalTarballs;
  for (const name of LOCAL_PACKAGES) {
    const packageRoot = path.join(repoRoot, PACKAGE_PATH[name]);
    tarballs[name] = packLocalPackage(packageRoot, tarballDir);
  }

  return tarballs;
}

function packLocalPackage(packageRoot: string, tarballDir: string): string {
  const before = new Set(readdirSync(tarballDir));
  run(
    COMMAND.vp,
    ["pm", "pack", `--pack-destination=${tarballDir}`],
    packageRoot,
  );
  const created = readdirSync(tarballDir).filter(
    (entry) => entry.endsWith(".tgz") && !before.has(entry),
  );
  if (created.length !== 1) {
    throw new Error(
      `Expected vp pm pack to create one tarball for ${packageRoot}, got ${created.length}.`,
    );
  }
  return `file:../${TAR_DIR}/${created[0]}`;
}

function copyFixture(projectCwd: string, destination: string): void {
  cpSync(path.join(repoRoot, projectCwd), destination, {
    dereference: false,
    filter: (source) => shouldCopyFixtureFile(source),
    force: true,
    recursive: true,
  });
}

function shouldCopyFixtureFile(source: string): boolean {
  const basename = path.basename(source);
  return !IGNORED_FIXTURE_BASENAMES.has(basename);
}

function prepareFixturePackageJson(
  projectRoot: string,
  compatCase: CompatCase,
  project: CompatCase["projects"][number],
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

function applyProjectPackagePatches(
  packageJson: Record<string, any>,
  patches: PackagePatch[],
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
  project: CompatCase["projects"][number],
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

function patchFixtureConfig(projectRoot: string): void {
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

function loadCases(): CompatCase[] {
  const casesDir = path.resolve(import.meta.dirname, CASES_DIR);
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

function assertResolvedPackageVersions(
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
    "  req = createRequire(req.resolve(`${process.argv[3]}/package.json`));",
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
    "  req = createRequire(req.resolve(`${process.argv[3]}/package.json`));",
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

function run(command: string, args: string[], cwd: string): void {
  console.log(`$ ${command} ${args.join(" ")}`);
  const [executable, executableArgs] = commandRequiresWindowsShell(command)
    ? [COMMAND.cmdWindows, ["/d", "/s", "/c", quoteCommand([command, ...args])]]
    : [command, args];

  const result = spawnSync(executable, executableArgs, {
    cwd,
    env: {
      ...process.env,
      LINGUI_WASM_PREBUILT: process.env.LINGUI_WASM_PREBUILT ?? "1",
      PATH:
        command === COMMAND.vp
          ? withoutNodeModulesBins()
          : withNodeModulesBins(cwd),
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status}: ${command} ${args.join(" ")}`,
    );
  }
}

function withNodeModulesBins(cwd: string): string {
  const paths = [];
  let current = cwd;

  for (;;) {
    const bin = path.join(current, "node_modules", ".bin");
    if (existsSync(bin)) {
      paths.push(bin);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  const currentPath = process.env.PATH ?? "";
  return [...paths, ...pathEntriesWithoutNodeModulesBins(currentPath)]
    .filter(Boolean)
    .join(path.delimiter);
}

function withoutNodeModulesBins(): string {
  return pathEntriesWithoutNodeModulesBins(process.env.PATH ?? "")
    .filter(Boolean)
    .join(path.delimiter);
}

function pathEntriesWithoutNodeModulesBins(value: string): string[] {
  return value.split(path.delimiter).filter((entry) => {
    return !path.normalize(entry).endsWith(path.normalize("node_modules/.bin"));
  });
}

function commandRequiresWindowsShell(command: string): boolean {
  return (
    process.platform === "win32" &&
    command !== COMMAND.vp &&
    !path.isAbsolute(command)
  );
}

function quoteCommand(args: string[]): string {
  return args
    .map((arg) => {
      if (/^[a-zA-Z0-9_./:=@-]+$/.test(arg)) {
        return arg;
      }
      return `"${arg.replaceAll('"', '\\"')}"`;
    })
    .join(" ");
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    names: [],
    list: false,
    keep: false,
    skipInstall: false,
    tmpRoot: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === OPTION.separator) {
      continue;
    } else if (arg === OPTION.list) {
      options.list = true;
    } else if (arg === OPTION.case) {
      const value = args[++index];
      if (!value) {
        throw new Error(`${OPTION.case} requires a case name.`);
      }
      options.names.push(value);
    } else if (arg.startsWith(`${OPTION.case}=`)) {
      options.names.push(arg.slice(`${OPTION.case}=`.length));
    } else if (arg === OPTION.keep) {
      options.keep = true;
    } else if (arg === OPTION.skipInstall) {
      options.skipInstall = true;
    } else if (arg === OPTION.tmpRoot) {
      const value = args[++index];
      if (!value) {
        throw new Error(`${OPTION.tmpRoot} requires a directory path.`);
      }
      options.tmpRoot = value;
    } else if (arg.startsWith(`${OPTION.tmpRoot}=`)) {
      options.tmpRoot = arg.slice(`${OPTION.tmpRoot}=`.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
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
