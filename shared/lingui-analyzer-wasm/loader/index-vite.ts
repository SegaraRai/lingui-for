import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import init, {
  type InitOutput,
} from "@lingui-for/internal-lingui-analyzer-wasm";

async function initWasmOnceImpl(): Promise<InitOutput> {
  // On Vite(st), we need to resolve the wasm path on runtime.
  // This is not the case when bundling with esbuild since strip-whitespace-wasm is a private
  // package and therefore we need to bundle the wasm file directly.
  const wasmPath = createRequire(import.meta.url).resolve(
    "@lingui-for/internal-lingui-analyzer-wasm/wasm",
  );
  const wasm = await readFile(wasmPath);
  return await init({ module_or_path: wasm });
}

let initOutputPromise: Promise<InitOutput>;

export function initWasmOnce(): Promise<InitOutput> {
  initOutputPromise ??= initWasmOnceImpl();
  return initOutputPromise;
}
