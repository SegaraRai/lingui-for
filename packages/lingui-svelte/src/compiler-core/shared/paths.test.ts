import { describe, expect, it } from "vitest";

import {
  createScriptFilename,
  getScriptLangFromFilename,
  isTransformableScript,
  stripQuery,
} from "./paths.ts";

describe("paths", () => {
  it("strips query strings from ids", () => {
    expect(stripQuery("Component.svelte?type=style&lang.css")).toBe(
      "Component.svelte",
    );
  });

  it("detects transformable JavaScript and TypeScript files", () => {
    expect(isTransformableScript("file.ts")).toBe(true);
    expect(isTransformableScript("file.ts?raw")).toBe(true);
    expect(isTransformableScript("file.mts")).toBe(true);
    expect(isTransformableScript("file.cjs")).toBe(true);
    expect(isTransformableScript("file.svelte")).toBe(false);
  });

  it("maps JS and TS-family extensions to parser languages", () => {
    expect(getScriptLangFromFilename("file.js")).toBe("js");
    expect(getScriptLangFromFilename("file.mjs?worker")).toBe("js");
    expect(getScriptLangFromFilename("file.mjs?worker.ts")).toBe("js");
    expect(getScriptLangFromFilename("file.ts")).toBe("ts");
    expect(getScriptLangFromFilename("file.cts")).toBe("ts");
    expect(getScriptLangFromFilename("file.mts")).toBe("ts");
    expect(getScriptLangFromFilename("file.mts?example.js")).toBe("ts");
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
