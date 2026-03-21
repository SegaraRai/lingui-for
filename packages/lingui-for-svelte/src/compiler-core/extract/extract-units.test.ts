import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { createExtractionUnits } from "./extract-units.ts";

describe("createExtractionUnits", () => {
  it("produces macro-transformed extraction code for svelte files", () => {
    const units = createExtractionUnits(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";
          const direct = $t\`Direct\`;
        </script>

        <p>{$t\`Template\`}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
  });
});
