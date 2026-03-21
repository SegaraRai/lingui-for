import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { transformAstro } from "./transform-astro.ts";

describe("transformAstro edit discipline", () => {
  it("rewrites only macro-bearing regions and preserves untouched frontmatter and markup", () => {
    const source = dedent`
      ---
      import { t, Trans } from "lingui-for-astro/macro";

      const keepBefore = "before";
      // KEEP_FRONTMATTER_COMMENT
      const eagerLabel = t\`Mapped script message\`;
      const keepAfter = "after";
      ---

      <section data-keep="yes">
        <p>{keepBefore}</p>
        <p>{t\`Mapped template message\`}</p>
        <Trans>Mapped component message</Trans>
        <p>{keepAfter}</p>
      </section>
    `;

    const result = transformAstro(source, {
      filename: "/virtual/Page.astro",
    });

    expect(result.code).toContain('const keepBefore = "before";');
    expect(result.code).toContain("// KEEP_FRONTMATTER_COMMENT");
    expect(result.code).toContain('const keepAfter = "after";');
    expect(result.code).toContain('<section data-keep="yes">');
    expect(result.code).toContain("<p>{keepBefore}</p>");
    expect(result.code).toContain("<p>{keepAfter}</p>");
    expect(result.code).toContain("Mapped script message");
    expect(result.code).toContain("Mapped template message");
    expect(result.code).toContain("Mapped component message");
  });
});
