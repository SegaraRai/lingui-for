import { describe, expect, test } from "vite-plus/test";

import {
  basenamePath,
  dirnamePath,
  joinPath,
  normalizePath,
  relativePathFrom,
  resolveRelativeSpecifier,
  splitPathSegments,
} from "./paths.ts";

describe("path helpers", () => {
  test("normalizes Windows separators", () => {
    expect(normalizePath(String.raw`C:\Workspace\src\App.svelte`)).toBe(
      "C:/Workspace/src/App.svelte",
    );
  });

  test("joins path parts without duplicate separators", () => {
    expect(joinPath("C:/Workspace/src/", "/routes/", "index.astro")).toBe(
      "C:/Workspace/src/routes/index.astro",
    );
  });

  test("resolves directory and base names from normalized paths", () => {
    expect(dirnamePath("runtime/trans/RuntimeTrans.svelte")).toBe(
      "runtime/trans",
    );
    expect(dirnamePath("RuntimeTrans.svelte")).toBe(".");
    expect(basenamePath("runtime/trans/RuntimeTrans.svelte")).toBe(
      "RuntimeTrans.svelte",
    );
    expect(basenamePath("runtime/trans/")).toBe("trans");
  });

  test("creates relative paths between generated assets", () => {
    expect(relativePathFrom("runtime/trans", "runtime/core/context.ts")).toBe(
      "../core/context.ts",
    );
    expect(
      relativePathFrom("runtime/trans", "runtime/trans/rich-text.ts"),
    ).toBe("rich-text.ts");
  });

  test("resolves relative import specifiers against a base directory", () => {
    expect(
      resolveRelativeSpecifier("/virtual/runtime/trans", "../core/context.ts"),
    ).toBe("/virtual/runtime/core/context.ts");
    expect(
      resolveRelativeSpecifier("C:/Workspace/src/routes", "./Page.svelte"),
    ).toBe("C:/Workspace/src/routes/Page.svelte");
  });

  test("splits normalized path segments", () => {
    expect(splitPathSegments(String.raw`C:\Workspace\src\App.svelte`)).toEqual([
      "C:",
      "Workspace",
      "src",
      "App.svelte",
    ]);
  });
});
