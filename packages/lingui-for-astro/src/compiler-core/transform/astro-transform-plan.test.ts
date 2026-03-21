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
      'import { getLinguiContext as __l4a_getLinguiContext } from "lingui-for-astro/runtime";',
    );
  });
});
