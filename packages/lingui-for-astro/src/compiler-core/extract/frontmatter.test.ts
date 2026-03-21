import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { transformFrontmatterExtractionUnit } from "./frontmatter.ts";

describe("transformFrontmatterExtractionUnit", () => {
  it("builds a Lingui-marked extraction unit for frontmatter macros", () => {
    const source = dedent`
      import { t } from "lingui-for-astro/macro";
      const label = t\`Welcome\`;
    `;

    const unit = transformFrontmatterExtractionUnit(source, source, 0, {
      filename: "/virtual/Page.astro",
    });

    expect(unit.code).toContain("/*i18n*/");
    expect(unit.code).toMatch(/_i18n\._\(\s*\/\*i18n\*\//);
  });
});
