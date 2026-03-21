import { describe, expect, test } from "vite-plus/test";

import { createScriptFilename } from "./paths.ts";

describe("paths", () => {
  test("creates synthetic script filenames", () => {
    expect(createScriptFilename("/work/App.svelte", "instance", "ts")).toBe(
      "/work/App.instance.ts",
    );
    expect(createScriptFilename("/work/App.svelte", "module", "js")).toBe(
      "/work/App.module.js",
    );
  });
});
