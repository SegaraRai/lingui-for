import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { createSveltePlan } from "../plan/svelte-plan.ts";
import {
  createCombinedProgramFromPlan,
  createModuleProgramFromPlan,
} from "./programs.ts";

describe("lower/programs", () => {
  test("creates direct and combined lowering programs from a plan", () => {
    const plan = createSveltePlan(
      dedent`
        <script module lang="ts">
          export const answer = 42;
        </script>

        <script lang="ts">
          import { t, Trans } from "lingui-for-svelte/macro";
        </script>

        <p>{$t\`Hello\`}</p>
        <Trans>Read docs.</Trans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    const moduleProgram = createModuleProgramFromPlan(plan);
    const combinedProgram = createCombinedProgramFromPlan(plan);

    expect(moduleProgram?.filename).toBe("/virtual/App.module.ts");
    expect(combinedProgram?.filename).toBe("/virtual/App.instance.ts");
    expect(combinedProgram?.code).toContain("__lingui_for_svelte_expr_0");
    expect(combinedProgram?.code).toContain("__lingui_for_svelte_component_0");
  });
});
