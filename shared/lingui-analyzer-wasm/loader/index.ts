import {
  initSync,
  type InitOutput,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import initSyncFromTSDown from "../dist/index_bg.wasm?init&sync";

let initOutput: InitOutput | undefined;

export function initWasmOnce(): InitOutput {
  initOutput ??= initSync({ module: initSyncFromTSDown() });
  return initOutput;
}
