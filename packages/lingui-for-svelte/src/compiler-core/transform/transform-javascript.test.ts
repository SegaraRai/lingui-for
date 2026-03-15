import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { transformJavaScriptMacros } from "./transform-javascript.ts";

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

  it("returns null for same-name imports from non-macro modules", () => {
    expect(
      transformJavaScriptMacros(
        dedent`
          import { t } from "./macro";

          const label = t\`Hello\`;
        `,
        { filename: "/virtual/file.ts" },
      ),
    ).toBeNull();
  });

  it("does not rewrite shadowed aliases that no longer point at the macro import", () => {
    const result = transformJavaScriptMacros(
      dedent`
        import { t as translate } from "lingui-for-svelte/macro";

        const outer = translate\`Outer\`;

        function render() {
          const translate = notMacro;
          return translate\`Inner\`;
        }
      `,
      { filename: "/virtual/file.ts" },
    );

    expect(result).not.toBeNull();
    expect(result?.code).toContain('message: "Outer"');
    expect(result?.code).toContain("return translate`Inner`;");
    expect(result?.code).not.toContain('message: "Inner"');
    expect(result?.code).toMatchInlineSnapshot(`
      "import { i18n as _i18n } from "@lingui/core";
      const outer = _i18n._(
      /*i18n*/
      {
        id: "wVGQ6j",
        message: "Outer"
      });
      function render() {
        const translate = notMacro;
        return translate\`Inner\`;
      }"
    `);
  });
});
