import { initSync, type InitOutput } from "astro-analyzer-wasm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export * from "astro-analyzer-wasm";

let initOutput: InitOutput | undefined;

export function initWasmOnce(): InitOutput {
  if (!initOutput) {
    // On Vite(st), we need to resolve the wasm path on runtime.
    // This is not the case when bundling with esbuild since astro-analyzer-wasm is a private
    // package and therefore we need to bundle the wasm file directly.
    const wasmPath = createRequire(import.meta.url).resolve(
      "astro-analyzer-wasm/wasm",
    );
    const wasm = readFileSync(wasmPath);
    initOutput = initSync({ module: wasm });
  }
  return initOutput;
}
