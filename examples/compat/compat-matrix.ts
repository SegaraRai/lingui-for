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
import { spawnSync } from "node:child_process";

type PackageSection = "dependencies" | "devDependencies" | "peerDependencies";

type PackagePatch = {
  path: string;
  sections: Partial<Record<PackageSection, Record<string, string>>>;
};

type CompatCase = {
  name: string;
  description: string;
  lingui: "5" | "6";
  assertions: CompatAssertions;
  patches: PackagePatch[];
  projects: {
    cwd: string;
    commands: string[][];
  }[];
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

type LocalTarballs = Record<
  | "@lingui-for/framework-core"
  | "lingui-for-astro"
  | "lingui-for-svelte"
  | "unplugin-lingui-macro"
  | "unplugin-markup-import",
  string
>;

const lingui5 = {
  "@lingui/babel-plugin-lingui-macro": "^5.0.0",
  "@lingui/cli": "^5.9.5",
  "@lingui/conf": "^5.9.5",
  "@lingui/core": "^5.9.5",
};

const lingui6 = {
  "@lingui/babel-plugin-lingui-macro": "^6.0.0",
  "@lingui/cli": "^6.0.0",
  "@lingui/conf": "^6.0.0",
  "@lingui/core": "^6.0.0",
};

type Options = {
  names: string[];
  list: boolean;
  keep: boolean;
  skipInstall: boolean;
  tmpRoot: string | undefined;
};

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
      `Unknown compatibility case "${name}". Run "vp run test:compat -- --list" for available cases.`,
    );
  }
  return compatCase;
});

for (const compatCase of selectedCases) {
  runCompatCase(compatCase, options);
}

function runAllCasesInIsolatedProcesses(options: Options): void {
  for (const compatCase of cases) {
    const args = [process.argv[1], "--case", compatCase.name];
    if (options.keep) {
      args.push("--keep");
    }
    if (options.skipInstall) {
      args.push("--skip-install");
    }
    if (options.tmpRoot) {
      args.push("--tmp-root", options.tmpRoot);
    }
    run(process.execPath, args, repoRoot);
  }
}

