import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { hasImport } from "./imports.ts";

describe("hasImport", () => {
  const packageNames = ["@lingui/core/macro", "@lingui/react/macro"];

  it("detects macros in TSX files", () => {
    const code = dedent`
      import { Trans } from "@lingui/react/macro";

      export function Demo() {
        return <Trans>Hello from React.</Trans>;
      }
    `;

    expect(hasImport(code, "/virtual/Demo.tsx", packageNames)).toBe(true);
  });

  it("supports custom macro package names", () => {
    const code = dedent`
      import { msg } from "@acme/lingui-core";

      export const descriptor = msg\`Hello from a custom macro package.\`;
    `;

    expect(hasImport(code, "/virtual/custom.ts", ["@acme/lingui-core"])).toBe(
      true,
    );
  });

  it("falls back to the import block when later syntax is unsupported", () => {
    const code = dedent`
      import { msg } from "@lingui/core/macro";

      type User = { name: string };
      export const descriptor = msg\`Hello from Flow.\`;
    `;

    expect(hasImport(code, "/virtual/flow.js", ["@lingui/core/macro"])).toBe(
      true,
    );
  });

  it("returns false when no Lingui macro import exists", () => {
    expect(
      hasImport(
        'export const value = "plain";',
        "/virtual/plain.ts",
        packageNames,
      ),
    ).toBe(false);
  });

  it("ignores string literals that only mention a macro package", () => {
    expect(
      hasImport(
        'export const note = "import { msg } from \\"@lingui/core/macro\\"";',
        "/virtual/string-literal.ts",
        packageNames,
      ),
    ).toBe(false);
  });
});
