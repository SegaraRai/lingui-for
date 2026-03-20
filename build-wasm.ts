import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function main(): void {
  const rootDir = dirname(fileURLToPath(import.meta.url));
  const crateDir = join(rootDir, "crates", "astro-analyzer");
  const wasmOutputPath = join(
    rootDir,
    "packages",
    "astro-analyzer-wasm",
    "dist",
    "index_bg.wasm",
  );

  if (process.env.LINGUI_WASM_PREBUILT === "1") {
    console.log("Skipping wasm build because LINGUI_WASM_PREBUILT=1.");
  } else {
    const isDebug = process.env.LINGUI_WASM_DEBUG === "1";
    buildWasm(rootDir, crateDir, isDebug);
  }

  if (!existsSync(wasmOutputPath)) {
    console.error(
      `Expected wasm output was not found: ${wasmOutputPath}. ` +
        "Build astro-analyzer first or unset LINGUI_WASM_PREBUILT.",
    );
    process.exit(1);
  }
}

function buildWasm(rootDir: string, crateDir: string, isDebug: boolean): void {
  const result = spawnSync(
    resolveWasmPack(rootDir),
    [
      "build",
      "--target",
      "web",
      ...(isDebug ? ["--dev", "--no-opt"] : ["--release"]),
      "--out-dir",
      "../../packages/astro-analyzer-wasm/dist",
      "--out-name",
      "index",
    ],
    {
      cwd: crateDir,
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
