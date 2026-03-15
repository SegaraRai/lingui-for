import { describe, expect, it } from "vitest";

import { transformJavaScriptMacros } from "./transform-javascript.ts";

describe("transformJavaScriptMacros", () => {
  it("rewrites official Lingui core macros in TSX files", () => {
    const result = transformJavaScriptMacros(
      [
        'import { msg } from "@lingui/core/macro";',
        "const greeting = msg`Hello from React`;",
      ].join("\n"),
      {
        filename: "/virtual/Widget.tsx",
      },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toContain("/*i18n*/");
    expect(result?.code).toContain('message: "Hello from React"');
    expect(result?.code).not.toContain("@lingui/core/macro");
  });

  it("keeps React Trans macros on the React runtime in TSX files", () => {
    const result = transformJavaScriptMacros(
      [
        'import { Trans } from "@lingui/react/macro";',
        "export function Widget() {",
        "  return <Trans>Hello from React rich text.</Trans>;",
        "}",
      ].join("\n"),
      {
        filename: "/virtual/Widget.tsx",
      },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toContain('from "@lingui/react"');
    expect(result?.code).not.toContain("lingui-for-astro/runtime");
    expect(result?.code).toContain('id: "');
  });

  it("skips unrelated source files", () => {
    expect(
      transformJavaScriptMacros('const label = "plain text";', {
        filename: "/virtual/plain.ts",
      }),
    ).toBeNull();
  });
});
