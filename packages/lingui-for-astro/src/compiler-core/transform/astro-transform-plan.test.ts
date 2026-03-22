import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { createAstroPlan } from "../plan/index.ts";
import {
  applyAstroReplacementPlan,
  createAstroReplacementPlan,
} from "./astro-transform-plan.ts";

describe("transform/astro-transform-plan", () => {
  test("builds and applies compile replacements from a plan", () => {
    const source = dedent`
      ---
      import { t } from "lingui-for-astro/macro";
      const label = t\`Welcome\`;
      ---

      <p>{t\`Hello\`}</p>
    `;
    const plan = createAstroPlan(source, { filename: "/virtual/Page.astro" });
    const replacements = createAstroReplacementPlan(plan);
    const result = applyAstroReplacementPlan(
      source,
      "/virtual/Page.astro",
      replacements,
    );

    expect(replacements.length).toBeGreaterThan(0);
    expect(result.code).toContain("__l4a_i18n._(");
    expect(result.code).toContain(
      'import { createFrontmatterI18n as __l4a_createI18n } from "lingui-for-astro/runtime";',
    );
  });

  test("keeps a blank line between injected prelude and remaining frontmatter code", () => {
    const source = dedent`
      ---
      import { t } from "lingui-for-astro/macro";
      const label = "Welcome";
      ---

      <p>{t\`Hello\`}</p>
    `;
    const plan = createAstroPlan(source, { filename: "/virtual/Page.astro" });
    const replacements = createAstroReplacementPlan(plan);
    const result = applyAstroReplacementPlan(
      source,
      "/virtual/Page.astro",
      replacements,
    );

    expect(result.code).toContain(
      [
        "const __l4a_i18n = __l4a_createI18n(Astro.locals);",
        "",
        'const label = "Welcome";',
      ].join("\n"),
    );
  });

  test("does not leave an extra blank line when the transformed frontmatter becomes prelude-only", () => {
    const source = dedent`
      ---
      import { Trans } from "lingui-for-astro/macro";
      ---

      <Trans>Hello</Trans>
    `;
    const plan = createAstroPlan(source, { filename: "/virtual/Page.astro" });
    const replacements = createAstroReplacementPlan(plan);
    const result = applyAstroReplacementPlan(
      source,
      "/virtual/Page.astro",
      replacements,
    );

    expect(result.code).toContain(
      [
        'import { RuntimeTrans as L4aRuntimeTrans } from "lingui-for-astro/runtime";',
        "---",
      ].join("\n"),
    );
    expect(result.code).not.toContain(
      [
        'import { RuntimeTrans as L4aRuntimeTrans } from "lingui-for-astro/runtime";',
        "",
        "---",
      ].join("\n"),
    );
  });
});
