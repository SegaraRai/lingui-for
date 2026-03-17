import { initSync, type InitOutput } from "astro-analyzer-wasm";
import wasmPath from "astro-analyzer-wasm/wasm";
import { readFileSync } from "node:fs";

export * from "astro-analyzer-wasm";

let initOutput: InitOutput | undefined;

export function initWasmOnce(): InitOutput {
  if (!initOutput) {
    const wasm = readFileSync(new URL(wasmPath, import.meta.url));
    initOutput = initSync({ module: wasm });
  }
  return initOutput;
}
