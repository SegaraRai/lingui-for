import dedent from "dedent";
import { describe, expect, it } from "vitest";

import {
  createExtractionUnits,
  transformJavaScriptMacros,
  transformSvelte,
} from "./transform.ts";

describe("transformJavaScriptMacros", () => {
  it("keeps .svelte.ts eager translations on Lingui core semantics", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { t } from "lingui-for-svelte/macro";

        // .svelte.ts cannot use store auto-subscriptions, so bare t keeps
        // the same eager semantics as @lingui/core.
        const name = "Ada";
        const label = t\`Hello \${name}\`;
      `,
      { filename: "/virtual/state.svelte.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toMatchInlineSnapshot(`
      "// .svelte.ts cannot use store auto-subscriptions, so bare t keeps
      // the same eager semantics as @lingui/core.
      import { i18n as _i18n } from "@lingui/core";
      const name = "Ada";
      const label = _i18n._(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      });"
    `);
  });

  it("rewrites bare t through the official Lingui transform", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { t } from "lingui-for-svelte/macro";

        const label = t({ message: "Save" });
      `,
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const label = _i18n._(
      /*i18n*/
      {
        id: "tfDRzk",
        message: "Save"
      });"
    `);
  });

  it("msg tagged templates lower to descriptors and retain captured values", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { msg } from "lingui-for-svelte/macro";

        const name = "Ada";
        const message = msg\`Hello \${name}\`;
      `,
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toMatchInlineSnapshot(`
      "const name = "Ada";
      const message =
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      };"
    `);
  });

  it("plural, select, and selectOrdinal lower eagerly when used standalone", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import {
          plural,
          select,
          selectOrdinal,
        } from "lingui-for-svelte/macro";

        const count = 2;
        const gender = "female";

        const books = plural(count, {
          one: "# Book",
          other: "# Books",
        });

        const pronoun = select(gender, {
          female: "she",
          other: "they",
        });

        const ordinal = selectOrdinal(count, {
          one: "#st",
          two: "#nd",
          few: "#rd",
          other: "#th",
        });
      `,
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const count = 2;
      const gender = "female";
      const books = _i18n._(
      /*i18n*/
      {
        id: "V/M0Vc",
        message: "{count, plural, one {# Book} other {# Books}}",
        values: {
          count: count
        }
      });
      const pronoun = _i18n._(
      /*i18n*/
      {
        id: "BGY2VE",
        message: "{gender, select, female {she} other {they}}",
        values: {
          gender: gender
        }
      });
      const ordinal = _i18n._(
      /*i18n*/
      {
        id: "Q9Q8Bj",
        message: "{count, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
        values: {
          count: count
        }
      });"
    `);
  });

  it("msg descriptors compose with nested plural/select macros", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { msg, plural, select } from "lingui-for-svelte/macro";

        const count = 2;
        const name = "Ada";
        const gender = "female";

        const message = msg({
          id: "demo.summary",
          message: plural(count, {
            one: \`\${select(gender, {
              female: "She",
              other: "They",
            })} has # task for \${name}\`,
            other: \`\${select(gender, {
              female: "She",
              other: "They",
            })} has # tasks for \${name}\`,
          }),
        });
      `,
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toMatchInlineSnapshot(`
      "const count = 2;
      const name = "Ada";
      const gender = "female";
      const message =
      /*i18n*/
      {
        id: "demo.summary",
        message: "{count, plural, one {{gender, select, female {She} other {They}} has # task for {name}} other {{gender, select, female {She} other {They}} has # tasks for {name}}}",
        values: {
          count: count,
          gender: gender,
          name: name
        }
      };"
    `);
  });

  it("returns null when no lingui-for-svelte macro import is present", () => {
    expect(
      transformJavaScriptMacros("const value = 1;", {
        filename: "/virtual/file.ts",
      }),
    ).toBeNull();
  });
});

describe("transformSvelte", () => {
  it("keeps msg descriptors pure inside user-authored $derived", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { msg } from "lingui-for-svelte/macro";

          let name = $state("Ada");
          const message = $derived(msg\`Hello \${name}\`);
        </script>

        <p>{$message.message}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">let name = $state("Ada");
      const message = $derived(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      });</script>

      <p>{$message.message}</p>"
    `);
  });

  it("rewrites bare t in script and $t in markup through separate runtime paths", () => {
    const source = dedent`
      <script lang="ts">
        import { msg, t } from "lingui-for-svelte/macro";

        const heading = msg({ id: "demo.heading", message: "Hello" });
        const label = t({ message: "Save" });
      </script>

      <h1>{$t(heading)}</h1>
      <p>{label}</p>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
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

      <h1>{$__l4s_translate(heading)}</h1>
      <p>{label}</p>"
    `);
  });

  it("auto-derives $t inside script initializers", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let name = $state("Ada");
          const label = $t\`Hello \${name}\`;
        </script>

        <p>{label}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      let name = $state("Ada");
      const label = $derived($__l4s_translate(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      }));</script>

      <p>{label}</p>"
    `);
  });

  it("auto-derives $t in script while leaving bare t eager", () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";

        let name = $state("Ada");
        const eager = t\`Tagged eager in script for \${name}\`;
        const reactive = $t\`Tagged reactive in script for \${name}\`;
      </script>

      <p>{eager}</p>
      <p>{reactive}</p>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      let name = $state("Ada");
      const eager = _i18n._(
      /*i18n*/
      {
        id: "hhBkx1",
        message: "Tagged eager in script for {name}",
        values: {
          name: name
        }
      });
      const reactive = $derived($__l4s_translate(
      /*i18n*/
      {
        id: "ZKsO3J",
        message: "Tagged reactive in script for {name}",
        values: {
          name: name
        }
      }));</script>

      <p>{eager}</p>
      <p>{reactive}</p>"
    `);
  });

  it("rewrites $t markup expressions to runtime reactive translations", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let name = $state("Ada");
        </script>

        <p>{$t\`Hello \${name}\`}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      let name = $state("Ada");</script>

      <p>{$__l4s_translate(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      })}</p>"
    `);
  });

  it("treats $plural, $select, and $selectOrdinal as reactive string macros", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { plural, select, selectOrdinal } from "lingui-for-svelte/macro";

          let count = $state(2);
          let gender = $state("female");
        </script>

        <p>{$plural(count, { one: "# Book", other: "# Books" })}</p>
        <p>{$select(gender, { female: "she", other: "they" })}</p>
        <p>{$selectOrdinal(count, { one: "#st", other: "#th" })}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("const __l4s_translate = __l4s_ctx._;");
    expect(result.code).toContain("<p>{$__l4s_translate(");
    expect(result.code).toContain(
      'message: "{count, plural, one {# Book} other {# Books}}"',
    );
    expect(result.code).toContain(
      'message: "{gender, select, female {she} other {they}}"',
    );
    expect(result.code).toContain(
      'message: "{count, selectordinal, one {#st} other {#th}}"',
    );
  });

  it("injects a script block for markup-only components", () => {
    const source = dedent`
      <p>{$t\`Hello from markup-only component\`}</p>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toMatchInlineSnapshot(`
      "<script>
      import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      </script>

      <p>{$__l4s_translate(
      /*i18n*/
      {
        id: "PVyl3J",
        message: "Hello from markup-only component"
      })}</p>"
    `);
  });

  it("avoids collisions when injecting hidden Lingui bindings", () => {
    const source = dedent`
      <script lang="ts">
        import { t } from "lingui-for-svelte/macro";

        const getLinguiContext = "occupied";
        const __l4s_ctx = "occupied";
        const __l4s_i18n = "occupied";
        const __l4s_translate = "occupied";
      </script>

      <p>{$t\`Hello\`}</p>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain(
      'import { getLinguiContext as getLinguiContext_1 } from "lingui-for-svelte/runtime";',
    );
    expect(result.code).toContain("const __l4s_ctx_1 = getLinguiContext_1();");
    expect(result.code).toContain("const __l4s_i18n_1 = __l4s_ctx_1.i18n;");
    expect(result.code).toContain("const __l4s_translate_1 = __l4s_ctx_1._;");
    expect(result.code).toContain("<p>{$__l4s_translate_1(");
  });
});

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

    expect(units.length).toBeGreaterThan(0);
    expect(units[0]?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const __lingui_svelte_expr_0 = _i18n._(
      /*i18n*/
      {
        id: "demo.save",
        message: "Save"
      });"
    `);
  });

  it("extracts markup-only components by synthesizing a script import", () => {
    const source = dedent`
      <button>{$t\`Extract from markup-only component\`}</button>
    `;

    const units = createExtractionUnits(source, {
      filename: "/virtual/App.svelte",
    });

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const __lingui_svelte_expr_0 = _i18n._(
      /*i18n*/
      {
        id: "T592ov",
        message: "Extract from markup-only component"
      });"
    `);
  });
});
