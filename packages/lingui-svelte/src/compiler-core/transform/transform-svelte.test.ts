import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { transformSvelte } from "./transform-svelte.ts";

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

  it("wraps $t inside $derived.by callbacks with another derived translator read", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let name = $state("Ada");
          const label = $derived.by(() => $t\`Hello \${name}\`);
        </script>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("$derived.by(() => $__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      let name = $state("Ada");
      const label = $derived.by(() => $__l4s_translate(
      /*i18n*/
      {
        id: "OVaF9k",
        message: "Hello {name}",
        values: {
          name: name
        }
      }));</script>"
    `);
  });

  it("keeps $t inside ordinary function branches as direct translator reads", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let state = $state("idle");

          function getStatusText() {
            return state === "idle" ? $t\`idle\` : $t\`active\`;
          }
        </script>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain('return state === "idle" ? $__l4s_translate(');
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      let state = $state("idle");
      function getStatusText() {
        return state === "idle" ? $__l4s_translate(
        /*i18n*/
        {
          id: "oBVc6R",
          message: "idle"
        }) : $__l4s_translate(
        /*i18n*/
        {
          id: "s/ereB",
          message: "active"
        });
      }</script>"
    `);
  });

  it("keeps reactive plural/select macros inside callback-based derived runes as direct translator reads", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { plural, select } from "lingui-for-svelte/macro";

          let count = $state(2);
          let gender = $state("female");

          const status = $derived.by(() => ({
            books: $plural(count, { one: "# Book", other: "# Books" }),
            pronoun: $select(gender, { female: "she", other: "they" }),
          }));
        </script>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("books: $__l4s_translate(");
    expect(result.code).toContain("pronoun: $__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      let count = $state(2);
      let gender = $state("female");
      const status = $derived.by(() => ({
        books: $__l4s_translate(
        /*i18n*/
        {
          id: "V/M0Vc",
          message: "{count, plural, one {# Book} other {# Books}}",
          values: {
            count: count
          }
        }),
        pronoun: $__l4s_translate(
        /*i18n*/
        {
          id: "BGY2VE",
          message: "{gender, select, female {she} other {they}}",
          values: {
            gender: gender
          }
        })
      }));</script>"
    `);
  });

  it("wraps top-level ternary initializers containing reactive translations once", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          let state = $state("idle");
          const label = state === "idle" ? $t\`idle\` : $t\`active\`;
        </script>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain('const label = $derived(state === "idle" ? $__l4s_translate(');
    expect(result.code).not.toContain("$derived($__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      let state = $state("idle");
      const label = $derived(state === "idle" ? $__l4s_translate(
      /*i18n*/
      {
        id: "oBVc6R",
        message: "idle"
      }) : $__l4s_translate(
      /*i18n*/
      {
        id: "s/ereB",
        message: "active"
      }));</script>"
    `);
  });

  it("wraps top-level object initializers containing reactive translations once", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { t, plural } from "lingui-for-svelte/macro";

          let count = $state(2);
          const labels = {
            state: $t\`idle\`,
            books: $plural(count, { one: "# Book", other: "# Books" }),
          };
        </script>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toContain("const labels = $derived({");
    expect(result.code).not.toContain("state: $derived(");
    expect(result.code).not.toContain("books: $derived(");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      let count = $state(2);
      const labels = $derived({
        state: $__l4s_translate(
        /*i18n*/
        {
          id: "oBVc6R",
          message: "idle"
        }),
        books: $__l4s_translate(
        /*i18n*/
        {
          id: "V/M0Vc",
          message: "{count, plural, one {# Book} other {# Books}}",
          values: {
            count: count
          }
        })
      });</script>"
    `);
  });

  it("does not auto-wrap top-level function initializers that return reactive translations", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { t } from "lingui-for-svelte/macro";

          const getStatusText = () => $t\`idle\`;
        </script>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).not.toContain("const getStatusText = $derived(");
    expect(result.code).toContain("const getStatusText = () => $__l4s_translate(");
    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-for-svelte/runtime";
      const __l4s_ctx = getLinguiContext();
      const __l4s_i18n = __l4s_ctx.i18n;
      const __l4s_translate = __l4s_ctx._;
      import { i18n as _i18n } from "@lingui/core";
      const getStatusText = () => $__l4s_translate(
      /*i18n*/
      {
        id: "oBVc6R",
        message: "idle"
      });</script>"
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
