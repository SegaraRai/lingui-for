import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { createSveltePlan } from "./svelte-plan.ts";

describe("createSveltePlan", () => {
  test("analyzes module, instance, expressions, and component macros once", () => {
    const source = dedent`
      <script module lang="ts">
        import { msg } from "lingui-for-svelte/macro";
        export const descriptor = msg\`Module\`;
      </script>

      <script lang="ts">
        import { t, Trans } from "lingui-for-svelte/macro";
        const eager = t.eager\`Hello\`;
        const label = $t\`Hello\`;
      </script>

      <p>{$t\`Hi\`}</p>
      <Trans>Read docs.</Trans>
    `;

    const plan = createSveltePlan(source, {
      filename: "/virtual/App.svelte",
    });

    expect(plan.filename).toBe("/virtual/App.svelte");
    expect(plan.analysis.module?.lang).toBe("ts");
    expect(plan.analysis.instance?.lang).toBe("ts");
    expect(plan.analysis.expressions).toHaveLength(1);
    expect(plan.analysis.components).toHaveLength(1);
    expect(plan.moduleMacros.imports).toHaveLength(1);
    expect(plan.moduleMacros.expressions).toHaveLength(1);
    expect(plan.instanceMacros.imports).toHaveLength(1);
    expect(plan.instanceMacros.expressions).toHaveLength(2);
  });

  test("rejects bare reactive script macros during planning", () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";
        const label = t\`Hello\`;
      </script>
    `;

    expect(() =>
      createSveltePlan(source, {
        filename: "/virtual/App.svelte",
      }),
    ).toThrow(/Bare `t` in `.svelte` files is not allowed/);
  });
});
