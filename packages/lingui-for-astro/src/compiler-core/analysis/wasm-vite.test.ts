import { describe, expect, test } from "vite-plus/test";

import { initWasmOnce } from "./wasm-vite.ts";

describe("analysis/wasm-vite", () => {
  test("initializes wasm only once", () => {
    const first = initWasmOnce();
    const second = initWasmOnce();

    expect(first).toBe(second);
    expect(first.memory).toBeDefined();
  });
});