function runCompatCase(compatCase: CompatCase, options: Options): void {
  validateCompatCaseCommands(compatCase);

  const tmpRoot = options.tmpRoot ? path.resolve(options.tmpRoot) : tmpdir();
  const worktree = mkdtempSync(
    path.join(tmpRoot, `lingui-for-compat-${compatCase.name}-`),
  );

  console.log(`\n==> ${compatCase.name}`);
  console.log(compatCase.description);
  console.log(`worktree: ${worktree}`);

  try {
    const tarballDir = path.join(worktree, "tarballs");
    mkdirSync(tarballDir);
    const tarballs = prepareLocalTarballs(tarballDir);

    for (const project of compatCase.projects) {
      const projectRoot = path.join(worktree, path.basename(project.cwd));
      copyFixture(project.cwd, projectRoot);
      prepareFixturePackageJson(projectRoot, compatCase, project, tarballs);
      patchFixtureConfig(projectRoot);

      if (!options.skipInstall) {
        run("vp", ["install", "--no-frozen-lockfile"], projectRoot);
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
  const wasmEntry = path.join(
    repoRoot,
    "shared",
    "lingui-analyzer-wasm",
    "dist",
    "index.js",
  );
  if (!existsSync(wasmEntry)) {
    run("vp", ["run", "build:wasm"], repoRoot);
  }

  const packages = [
    ["@lingui-for/framework-core", "packages/framework-core"],
    ["unplugin-markup-import", "packages/unplugin-markup-import"],
    ["unplugin-lingui-macro", "packages/unplugin-lingui-macro"],
    ["lingui-for-astro", "packages/lingui-for-astro"],
    ["lingui-for-svelte", "packages/lingui-for-svelte"],
  ] as const;

  const tarballs = {} as LocalTarballs;
  for (const [name, packagePath] of packages) {
    const packageRoot = path.join(repoRoot, packagePath);
    run("vp", ["pack"], packageRoot);
    tarballs[name] = packLocalPackage(packageRoot, tarballDir);
  }

  return tarballs;
}

function packLocalPackage(packageRoot: string, tarballDir: string): string {
  const before = new Set(readdirSync(tarballDir));
  runNpm(["pack", ".", "--pack-destination", tarballDir], packageRoot);
  const created = readdirSync(tarballDir).filter(
    (entry) => entry.endsWith(".tgz") && !before.has(entry),
  );
  if (created.length !== 1) {
    throw new Error(
      `Expected npm pack to create one tarball for ${packageRoot}, got ${created.length}.`,
    );
  }
  return `file:../tarballs/${created[0]}`;
}

function runNpm(args: string[], cwd: string): void {
  const command = process.platform === "win32" ? "npm.exe" : "npm";
  console.log(`$ npm ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      LINGUI_WASM_PREBUILT: process.env.LINGUI_WASM_PREBUILT ?? "1",
      PATH: withNodeModulesBins(cwd),
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status}: npm ${args.join(" ")}`,
    );
  }
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
  return ![
    "node_modules",
    "dist",
    ".astro",
    ".svelte-kit",
    ".sveltekit-build",
    ".vite",
  ].includes(basename);
}

function prepareFixturePackageJson(
  projectRoot: string,
  compatCase: CompatCase,
  project: CompatCase["projects"][number],
  tarballs: LocalTarballs,
): void {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.packageManager = "pnpm@10.33.0";
  packageJson.dependencies ??= {};
  packageJson.devDependencies ??= {};

  applyProjectPackagePatches(packageJson, compatCase.patches, project.cwd);
  replaceCatalogDependencies(packageJson);
  injectLocalPackages(packageJson, project.cwd, tarballs);
  injectVersionMatrixDependencies(packageJson, compatCase);
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
      if (name === "@types/node") {
        dependencies[name] = "^25.6.0";
      } else if (name === "typescript") {
        dependencies[name] = "^5.9.3";
      } else if (name === "vite-plus") {
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
  projectCwd: string,
  tarballs: LocalTarballs,
): void {
  packageJson.devDependencies["unplugin-lingui-macro"] =
    tarballs["unplugin-lingui-macro"];

  if (projectCwd.includes("astro-basic")) {
    packageJson.dependencies["lingui-for-astro"] = tarballs["lingui-for-astro"];
  } else if (projectCwd.includes("sveltekit-basic")) {
    packageJson.dependencies["lingui-for-svelte"] =
      tarballs["lingui-for-svelte"];
  }
}

function injectVersionMatrixDependencies(
  packageJson: Record<string, any>,
  compatCase: CompatCase,
): void {
  const versions = compatCase.lingui === "5" ? lingui5 : lingui6;
  Object.assign(packageJson.dependencies, pick(versions, ["@lingui/core"]));
  Object.assign(
    packageJson.devDependencies,
    pick(versions, ["@lingui/cli", "@lingui/conf"]),
  );

  delete packageJson.devDependencies["vite-plus"];
  const viteMajor = expectedViteMajor(compatCase);
  if (viteMajor === "7") {
    packageJson.devDependencies.vite = "^7.2.7";
  } else {
    packageJson.devDependencies.vite = "^8.0.0";
  }
}

function injectPackageOverrides(
  packageJson: Record<string, any>,
  compatCase: CompatCase,
  tarballs: LocalTarballs,
): void {
  const versions = compatCase.lingui === "5" ? lingui5 : lingui6;
  packageJson.pnpm ??= {};
  packageJson.pnpm.overrides ??= {};
  Object.assign(packageJson.pnpm.overrides, {
    "@lingui-for/framework-core": tarballs["@lingui-for/framework-core"],
    "unplugin-markup-import": tarballs["unplugin-markup-import"],
    ...versions,
  });
}

function patchFixtureConfig(projectRoot: string): void {
  const viteConfigPath = path.join(projectRoot, "vite.config.ts");
  if (!existsSync(viteConfigPath)) {
    return;
  }
  const viteConfig = readFileSync(viteConfigPath, "utf8");
  writeFileSync(viteConfigPath, viteConfig.replaceAll("vite-plus", "vite"));
}

function loadCases(): CompatCase[] {
  const casesDir = path.resolve(import.meta.dirname, "cases");
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
        name: "@lingui/core",
        major: config.lingui,
      },
      {
        cwd: project.cwd,
        name: "@lingui/cli",
        major: config.lingui,
      },
      {
        cwd: project.cwd,
        name: "@lingui/conf",
        major: config.lingui,
      },
      {
        cwd: project.cwd,
        name: "unplugin-lingui-macro",
        major: "0",
      },
      {
        cwd: project.cwd,
        name: "@lingui/babel-plugin-lingui-macro",
        issuerPackage: "unplugin-lingui-macro",
        major: config.lingui,
      },
    );

    if (project.cwd.includes("astro-basic")) {
      packages.push(
        {
          cwd: project.cwd,
          name: "astro",
          major: expectedAstroMajor(config),
        },
        {
          cwd: project.cwd,
          name: "lingui-for-astro",
          major: "0",
        },
        {
          cwd: project.cwd,
          name: "@lingui-for/framework-core",
          issuerPackage: "lingui-for-astro",
          major: "0",
        },
      );
    }

    if (project.cwd.includes("sveltekit-basic")) {
      packages.push(
        {
          cwd: project.cwd,
          name: "@sveltejs/vite-plugin-svelte",
          major: expectedSveltePluginMajor(config),
        },
        {
          cwd: project.cwd,
          name: "vite",
          major: expectedViteMajor(config),
          source: "moduleVersion",
        },
        {
          cwd: project.cwd,
          name: "lingui-for-svelte",
          major: "0",
        },
        {
          cwd: project.cwd,
          name: "@lingui-for/framework-core",
          issuerPackage: "lingui-for-svelte",
          major: "0",
        },
      );
    }

    if (project.cwd.includes("vite-basic")) {
      packages.push({
        cwd: project.cwd,
        name: "vite",
        major: expectedViteMajor(config),
        source: "moduleVersion",
      });
    }
  }

  return packages;
}

