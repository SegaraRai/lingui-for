import { describe, expect, it } from "vite-plus/test";

import { createScriptFilename, stripQuery } from "./paths.ts";

describe("paths", () => {
  it("strips query strings from ids", () => {
    expect(stripQuery("Component.svelte?type=style&lang.css")).toBe(
      "Component.svelte",
    );
  });

  it("creates synthetic script filenames", () => {
    expect(createScriptFilename("/work/App.svelte", "instance", "ts")).toBe(
      "/work/App.instance.ts",
    );
    expect(createScriptFilename("/work/App.svelte", "module", "js")).toBe(
      "/work/App.module.js",
    );
  });
});
