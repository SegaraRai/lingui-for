import dedent from "dedent";
import { describe, expect, it } from "vitest";

import {
  createExtractionUnits,
  transformJavaScriptMacros,
  transformSvelte,
} from "./index.ts";

describe("transformJavaScriptMacros", () => {
  it("rewrites t.raw through the official Lingui transform", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { t } from "lingui-svelte/macro";

        const label = t.raw({ message: "Save" });
      `,
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "lingui-svelte/runtime";
      const label = _i18n._(
      /*i18n*/
      {
        id: "tfDRzk",
        message: "Save"
      });"
    `);
  });

  it("rewrites tagged template literals from t.raw through the official Lingui transform", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { msg, t } from "lingui-svelte/macro";

        const name = "Ada";
        const descriptor = msg\`Tagged descriptor\`;
        const label = t.raw\`Tagged label\`;
        const greeting = msg\`Hello \${name}\`;
        const namedLabel = t.raw\`Named \${name}\`;
      `,
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "lingui-svelte/runtime";
      const name = "Ada";
      const descriptor =
      /*i18n*/
      {
        id: "lEukqL",
        message: "Tagged descriptor"
      };
      const label = _i18n._(
      /*i18n*/
      {
        id: "iUtpV1",
        message: "Tagged label"
      });
      const greeting =
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      };
      const namedLabel = _i18n._(
      /*i18n*/
      {
        id: "D4Jawe",
        message: "Named {name}",
        values: {
          name: name
        }
      });"
    `);
  });

  it("returns null when no lingui-svelte macro import is present", () => {
    expect(
      transformJavaScriptMacros("const value = 1;", {
        filename: "/virtual/file.ts",
      }),
    ).toBeNull();
  });
});

describe("transformSvelte", () => {
  it("rewrites script raw translations and markup store translations", () => {
    const source = dedent`
      <script lang="ts">
        import { msg, t } from "lingui-svelte/macro";

        const heading = msg({ id: "demo.heading", message: "Hello" });
        const label = t.raw({ message: "Save" });
      </script>

      <h1>{$t(heading)}</h1>
      <p>{label}</p>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { i18n as _i18n, t } from "lingui-svelte/runtime";
      const heading =
      /*i18n*/
      {
        id: "demo.heading",
        message: "Hello"
      };
      const label = _i18n._(
      /*i18n*/
      {
        id: "tfDRzk",
        message: "Save"
      });</script>

      <h1>{$t(heading)}</h1>
      <p>{label}</p>"
    `);
  });

  it("rewrites tagged template literals in script and markup expressions", () => {
    const source = dedent`
      <script lang="ts">
        import { msg, t } from "lingui-svelte/macro";
        const count = 2;
        const name = "Ada";
        const descriptor = msg\`Tagged descriptor in script\`;
        const eager = t.raw\`Tagged raw in script\`;
        const summary = msg({ message: "{count, plural, one {# task for {name}} other {# tasks for {name}}}" });
      </script>

      <p>{summary.message}</p>
      <p>{$t\`Hello \${name}\`}</p>
      <p>{$t\`Tagged literal in markup\`}</p>
      <p>{descriptor.message}</p>
      <p>{eager}</p>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { i18n as _i18n, t } from "lingui-svelte/runtime";
      const count = 2;
      const name = "Ada";
      const descriptor =
      /*i18n*/
      {
        id: "84tj+7",
        message: "Tagged descriptor in script"
      };
      const eager = _i18n._(
      /*i18n*/
      {
        id: "jeNeAe",
        message: "Tagged raw in script"
      });
      const summary =
      /*i18n*/
      {
        id: "60RTms",
        message: "{count, plural, one {# task for {name}} other {# tasks for {name}}}"
      };</script>

      <p>{summary.message}</p>
      <p>{$t(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      })}</p>
      <p>{$t(
      /*i18n*/
      {
        id: "eX1B4l",
        message: "Tagged literal in markup"
      })}</p>
      <p>{descriptor.message}</p>
      <p>{eager}</p>"
    `);
  });

  it("integrates with svelte reactivity", () => {
    const source = dedent`
      <script lang="ts">
        import { msg, t } from "lingui-svelte/macro";

        let count = $state(2);
        let name = $state("Ada");

        const greeting = $derived(msg\`Hello \${name}\`);
        const eager = t.raw\`Non-reactive greeting for \${name}\`;
        const summary = $plural(count, {
          one: "One task for {name}",
          other: "{count} tasks for {name}",
        });
      </script>

      <p>{$greeting}</p>
      <p>{eager}</p>
      <p>{summary}</p>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { i18n as _i18n } from "lingui-svelte/runtime";
      let count = $state(2);
      let name = $state("Ada");
      const greeting = $derived(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      });
      const eager = _i18n._(
      /*i18n*/
      {
        id: "1mooKc",
        message: "Non-reactive greeting for {name}",
        values: {
          name: name
        }
      });
      const summary = $plural(count, {
        one: "One task for {name}",
        other: "{count} tasks for {name}"
      });</script>

      <p>{$greeting}</p>
      <p>{eager}</p>
      <p>{summary}</p>"
    `);
  });
});

describe("createExtractionUnits", () => {
  it("produces macro-transformed extraction code for svelte files", () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-svelte/macro";
      </script>

      <button>{$t({ id: "demo.save", message: "Save" })}</button>
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units.length).toBeGreaterThan(0);
    expect(units[0]?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "lingui-svelte/runtime";
      const __lingui_svelte_expr_0 = _i18n._(
      /*i18n*/
      {
        id: "demo.save",
        message: "Save"
      });"
    `);
  });

  it("includes tagged template literals in extraction output", () => {
    const source = dedent`
      <script lang="ts">
        import { msg, t } from "lingui-svelte/macro";
        const count = 2;
        const name = "Ada";
        const descriptor = msg\`Tagged extraction descriptor\`;
        const summary = msg({ message: "{count, plural, one {# task for {name}} other {# tasks for {name}}}" });
      </script>

      <p>{summary.message}</p>
      <button>{$t\`Hello \${name}\`}</button>
      <button>{$t\`Tagged extraction button\`}</button>
      <p>{descriptor.message}</p>
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units.length).toBeGreaterThan(0);
    expect(units[0]?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "lingui-svelte/runtime";
      const count = 2;
      const name = "Ada";
      const descriptor =
      /*i18n*/
      {
        id: "C6Bf1f",
        message: "Tagged extraction descriptor"
      };
      const summary =
      /*i18n*/
      {
        id: "60RTms",
        message: "{count, plural, one {# task for {name}} other {# tasks for {name}}}"
      };
      const __lingui_svelte_expr_0 = summary.message;
      const __lingui_svelte_expr_1 = _i18n._(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      });
      const __lingui_svelte_expr_2 = _i18n._(
      /*i18n*/
      {
        id: "9Hqhpl",
        message: "Tagged extraction button"
      });
      const __lingui_svelte_expr_3 = descriptor.message;"
    `);
  });
});
