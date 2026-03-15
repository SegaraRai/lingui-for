import { describe, expect, it } from "vitest";

import {
  createProxyModuleCode,
  createScanModuleCode,
  shouldPreserveRelativeMarkupImport,
} from "./virtual-modules.ts";

describe("proxy modules", () => {
  it("creates a proxy that scans the source file and re-exports the public markup specifier", () => {
    expect(
      createProxyModuleCode(
        "C:/Workspace/lingui-for-svelte/src/runtime/trans/RuntimeTrans.svelte",
        "./trans/RuntimeTrans.svelte",
      ),
    ).toMatchInlineSnapshot(`
      "import "C:/Workspace/lingui-for-svelte/src/runtime/trans/RuntimeTrans.svelte?unplugin-markup-import-scan";
      export { default } from "./trans/RuntimeTrans.svelte?unplugin-markup-import-public";"
    `);
  });

  it("creates scan modules that recurse into nested markup dependencies", () => {
    expect(
      createScanModuleCode([
        "C:/Workspace/lingui-for-svelte/src/runtime/trans/RenderTransNodes.svelte",
      ]),
    ).toMatchInlineSnapshot(`
      "import "C:/Workspace/lingui-for-svelte/src/runtime/trans/RenderTransNodes.svelte?unplugin-markup-import-scan";"
    `);
    expect(createScanModuleCode([])).toBe("export {};");
  });
});

describe("shouldPreserveRelativeMarkupImport", () => {
  it("preserves relative svelte imports from JS modules", () => {
    expect(
      shouldPreserveRelativeMarkupImport(
        "./trans/RuntimeTrans.svelte",
        "/virtual/runtime/index.ts",
        [".astro", ".svelte"],
      ),
    ).toBe(true);
  });

  it("preserves relative astro imports from JS modules", () => {
    expect(
      shouldPreserveRelativeMarkupImport(
        "./RuntimeTrans.astro",
        "/virtual/runtime/index.ts",
        [".astro", ".svelte"],
      ),
    ).toBe(true);
  });

  it("ignores non-relative and non-svelte imports", () => {
    expect(
      shouldPreserveRelativeMarkupImport(
        "lingui-for-svelte/runtime",
        "/virtual/runtime/index.ts",
        [".astro", ".svelte"],
      ),
    ).toBe(false);
    expect(
      shouldPreserveRelativeMarkupImport(
        "./trans/runtime-trans.ts",
        "/virtual/runtime/index.ts",
        [".astro", ".svelte"],
      ),
    ).toBe(false);
    expect(
      shouldPreserveRelativeMarkupImport(
        "./RuntimeTrans.svelte",
        undefined,
        [".astro", ".svelte"],
      ),
    ).toBe(false);
  });
});
