import { describe, expect, it } from "vitest";

import { hasLinguiMacroImport } from "./imports.ts";

describe("hasLinguiMacroImport", () => {
  const packageNames = ["@lingui/core/macro", "@lingui/react/macro"];

  it("detects macros in TSX files", () => {
    const code = [
      'import { Trans } from "@lingui/react/macro";',
      "",
      "export function Demo() {",
      "  return <Trans>Hello from React.</Trans>;",
      "}",
    ].join("\n");

    expect(hasLinguiMacroImport(code, "/virtual/Demo.tsx", packageNames)).toBe(
      true,
    );
  });

  it("supports custom macro package names", () => {
    const code = [
      'import { msg } from "@acme/lingui-core";',
      "",
      "export const descriptor = msg`Hello from a custom macro package.`;",
    ].join("\n");

    expect(
      hasLinguiMacroImport(code, "/virtual/custom.ts", ["@acme/lingui-core"]),
    ).toBe(true);
  });

  it("falls back to the import block when later syntax is unsupported", () => {
    const code = [
      'import { msg } from "@lingui/core/macro";',
      "",
      "type User = { name: string };",
      "export const descriptor = msg`Hello from Flow.`;",
    ].join("\n");

    expect(
      hasLinguiMacroImport(code, "/virtual/flow.js", ["@lingui/core/macro"]),
    ).toBe(true);
  });

  it("returns false when no Lingui macro import exists", () => {
    expect(
      hasLinguiMacroImport(
        'export const value = "plain";',
        "/virtual/plain.ts",
        packageNames,
      ),
    ).toBe(false);
  });

  it("ignores string literals that only mention a macro package", () => {
    expect(
      hasLinguiMacroImport(
        'export const note = "import { msg } from \\"@lingui/core/macro\\"";',
        "/virtual/string-literal.ts",
        packageNames,
      ),
    ).toBe(false);
  });
});
