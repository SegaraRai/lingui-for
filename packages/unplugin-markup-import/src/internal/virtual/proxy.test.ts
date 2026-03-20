import { describe, expect, it } from "vite-plus/test";

import {
  createProxyModuleCode,
  shouldPreserveRelativeMarkupImport,
} from "./proxy.ts";

describe("proxy modules", () => {
  it("creates a proxy that re-exports the public markup specifier", () => {
    expect(createProxyModuleCode("./trans/RuntimeTrans.svelte"))
      .toMatchInlineSnapshot(`
    	"export { default } from "./trans/RuntimeTrans.svelte?unplugin-markup-import-public";
    	"
    `);
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

  it("ignores non-relative and non-markup imports", () => {
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
      shouldPreserveRelativeMarkupImport("./RuntimeTrans.svelte", undefined, [
        ".astro",
        ".svelte",
      ]),
    ).toBe(false);
  });
});
