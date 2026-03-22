import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { createAstroExtractionUnits } from "./extract-units.ts";

describe("createAstroExtractionUnits", () => {
  test("extracts imported alias template expressions", () => {
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
    expect(units[0]?.code).toContain("translate`Extract me`");
    expect(units[0]?.map).toBeTruthy();
  });

  test("extracts component macros through synthetic RuntimeTrans declarations", () => {
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
    // Component macros use Plan A lowering (transformProgram with extract:true).
    // The Lingui macro plugin transforms <Trans> into a lowered form with a
    // /*i18n*/ descriptor comment. A source map is produced for origin tracking.
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.map).toBeTruthy();
  });

  test("ignores nested object literal fragments inside multiline format macros", () => {
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
    expect(units[0]?.code).toContain("plural(3");
    expect(units[0]?.map).toBeTruthy();
  });

  test("does not emit nested component extraction units inside Trans", () => {
    const source = dedent`
      ---
      import { Plural, Trans } from "lingui-for-astro/macro";
      const count = 0;
      ---

      <Trans>
        You have{" "}
        <strong>
          <Plural
            value={count}
            _0="no unread messages"
            one="# unread message"
            other="# unread messages"
          />
        </strong>.
      </Trans>
    `;

    const units = createAstroExtractionUnits(source, {
      filename: "/virtual/trans-with-plural.astro",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.map).toBeTruthy();
  });
});
