import { describe, expect, test } from "vite-plus/test";

import { mayContainLinguiMacroImport } from "./macro-presence.ts";

describe("mayContainLinguiMacroImport", () => {
  test("detects the configured macro package in source", () => {
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
    expect(
      mayContainLinguiMacroImport('import { t } from "custom/macro";', [
        "lingui-for-test/macro",
        "custom/macro",
      ]),
    ).toBe(true);
  });
});
