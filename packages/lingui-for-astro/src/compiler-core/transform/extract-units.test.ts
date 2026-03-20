import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";

import { createAstroExtractionUnits } from "./extract-units.ts";

describe("createAstroExtractionUnits", () => {
  it("extracts imported alias template expressions", () => {
    const source = dedent`
      ---
      import { t as translate } from "lingui-for-astro/macro";
      ---

      <button>{translate\`Extract me\`}</button>
    `;

    const units = createAstroExtractionUnits(source, {
      filename: "/virtual/Page.astro",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.code).toContain("_i18n._(");
    expect(units[0]?.code).toContain('message: "Extract me"');
  });

  it("extracts component macros through synthetic RuntimeTrans declarations", () => {
    const source = dedent`
      ---
      import { Trans } from "lingui-for-astro/macro";
      const name = "Ada";
      ---

      <Trans>Read the <a href="/docs">docs</a>, {name}.</Trans>
    `;

    const units = createAstroExtractionUnits(source, {
      filename: "/virtual/Page.astro",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.code).toContain("RuntimeTrans as _Trans");
    expect(units[0]?.code).toContain(
      'message: "Read the <0>docs</0>, {name}."',
    );
    expect(units[0]?.code).toContain("components");
  });

  it("ignores nested object literal fragments inside multiline format macros", () => {
    const source = dedent`
      ---
      import { plural } from "lingui-for-astro/macro";
      ---

      <p>
        {plural(3, {
          one: "# entry",
          other: "# entries",
        })}
      </p>
    `;

    const units = createAstroExtractionUnits(source, {
      filename: "/virtual/Page.astro",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.code).toContain("plural");
    expect(units[0]?.code).not.toContain("const __expr = (");
  });
});
