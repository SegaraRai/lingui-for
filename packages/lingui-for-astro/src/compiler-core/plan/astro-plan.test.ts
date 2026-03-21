import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { createAstroPlan } from "./astro-plan.ts";

describe("createAstroPlan", () => {
  test("creates frontmatter, expression, and component plan items", () => {
    const source = dedent`
      ---
      import { t, Trans } from "lingui-for-astro/macro";
      const label = t\`Script message\`;
      ---

      <p>{t\`Template message\`}</p>
      <Trans>Component message</Trans>
    `;

    const plan = createAstroPlan(source, {
      filename: "/virtual/Page.astro",
    });

    expect(plan.frontmatter?.content).toContain(
      "const label = t`Script message`;",
    );
    expect(plan.items.map((item) => item.kind)).toEqual([
      "frontmatter-macro-block",
      "template-expression",
      "component-macro",
    ]);
    expect(plan.usesAstroI18n).toBe(true);
    expect(plan.usesRuntimeTrans).toBe(true);
  });
});
