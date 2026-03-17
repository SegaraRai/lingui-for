import { describe, expect, it } from "vitest";

import { mayContainLinguiMacroImport } from "./macro-presence.ts";

describe("mayContainLinguiMacroImport", () => {
  it("returns true when the Astro macro package appears in source", () => {
    expect(
      mayContainLinguiMacroImport(
        'import { t } from "lingui-for-astro/macro";',
      ),
    ).toBe(true);
  });

  it("returns false when the Astro macro package is absent", () => {
    expect(
      mayContainLinguiMacroImport('import { t } from "@lingui/core/macro";'),
    ).toBe(false);
  });
});
