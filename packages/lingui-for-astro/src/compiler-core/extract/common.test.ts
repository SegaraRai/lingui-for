import { describe, expect, it } from "vite-plus/test";

import {
  createComponentWrapperPrefix,
  createSyntheticMacroImports,
  isExtractionCodeRelevant,
} from "./common.ts";

describe("extract/common", () => {
  it("builds synthetic macro imports and component wrapper prefixes", () => {
    const bindings = new Map([
      ["t", "t"],
      ["LocalTrans", "Trans"],
    ]);

    expect(createSyntheticMacroImports(bindings)).toContain(
      'import { t } from "lingui-for-astro/macro";',
    );
    expect(createSyntheticMacroImports(bindings)).toContain(
      'import { Trans as LocalTrans } from "lingui-for-astro/macro";',
    );
    expect(createComponentWrapperPrefix(bindings)).toContain(
      "const __lingui_for_astro_component_0 = (",
    );
  });

  it("detects whether extraction output contains Lingui markers", () => {
    expect(isExtractionCodeRelevant("const a = 1;")).toBe(false);
    expect(isExtractionCodeRelevant("/*i18n*/ const a = 1;")).toBe(true);
  });
});
