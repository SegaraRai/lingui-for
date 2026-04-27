import {
  cpSync,
  existsSync,
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
  patches: PackagePatch[];
  projects: {
    cwd: string;
    commands: string[][];
  }[];
};

type CompatCaseConfig = Omit<CompatCase, "patches"> & {
  lingui: "5" | "6";
  patches?: PackagePatch[];
};

const lingui5 = {
  "@lingui/babel-plugin-lingui-macro": "^5.0.0",
  "@lingui/cli": "^5.9.5",
  "@lingui/conf": "^5.9.5",
  "@lingui/core": "^5.9.5",
  "@lingui/react": "^5.9.5",
};

const lingui6 = {
  "@lingui/babel-plugin-lingui-macro": "^6.0.0",
  "@lingui/cli": "^6.0.0",
  "@lingui/conf": "^6.0.0",
  "@lingui/core": "^6.0.0",
  "@lingui/react": "^6.0.0",
};

const packageLinguiDevDependencyPatches = (
  versions: typeof lingui5,
): PackagePatch[] => [
  {
    path: "packages/framework-core/package.json",
    sections: {
      devDependencies: pick(versions, ["@lingui/cli", "@lingui/conf"]),
    },
  },
  {
    path: "packages/lingui-for-astro/package.json",
    sections: {
      devDependencies: pick(versions, [
        "@lingui/babel-plugin-lingui-macro",
        "@lingui/cli",
        "@lingui/conf",
        "@lingui/core",
      ]),
    },
  },
  {
    path: "packages/lingui-for-svelte/package.json",
    sections: {
      devDependencies: pick(versions, [
        "@lingui/babel-plugin-lingui-macro",
        "@lingui/cli",
        "@lingui/conf",
        "@lingui/core",
      ]),
    },
  },
  {
    path: "packages/unplugin-lingui-macro/package.json",
    sections: {
      devDependencies: pick(versions, [
        "@lingui/babel-plugin-lingui-macro",
        "@lingui/conf",
      ]),
    },
  },
];

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
  const tmpRoot = options.tmpRoot ? path.resolve(options.tmpRoot) : tmpdir();
  const worktree = mkdtempSync(
    path.join(tmpRoot, `lingui-for-compat-${compatCase.name}-`),
  );

  console.log(`\n==> ${compatCase.name}`);
  console.log(compatCase.description);
  console.log(`worktree: ${worktree}`);

  try {
    copyRepo(worktree);
    enableCompatWorkspaces(worktree);
    applyPatches(worktree, compatCase.patches);

    if (!options.skipInstall) {
      run("vp", ["install", "--no-frozen-lockfile"], worktree);
    }

    const wasmEntry = path.join(
      worktree,
      "shared",
      "lingui-analyzer-wasm",
      "dist",
      "index.js",
    );
    if (!existsSync(wasmEntry)) {
      run("vp", ["run", "build:wasm"], worktree);
    }

    for (const project of compatCase.projects) {
      for (const command of project.commands) {
        run(command[0], command.slice(1), path.join(worktree, project.cwd));
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

function loadCases(): CompatCase[] {
  const casesDir = path.resolve(import.meta.dirname, "cases");
  return readdirSync(casesDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => {
      const config = JSON.parse(
        readFileSync(path.join(casesDir, entry), "utf8"),
      ) as CompatCaseConfig;
      const versions = config.lingui === "5" ? lingui5 : lingui6;
      return {
        name: config.name,
        description: config.description,
        patches: [
          ...packageLinguiDevDependencyPatches(versions),
          ...(config.patches ?? []),
        ],
        projects: config.projects,
      };
    });
}

function copyRepo(destination: string): void {
  cpSync(repoRoot, destination, {
    dereference: false,
    filter: (source) => shouldCopy(source),
    force: true,
    recursive: true,
  });
}

function shouldCopy(source: string): boolean {
  if (source === repoRoot) {
    return true;
  }

  const relative = path.relative(repoRoot, source);
  const segments = relative.split(path.sep);
  const basename = path.basename(source);

  if (
    segments.includes(".git") ||
    segments.includes("node_modules") ||
    segments.includes("target") ||
    segments.includes(".astro") ||
    segments.includes(".svelte-kit") ||
    segments.includes(".sveltekit-build") ||
    segments.includes(".unplugin-markup-import") ||
    segments.includes(".vite") ||
    segments.includes(".vite-temp") ||
    segments[0] === "docs.local" ||
    segments[0] === "tests.local"
  ) {
    return false;
  }

  if (
    basename === "dist" &&
    path.join(...segments) !==
      path.join("shared", "lingui-analyzer-wasm", "dist")
  ) {
    return false;
  }

  return true;
}

function applyPatches(worktree: string, patches: PackagePatch[]): void {
  for (const patch of patches) {
    const packageJsonPath = path.join(worktree, patch.path);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    for (const [section, dependencies] of Object.entries(patch.sections)) {
      packageJson[section] ??= {};
      Object.assign(packageJson[section], dependencies);
    }

    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  }
}

function enableCompatWorkspaces(worktree: string): void {
  const rootPackageJsonPath = path.join(worktree, "package.json");
  const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf8"));
  rootPackageJson.workspaces = appendUnique(rootPackageJson.workspaces ?? [], [
    "examples/compat/*",
  ]);
  writeFileSync(
    rootPackageJsonPath,
    `${JSON.stringify(rootPackageJson, null, 2)}\n`,
  );

  const workspacePath = path.join(worktree, "pnpm-workspace.yaml");
  const workspaceConfig = readFileSync(workspacePath, "utf8");
  if (!workspaceConfig.includes("  - examples/compat/*")) {
    writeFileSync(
      workspacePath,
      workspaceConfig.replace(
        "  - examples/*\n",
        "  - examples/*\n  - examples/compat/*\n",
      ),
    );
  }
}

function appendUnique<T>(items: T[], additions: T[]): T[] {
  return [
    ...items,
    ...additions.filter((addition) => !items.includes(addition)),
  ];
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
