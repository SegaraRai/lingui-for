import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { createSveltePlan } from "./svelte-plan.ts";

describe("createSveltePlan", () => {
  it("analyzes module, instance, expressions, and component macros once", () => {
    const source = dedent`
      <script module lang="ts">
        export const answer = 42;
      </script>

      <script lang="ts">
        import { t, Trans } from "lingui-for-svelte/macro";
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
  });
});
