import { describe, expect, it } from "vite-plus/test";

import { mayContainLinguiMacroImport } from "./macro-presence.ts";

describe("mayContainLinguiMacroImport", () => {
  it("returns true when the Svelte macro package appears in source", () => {
    expect(
      mayContainLinguiMacroImport(
        'import { t } from "lingui-for-svelte/macro";',
      ),
    ).toBe(true);
  });

  it("returns false when the Svelte macro package is absent", () => {
    expect(
      mayContainLinguiMacroImport('import { t } from "@lingui/core/macro";'),
    ).toBe(false);
  });
});
