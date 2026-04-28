import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const COMMAND = {
  vp: "vp",
  cmdWindows: "cmd.exe",
} as const;

export function run(command: string, args: string[], cwd: string): void {
  console.log(`$ ${command} ${args.join(" ")}`);
  const [executable, executableArgs] = commandRequiresWindowsShell(command)
    ? [COMMAND.cmdWindows, ["/d", "/s", "/c", quoteCommand([command, ...args])]]
    : [command, args];
  const pathEnvKey = getPathEnvKey();

  const result = spawnSync(executable, executableArgs, {
    cwd,
    env: {
      ...process.env,
      LINGUI_WASM_PREBUILT: process.env.LINGUI_WASM_PREBUILT ?? "1",
      [pathEnvKey]:
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

  const currentPath = getPathEnvValue();
  return [...paths, ...pathEntriesWithoutNodeModulesBins(currentPath)]
    .filter(Boolean)
    .join(path.delimiter);
}

function withoutNodeModulesBins(): string {
  return pathEntriesWithoutNodeModulesBins(getPathEnvValue())
    .filter(Boolean)
    .join(path.delimiter);
}

function getPathEnvKey(): string {
  return (
    Object.keys(process.env).find((key) => key.toLowerCase() === "path") ??
    "PATH"
  );
}

function getPathEnvValue(): string {
  return process.env[getPathEnvKey()] ?? "";
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
