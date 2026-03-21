import { parseSync } from "@babel/core";
import * as t from "@babel/types";
import { describe, expect, it } from "vite-plus/test";

import {
  collectMacroImportLocals,
  expressionUsesMacroBinding,
  parseMacroBindings,
} from "./macro-bindings.ts";

const parserPlugins = ["typescript", "jsx"] as const;

describe("macro bindings helpers", () => {
  it("collects macro import locals from a program", () => {
    const parsed = parseSync(
      'import { t as translate, Trans } from "lingui-for-test/macro";',
      {
        ast: true,
        babelrc: false,
        code: false,
        configFile: false,
        parserOpts: {
          sourceType: "module",
          plugins: [...parserPlugins],
        },
      },
    );

    if (!parsed || !t.isFile(parsed)) {
      throw new Error("Failed to parse fixture");
    }

    expect(
      collectMacroImportLocals(parsed.program, {
        macroPackage: "lingui-for-test/macro",
        importedNames: ["t", "Trans"] as const,
      }),
    ).toEqual(new Set(["translate", "Trans"]));
  });

  it("parses all macro and component bindings from source", () => {
    const bindings = parseMacroBindings(
      'import { t as translate, plural, Trans } from "lingui-for-test/macro";',
      {
        parserPlugins: [...parserPlugins],
        macroPackage: "lingui-for-test/macro",
        allMacroImports: ["t", "plural", "Trans"] as const,
        componentImports: ["Trans"] as const,
      },
    );

    expect(bindings.all).toEqual(new Set(["translate", "plural", "Trans"]));
    expect(bindings.components).toEqual(new Set(["Trans"]));
    expect(bindings.allImports).toEqual(
      new Map([
        ["translate", "t"],
        ["plural", "plural"],
        ["Trans", "Trans"],
      ]),
    );
  });

  it("detects macro bindings in expressions, including eager and reactive aliases", () => {
    const bindings = parseMacroBindings(
      'import { t, plural } from "lingui-for-test/macro";',
      {
        parserPlugins: [...parserPlugins],
        macroPackage: "lingui-for-test/macro",
        allMacroImports: ["t", "plural"] as const,
        componentImports: [] as const,
      },
    );

    expect(
      expressionUsesMacroBinding("t`Hello`", bindings, {
        parserPlugins: [...parserPlugins],
        macroPackage: "lingui-for-test/macro",
      }),
    ).toBe(true);
    expect(
      expressionUsesMacroBinding("t.eager`Hello`", bindings, {
        parserPlugins: [...parserPlugins],
        macroPackage: "lingui-for-test/macro",
        eagerPropertyName: "eager",
      }),
    ).toBe(true);
    expect(
      expressionUsesMacroBinding("$t`Hello`", bindings, {
        parserPlugins: [...parserPlugins],
        macroPackage: "lingui-for-test/macro",
        reactiveAliasImports: new Set(["t"]),
      }),
    ).toBe(true);
    expect(
      expressionUsesMacroBinding("plainCall()", bindings, {
        parserPlugins: [...parserPlugins],
        macroPackage: "lingui-for-test/macro",
      }),
    ).toBe(false);
  });

  it("returns empty bindings when parse errors are swallowed", () => {
    expect(
      parseMacroBindings("<>", {
        parserPlugins: [...parserPlugins],
        macroPackage: "lingui-for-test/macro",
        allMacroImports: ["t"] as const,
        componentImports: [] as const,
        swallowParseErrors: true,
      }),
    ).toEqual({
      all: new Set(),
      components: new Set(),
      allImports: new Map(),
      componentImports: new Map(),
    });
  });
});
