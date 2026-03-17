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
        } from "lingui-for-astro/macro";
      `,
    );

    expect(bindings.all).toEqual(
      new Set(["Choice", "translate", "choosePlural"]),
    );
    expect(bindings.components).toEqual(new Set(["Choice"]));
    expect(bindings.allImports).toEqual(
      new Map([
        ["Choice", "Select"],
        ["translate", "t"],
        ["choosePlural", "plural"],
      ]),
    );
  });

  it("detects imported and aliased macro usages inside expressions", () => {
    const bindings = parseMacroBindings(
      dedent`
        import { t as translate, plural as choosePlural } from "lingui-for-astro/macro";
      `,
    );

    expect(expressionUsesMacroBinding("translate`Hello`", bindings)).toBe(true);
    expect(
      expressionUsesMacroBinding(
        'choosePlural(count, { one: "#", other: "##" })',
        bindings,
      ),
    ).toBe(true);
    expect(expressionUsesMacroBinding('translateText("Hello")', bindings)).toBe(
      false,
    );
  });

  it("does not treat same-name locals as macro bindings without imports", () => {
    const bindings = parseMacroBindings("const t = () => 'Hello';");

    expect(expressionUsesMacroBinding("t`Hello`", bindings)).toBe(false);
  });

  it("does not treat shadowed imported locals as macro bindings", () => {
    const bindings = parseMacroBindings(
      'import { t as translate } from "lingui-for-astro/macro";',
    );

    expect(
      expressionUsesMacroBinding(
        "(() => { const translate = notMacro; return translate`Hello`; })()",
        bindings,
      ),
    ).toBe(false);
  });

  it("detects aliases inside nested scopes when the base import is intact", () => {
    const bindings = parseMacroBindings(
      'import { t as translate } from "lingui-for-astro/macro";',
    );

    expect(
      expressionUsesMacroBinding("(() => () => translate`Hello`)()", bindings),
    ).toBe(true);
  });
});
