import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { normalizeLinguiConfig } from "../common/config.ts";
import { lowerAstroExtractProgram } from "./extract.ts";

describe("lowerAstroExtractProgram", () => {
  test("keeps extraction output in Lingui-friendly form", () => {
    const result = lowerAstroExtractProgram(
      dedent`
        import { t } from "lingui-for-astro/macro";

        const __lingui_for_astro_expr_0 = t({ id: "demo.save", message: "Save" });
      `,
      {
        filename: "/virtual/Page.astro?extract-expression",
        linguiConfig: normalizeLinguiConfig(),
      },
    );

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("_i18n._(");
  });
});