function expectedAstroMajor(config: Pick<CompatCase, "name">): string {
  return config.name.includes("astro5") ? "5" : "6";
}

function expectedSveltePluginMajor(config: Pick<CompatCase, "name">): string {
  return config.name.includes("vite7") ? "6" : "7";
}

function expectedViteMajor(config: Pick<CompatCase, "name">): string {
  return config.name.includes("vite7") ? "7" : "8";
}

function validateCompatCaseCommands(compatCase: CompatCase): void {
  for (const project of compatCase.projects) {
    const commands = project.commands.map((command) => command.join(" "));
    if (!commands.includes("lingui extract --clean --overwrite")) {
      throw new Error(
        `${compatCase.name}:${project.cwd} must explicitly run lingui extract --clean --overwrite.`,
      );
    }
    if (!commands.includes("lingui compile")) {
      throw new Error(
        `${compatCase.name}:${project.cwd} must explicitly run lingui compile.`,
      );
    }

    if (project.cwd.includes("astro-basic")) {
      requireCommand(commands, "astro build", compatCase, project.cwd);
    } else if (project.cwd.includes("sveltekit-basic")) {
      requireCommand(commands, "svelte-kit sync", compatCase, project.cwd);
      requireCommand(commands, "vite build", compatCase, project.cwd);
    } else {
      requireCommand(commands, "vite build", compatCase, project.cwd);
    }
  }
}

function requireCommand(
  commands: string[],
  expected: string,
  compatCase: CompatCase,
  projectCwd: string,
): void {
  if (!commands.includes(expected)) {
    throw new Error(
      `${compatCase.name}:${projectCwd} must explicitly run ${expected}.`,
    );
  }
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
    throw new Error(
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
    ? ["cmd.exe", ["/d", "/s", "/c", quoteCommand([command, ...args])]]
    : [command, args];

  const result = spawnSync(executable, executableArgs, {
    cwd,
    env: {
      ...process.env,
      LINGUI_WASM_PREBUILT: process.env.LINGUI_WASM_PREBUILT ?? "1",
      PATH: withNodeModulesBins(cwd),
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
  return [
    ...paths,
    ...currentPath.split(path.delimiter).filter((entry) => {
      return !path
        .normalize(entry)
        .endsWith(path.normalize("node_modules/.bin"));
    }),
  ]
    .filter(Boolean)
    .join(path.delimiter);
}

function commandRequiresWindowsShell(command: string): boolean {
  return process.platform === "win32" && !path.isAbsolute(command);
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
    if (arg === "--") {
      continue;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--case") {
      const value = args[++index];
      if (!value) {
        throw new Error("--case requires a case name.");
      }
      options.names.push(value);
    } else if (arg.startsWith("--case=")) {
      options.names.push(arg.slice("--case=".length));
    } else if (arg === "--keep") {
      options.keep = true;
    } else if (arg === "--skip-install") {
      options.skipInstall = true;
    } else if (arg === "--tmp-root") {
      const value = args[++index];
      if (!value) {
        throw new Error("--tmp-root requires a directory path.");
      }
      options.tmpRoot = value;
    } else if (arg.startsWith("--tmp-root=")) {
      options.tmpRoot = arg.slice("--tmp-root=".length);
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
