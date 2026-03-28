import { readFile } from "node:fs/promises";

import init, {
  type InitOutput,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import wasmUrl from "@lingui-for/internal-lingui-analyzer-wasm/wasm?url";

async function initWasmOnceImpl(): Promise<InitOutput> {
  return await init({
    module_or_path: readFile(new URL(wasmUrl, import.meta.url)),
  });
}

let initOutputPromise: Promise<InitOutput>;

export function initWasmOnce(): Promise<InitOutput> {
  initOutputPromise ??= initWasmOnceImpl();
  return initOutputPromise;
}
