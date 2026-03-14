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
    expect(result?.code).toContain("/*i18n*/");
    expect(result?.code).toContain("_i18n._(");
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
    expect(result?.code).toContain("/*i18n*/");
    expect(result?.code).toContain("_i18n._(");
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

  it("supports aliased JS macro imports", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { t as translate } from "lingui-for-svelte/macro";

        const label = translate({ message: "Save" });
      `,
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toContain("_i18n._(");
    expect(result?.code).toContain('message: "Save"');
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
    expect(result?.code).toContain("/*i18n*/");
    expect(result?.code).not.toContain("_i18n._(");
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
    expect(result?.code).toContain("/*i18n*/");
    expect(result?.code).toContain("_i18n._(");
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
    expect(result?.code).toContain("/*i18n*/");
    expect(result?.code).not.toContain("_i18n._(");
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

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("$__l4s_translate(");
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

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).not.toContain("_i18n._(");
    expect(result.code).toContain("$derived($__l4s_translate(");
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

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).toContain("_i18n._(");
    expect(result.code).toContain("$derived($__l4s_translate(");
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

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).not.toContain("_i18n._(");
    expect(result.code).toContain("$__l4s_translate(");
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

    expect(result.code).toContain("/*i18n*/");
    expect(result.code).not.toContain("_i18n._(");
    expect(result.code).toContain("$__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      let count = $state(2);
      let gender = $state("female");</script>

      <p>{$__l4s_translate(
      /*i18n*/
      {
        id: "V/M0Vc",
        message: "{count, plural, one {# Book} other {# Books}}",
        values: {
          count: count
        }
      })}</p>
      <p>{$__l4s_translate(
      /*i18n*/
      {
        id: "BGY2VE",
        message: "{gender, select, female {she} other {they}}",
        values: {
          gender: gender
        }
      })}</p>
      <p>{$__l4s_translate(
      /*i18n*/
      {
        id: "0ALwK4",
        message: "{count, selectordinal, one {#st} other {#th}}",
        values: {
          count: count
        }
      })}</p>"
    `);
  });

  it("lowers Trans with embedded elements to the runtime RuntimeTrans component", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";

          let name = $state("Ada");
        </script>

        <Trans id="demo.docs">Read the <a href="/docs">docs</a>, {name}.</Trans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("<L4sRuntimeTrans");
    expect(result.code).not.toContain("<Trans");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { RuntimeTrans as L4sRuntimeTrans } from "lingui-for-svelte/runtime";
      let name = $state("Ada");</script>

      <L4sRuntimeTrans {...{
        id: "demo.docs",
        message: "Read the <0>docs</0>, {name}.",
        values: {
          name: name
        },
        components: {
          0: {
            kind: "element",
            tag: "a",
            props: {
              href: "/docs"
            }
          }
        }
      }} />"
    `);
  });

  it("lowers Trans with nested embedded elements and components", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { Trans } from "lingui-for-svelte/macro";
          import DocLink from "./DocLink.svelte";

          let name = $state("Ada");
        </script>

        <Trans>Read <strong><DocLink href="/docs">{name}</DocLink></strong> carefully.</Trans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("<L4sRuntimeTrans");
    expect(result.code).not.toContain("<Trans");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { RuntimeTrans as L4sRuntimeTrans } from "lingui-for-svelte/runtime";
      import DocLink from "./DocLink.svelte";
      let name = $state("Ada");</script>

      <L4sRuntimeTrans {...{
        id: "N+nKUg",
        message: "Read <0><1>{name}</1></0> carefully.",
        values: {
          name: name
        },
        components: {
          0: {
            kind: "element",
            tag: "strong",
            props: {}
          },
          1: {
            kind: "component",
            component: DocLink,
            props: {
              href: "/docs"
            }
          }
        }
      }} />"
    `);
  });

  it("injects RuntimeTrans for imported alias component macros", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { Trans as LocalTrans } from "lingui-for-svelte/macro";
        </script>

        <LocalTrans id="demo.docs">Read the <a href="/docs">docs</a>.</LocalTrans>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("<L4sRuntimeTrans");
    expect(result.code).not.toContain("<Trans");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { RuntimeTrans as L4sRuntimeTrans } from "lingui-for-svelte/runtime";</script>

      <L4sRuntimeTrans {...{
        id: "demo.docs",
        message: "Read the <0>docs</0>.",
        components: {
          0: {
            kind: "element",
            tag: "a",
            props: {
              href: "/docs"
            }
          }
        }
      }} />"
    `);
  });

  it("lowers Plural, Select, and SelectOrdinal component macros to RuntimeTrans", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import {
            Plural,
            Select,
            SelectOrdinal,
          } from "lingui-for-svelte/macro";

          let count = $state(2);
          let gender = $state("female");
        </script>

        <Plural value={count} one="# Book" other="# Books" />
        <Select value={gender} _female="she" other="they" />
        <SelectOrdinal value={count} one="#st" other="#th" />
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("<L4sRuntimeTrans");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { RuntimeTrans as L4sRuntimeTrans } from "lingui-for-svelte/runtime";
      let count = $state(2);
      let gender = $state("female");</script>

      <L4sRuntimeTrans {...{
        id: "V/M0Vc",
        message: "{count, plural, one {# Book} other {# Books}}",
        values: {
          count: count
        }
      }} />
      <L4sRuntimeTrans {...{
        id: "BGY2VE",
        message: "{gender, select, female {she} other {they}}",
        values: {
          gender: gender
        }
      }} />
      <L4sRuntimeTrans {...{
        id: "0ALwK4",
        message: "{count, selectordinal, one {#st} other {#th}}",
        values: {
          count: count
        }
      }} />"
    `);
  });

  it("does not activate markup macros without a macro import", () => {
    const source = dedent`
      <p>{$t\`Hello from markup-only component\`}</p>
      <Trans id="demo.docs">Read the docs.</Trans>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).not.toContain("getLinguiContext");
    expect(result.code).not.toContain("RuntimeTrans");
    expect(result.code).toBe(source.trim());
  });

  it("does not activate same-name components imported from other modules", () => {
    const source = dedent`
      <script lang="ts">
        import Trans from "./Trans.svelte";
      </script>

      <Trans id="demo.docs">Read the docs.</Trans>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).not.toContain("RuntimeTrans");
    expect(result.code).toContain('import Trans from "./Trans.svelte";');
    expect(result.code).toContain(
      '<Trans id="demo.docs">Read the docs.</Trans>',
    );
  });

  it("injects a script block for imported markup-only expressions", () => {
    const source = dedent`
      <script>
        import { t as translate } from "lingui-for-svelte/macro";
      </script>

      <p>{$translate\`Hello from markup-only component\`}</p>
    `;

    const result = transformSvelte(source, {
      filename: "/virtual/App.svelte",
    });

    expect(result.code).toContain("getLinguiContext");
    expect(result.code).toContain("$__l4s_translate");
    expect(result.code).toMatchInlineSnapshot(`
      "<script>import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";</script>

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

    expect(result.code).toContain("const __l4s_ctx_1 =");
    expect(result.code).toContain("const __l4s_i18n_1 =");
    expect(result.code).toContain("const __l4s_translate_1 =");
    expect(result.code).toContain("$__l4s_translate_1(");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext_1 } from "lingui-for-svelte/runtime";
      const __l4s_ctx_1 = getLinguiContext_1();
      const __l4s_i18n_1 = __l4s_ctx_1.i18n;
      const __l4s_translate_1 = __l4s_ctx_1._;
      import { i18n as _i18n } from "@lingui/core";
      const getLinguiContext = "occupied";
      const __l4s_ctx = "occupied";
      const __l4s_i18n = "occupied";
      const __l4s_translate = "occupied";</script>

      <p>{$__l4s_translate_1(
      /*i18n*/
      {
        id: "uzTaYi",
        message: "Hello"
      })}</p>"
    `);
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

    expect(units).toHaveLength(1);
    expect(units[0]?.code).toContain("/*i18n*/");
    expect(units[0]?.code).toContain("_i18n._(");
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
      const __lingui_svelte_expr_0 = _i18n._(
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
      const __lingui_svelte_component_0 = <_Trans {...
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
      const __lingui_svelte_component_0 = <_Trans {...
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
      const __lingui_svelte_component_0 = <_Trans {...
      /*i18n*/
      {
        id: "V/M0Vc",
        message: "{count, plural, one {# Book} other {# Books}}",
        values: {
          count: count
        }
      }} />;
      const __lingui_svelte_component_1 = <_Trans {...
      /*i18n*/
      {
        id: "BGY2VE",
        message: "{gender, select, female {she} other {they}}",
        values: {
          gender: gender
        }
      }} />;
      const __lingui_svelte_component_2 = <_Trans {...
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
