import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { createSveltePlan } from "../plan/svelte-plan.ts";
import {
  lowerComponentMacro,
  lowerTemplateExpression,
} from "./snippet-lowering.ts";

describe("snippet-lowering", () => {
  test("lowers a template expression for compile", () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";
      </script>
      <p>{$t\`Hello\`}</p>
    `;
    const plan = createSveltePlan(source, { filename: "/virtual/App.svelte" });
    const expression = plan.analysis.expressions[0]!;

    const lowered = lowerTemplateExpression(
      expression.source,
      expression.start,
      plan,
      {
        extract: false,
        runtimeBindings: {
          createLinguiAccessors: "createLinguiAccessors",
          context: "__l4s_ctx",
          getI18n: "__l4s_getI18n",
          translate: "__l4s_translate",
        },
      },
    );

    expect(lowered.code).toContain("__l4s_translate");
  });

  test("lowers a component macro for compile", () => {
    const source = dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";
      </script>
      <Trans>Hello</Trans>
    `;
    const plan = createSveltePlan(source, { filename: "/virtual/App.svelte" });
    const component = plan.analysis.components[0]!;
    const lowered = lowerComponentMacro(
      component.source,
      component.start,
      plan,
      {
        extract: false,
        runtimeBindings: {
          createLinguiAccessors: "createLinguiAccessors",
          context: "__l4s_ctx",
          getI18n: "__l4s_getI18n",
          translate: "__l4s_translate",
        },
        runtimeTransComponentName: "L4sRuntimeTrans",
      },
    );

    expect(lowered.code).toContain("<L4sRuntimeTrans");
  });
});
