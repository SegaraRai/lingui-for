import dedent from "dedent";
import { describe, expect, it } from "vitest";

import {
  expressionUsesMacroBinding,
  parseMacroBindings,
} from "./macro-bindings.ts";

describe("macro-bindings", () => {
  it("collects imported locals including aliases", () => {
    const bindings = parseMacroBindings(
      dedent`
        import {
          Select as Choice,
          t as translate,
          plural as choosePlural,
        } from "lingui-for-svelte/macro";
      `,
      "ts",
    );

    expect(bindings.all).toEqual(
      new Set(["Choice", "translate", "choosePlural"]),
    );
    expect(bindings.components).toEqual(new Set(["Choice"]));
    expect(bindings.reactiveStrings).toEqual(
      new Set(["translate", "choosePlural"]),
    );
  });

  it("detects imported and aliased macro usages inside expressions", () => {
    const bindings = parseMacroBindings(
      dedent`
        import { t as translate, plural as choosePlural } from "lingui-for-svelte/macro";
      `,
      "ts",
    );

    expect(expressionUsesMacroBinding("translate`Hello`", "ts", bindings)).toBe(
      true,
    );
    expect(
      expressionUsesMacroBinding(
        '$choosePlural(count, { one: "#", other: "##" })',
        "ts",
        bindings,
      ),
    ).toBe(true);
    expect(
      expressionUsesMacroBinding('translateText("Hello")', "ts", bindings),
    ).toBe(false);
  });

  it("does not treat same-name locals as macro bindings without imports", () => {
    const bindings = parseMacroBindings("const t = () => 'Hello';", "ts");

    expect(expressionUsesMacroBinding("t`Hello`", "ts", bindings)).toBe(false);
    expect(expressionUsesMacroBinding("$t`Hello`", "ts", bindings)).toBe(false);
  });

  it("does not treat shadowed imported locals as macro bindings", () => {
    const bindings = parseMacroBindings(
      'import { t as translate } from "lingui-for-svelte/macro";',
      "ts",
    );

    expect(
      expressionUsesMacroBinding(
        "(() => { const translate = notMacro; return translate`Hello`; })()",
        "ts",
        bindings,
      ),
    ).toBe(false);
  });

  it("does not treat shadowed reactive locals as macro bindings", () => {
    const bindings = parseMacroBindings(
      'import { t as translate } from "lingui-for-svelte/macro";',
      "ts",
    );

    expect(
      expressionUsesMacroBinding(
        "(() => { const $translate = custom; return $translate`Hello`; })()",
        "ts",
        bindings,
      ),
    ).toBe(false);
  });

  it("detects reactive aliases inside nested scopes when the base import is intact", () => {
    const bindings = parseMacroBindings(
      'import { t as translate } from "lingui-for-svelte/macro";',
      "ts",
    );

    expect(
      expressionUsesMacroBinding(
        "(() => () => $translate`Hello`)()",
        "ts",
        bindings,
      ),
    ).toBe(true);
  });
});
