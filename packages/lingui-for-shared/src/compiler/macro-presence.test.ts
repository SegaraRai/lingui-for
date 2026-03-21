import { describe, expect, it } from "vite-plus/test";

import { mayContainLinguiMacroImport } from "./macro-presence.ts";

describe("mayContainLinguiMacroImport", () => {
  it("detects the configured macro package in source", () => {
    expect(
      mayContainLinguiMacroImport(
        'import { t } from "lingui-for-test/macro";',
        "lingui-for-test/macro",
      ),
    ).toBe(true);
    expect(
      mayContainLinguiMacroImport(
        "const answer = 42;",
        "lingui-for-test/macro",
      ),
    ).toBe(false);
  });
});
