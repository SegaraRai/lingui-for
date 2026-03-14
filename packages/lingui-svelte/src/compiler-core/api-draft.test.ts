import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { transformJavaScriptMacros, transformSvelte } from "./index.ts";

describe("draft macro api: core semantics", () => {
  it("keeps .svelte.ts eager translations on Lingui core semantics", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { t } from "lingui-svelte/macro";

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

  it("t tagged templates lower to eager translations with captured values", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { t } from "lingui-svelte/macro";

        const name = "Ada";
        const label = t\`Hello \${name}\`;
      `,
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
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

  it("msg tagged templates lower to descriptors and retain captured values", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { msg } from "lingui-svelte/macro";

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
        } from "lingui-svelte/macro";

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
        import { msg, plural, select } from "lingui-svelte/macro";

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
});

describe("draft macro api: svelte usage", () => {
  it("keeps msg descriptors pure inside user-authored $derived", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { msg } from "lingui-svelte/macro";

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

  it("rewrites $t markup expressions to runtime reactive translations", () => {
    const result = transformSvelte(
      dedent`
        <script lang="ts">
          import { t } from "lingui-svelte/macro";

          let name = $state("Ada");
        </script>

        <p>{$t\`Hello \${name}\`}</p>
      `,
      { filename: "/virtual/App.svelte" },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "<script lang="ts">import { getLinguiContext as getLinguiContext } from "lingui-svelte/runtime";
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
          import { plural, select, selectOrdinal } from "lingui-svelte/macro";

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
    expect(result.code).toContain('message: "{count, plural, one {# Book} other {# Books}}"');
    expect(result.code).toContain('message: "{gender, select, female {she} other {they}}"');
    expect(result.code).toContain(
      'message: "{count, selectordinal, one {#st} other {#th}}"',
    );
  });
});
