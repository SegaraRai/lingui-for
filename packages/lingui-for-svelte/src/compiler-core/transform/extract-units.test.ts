import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { createExtractionUnits } from "./extract-units.ts";

describe("createExtractionUnits", () => {
  it("produces macro-transformed extraction code for svelte files", () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";
      </script>

      <button>{$t({ id: "demo.save", message: "Save" })}</button>
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.code).toContain("_i18n._(");
    expect(units[0]?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const __lingui_for_svelte_expr_0 = _i18n._(
      /*i18n*/
      {
        id: "demo.save",
        message: "Save"
      });"
    `);
  });

  it("does not extract markup macros when the macro import is missing", () => {
    const source = dedent`
      <button>{$t\`Extract from markup-only component\`}</button>
      <Select value={"female"} _female="she" other="they" />
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units).toEqual([]);
  });

  it("extracts imported alias markup expressions", () => {
    const source = dedent`
      <script lang="ts">
        import { t as translate } from "lingui-for-svelte/macro";
      </script>

      <button>{$translate\`Extract from markup-only component\`}</button>
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.code).toContain("_i18n._(");
    expect(units[0]?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const __lingui_for_svelte_expr_0 = _i18n._(
      /*i18n*/
      {
        id: "T592ov",
        message: "Extract from markup-only component"
      });"
    `);
  });

  it("includes Trans component macros in extraction output", () => {
    const source = dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";
        let name = "Ada";
      </script>

      <Trans id="demo.docs">Read the <a href="/docs">docs</a>, {name}.</Trans>
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.code).toContain("<_Trans ");
    expect(units[0]?.code).toMatchInlineSnapshot(`
      "import { RuntimeTrans as _Trans } from "lingui-for-svelte/runtime";
      let name = "Ada";
      const __lingui_for_svelte_component_0 = <_Trans {...
      /*i18n*/
      {
        id: "demo.docs",
        message: "Read the <0>docs</0>, {name}.",
        values: {
          name: name
        },
        components: {
          0: <a href="/docs" />
        }
      }} />;"
    `);
  });

  it("includes nested rich-text components in extraction output", () => {
    const source = dedent`
      <script lang="ts">
        import { Trans } from "lingui-for-svelte/macro";
        import DocLink from "./DocLink.svelte";

        let name = "Ada";
      </script>

      <Trans>Read <strong><DocLink href="/docs">{name}</DocLink></strong> carefully.</Trans>
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.code).toContain("<_Trans ");
    expect(units[0]?.code).toMatchInlineSnapshot(`
      "import { RuntimeTrans as _Trans } from "lingui-for-svelte/runtime";
      import DocLink from "./DocLink.svelte";
      let name = "Ada";
      const __lingui_for_svelte_component_0 = <_Trans {...
      /*i18n*/
      {
        id: "N+nKUg",
        message: "Read <0><1>{name}</1></0> carefully.",
        values: {
          name: name
        },
        components: {
          0: <strong />,
          1: <DocLink href="/docs" />
        }
      }} />;"
    `);
  });

  it("includes Plural, Select, and SelectOrdinal component macros in extraction output", () => {
    const source = dedent`
      <script lang="ts">
        import {
          Plural,
          Select as Choice,
          SelectOrdinal,
        } from "lingui-for-svelte/macro";
        let count = 2;
        let gender = "female";
      </script>

      <Plural value={count} one="# Book" other="# Books" />
      <Choice value={gender} _female="she" other="they" />
      <SelectOrdinal value={count} one="#st" other="#th" />
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.code).toContain("<_Trans ");
    expect(units[0]?.code).toMatchInlineSnapshot(`
      "import { RuntimeTrans as _Trans } from "lingui-for-svelte/runtime";
      let count = 2;
      let gender = "female";
      const __lingui_for_svelte_component_0 = <_Trans {...
      /*i18n*/
      {
        id: "V/M0Vc",
        message: "{count, plural, one {# Book} other {# Books}}",
        values: {
          count: count
        }
      }} />;
      const __lingui_for_svelte_component_1 = <_Trans {...
      /*i18n*/
      {
        id: "BGY2VE",
        message: "{gender, select, female {she} other {they}}",
        values: {
          gender: gender
        }
      }} />;
      const __lingui_for_svelte_component_2 = <_Trans {...
      /*i18n*/
      {
        id: "0ALwK4",
        message: "{count, selectordinal, one {#st} other {#th}}",
        values: {
          count: count
        }
      }} />;"
    `);
  });
});
