import { describe, expect, test } from "vite-plus/test";

import { mayContainLinguiMacroImport } from "./macro-presence.ts";

describe("mayContainLinguiMacroImport", () => {
  test("returns true when the Svelte macro package appears in source", () => {
    expect(
      mayContainLinguiMacroImport(
        'import { t } from "lingui-for-svelte/macro";',
      ),
    ).toBe(true);
  });

  test("returns false when the Svelte macro package is absent", () => {
    expect(
      mayContainLinguiMacroImport('import { t } from "@lingui/core/macro";'),
    ).toBe(false);
  });
});
