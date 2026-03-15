import { describe, expect, it } from "vitest";

import {
  createProxyModuleCode,
  createScanModuleCode,
  shouldPreserveRelativeSvelteImport,
} from "./virtual-modules.ts";

describe("proxy modules", () => {
  it("creates a proxy that scans the source file and re-exports the public svelte specifier", () => {
    expect(
      createProxyModuleCode(
        "C:/Workspace/lingui-for-svelte/src/runtime/trans/RuntimeTrans.svelte",
        "./trans/RuntimeTrans.svelte",
      ),
    ).toMatchInlineSnapshot(`
      "import "C:/Workspace/lingui-for-svelte/src/runtime/trans/RuntimeTrans.svelte?unplugin-svelte-import-scan";
      export { default } from "./trans/RuntimeTrans.svelte?unplugin-svelte-import-public";"
    `);
  });

  it("creates scan modules that recurse into nested svelte dependencies", () => {
    expect(
      createScanModuleCode([
        "C:/Workspace/lingui-for-svelte/src/runtime/trans/RenderTransNodes.svelte",
      ]),
    ).toMatchInlineSnapshot(`
      "import "C:/Workspace/lingui-for-svelte/src/runtime/trans/RenderTransNodes.svelte?unplugin-svelte-import-scan";"
    `);
    expect(createScanModuleCode([])).toBe("export {};");
  });
});

describe("shouldPreserveRelativeSvelteImport", () => {
  it("preserves relative svelte imports from JS modules", () => {
    expect(
      shouldPreserveRelativeSvelteImport(
        "./trans/RuntimeTrans.svelte",
        "/virtual/runtime/index.ts",
      ),
    ).toBe(true);
  });

  it("ignores non-relative and non-svelte imports", () => {
    expect(
      shouldPreserveRelativeSvelteImport(
        "lingui-for-svelte/runtime",
        "/virtual/runtime/index.ts",
      ),
    ).toBe(false);
    expect(
      shouldPreserveRelativeSvelteImport(
        "./trans/runtime-trans.ts",
        "/virtual/runtime/index.ts",
      ),
    ).toBe(false);
    expect(
      shouldPreserveRelativeSvelteImport("./RuntimeTrans.svelte", undefined),
    ).toBe(false);
  });
});
