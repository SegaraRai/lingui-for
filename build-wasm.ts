import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type WasmTarget = {
  crateDir: string;
  outputDir: string;
  outputName: string;
  expectedOutput: string;
};

function main(): void {
  const rootDir = dirname(fileURLToPath(import.meta.url));
  const targets: WasmTarget[] = [
    {
      crateDir: join(rootDir, "crates", "lingui-analyzer"),
      outputDir: "../../shared/lingui-analyzer-wasm/dist",
      outputName: "index",
      expectedOutput: join(
        rootDir,
        "packages",
        "lingui-analyzer-wasm",
        "dist",
        "index_bg.wasm",
      ),
    },
  ];

  if (process.env.LINGUI_WASM_PREBUILT === "1") {
    console.log("Skipping wasm build because LINGUI_WASM_PREBUILT=1.");
  } else {
    const isDebug = process.env.LINGUI_WASM_DEBUG === "1";
    for (const target of targets) {
      buildWasm(rootDir, target, isDebug);
    }
  }

  for (const target of targets) {
    if (!existsSync(target.expectedOutput)) {
      console.error(
        `Expected wasm output was not found: ${target.expectedOutput}. ` +
          "Build wasm targets first or unset LINGUI_WASM_PREBUILT.",
      );
      process.exit(1);
    }
  }
}

function buildWasm(
  rootDir: string,
  target: WasmTarget,
  isDebug: boolean,
): void {
  const absoluteOutputDir = resolve(target.crateDir, target.outputDir);

  // wasm-pack reuses files in the output directory and can choke on its own
  // previously generated package.json, so rebuild the directory from scratch.
  rmSync(absoluteOutputDir, { recursive: true, force: true });
  mkdirSync(absoluteOutputDir, { recursive: true });

  const result = spawnSync(
    resolveWasmPack(rootDir),
    [
      "build",
      "--target",
      "web",
      ...(isDebug ? ["--dev", "--no-opt"] : ["--release"]),
      "--out-dir",
      target.outputDir,
      "--out-name",
      target.outputName,
    ],
    {
      cwd: target.crateDir,
      stdio: "inherit",
      shell: true,
    },
  );

  if (result.error) {
    console.error(`Failed to run wasm-pack: ${result.error.message}`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveWasmPack(rootDir: string): string {
  const localBinary = join(
    rootDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wasm-pack.cmd" : "wasm-pack",
  );
  if (existsSync(localBinary)) {
    return localBinary;
  }

  return process.platform === "win32" ? "wasm-pack.cmd" : "wasm-pack";
}

main();
