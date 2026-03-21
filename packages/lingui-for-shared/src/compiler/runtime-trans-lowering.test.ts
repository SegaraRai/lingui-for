import { transformSync } from "@babel/core";
import { describe, expect, it } from "vite-plus/test";

import {
  lowerSyntheticComponentDeclaration,
  splitSyntheticDeclarations,
  stripRuntimeTransImports,
} from "./runtime-trans-lowering.ts";
import type { ProgramTransformLike } from "./runtime-trans-lowering.ts";

function parseProgram(code: string): ProgramTransformLike<null> {
  const result = transformSync(code, {
    ast: true,
    babelrc: false,
    code: true,
    configFile: false,
    filename: "/virtual/runtime-trans.tsx",
    parserOpts: {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    },
  });

  if (!result?.ast || result.code == null) {
    throw new Error("Failed to parse runtime trans fixture");
  }

  return {
    ast: result.ast,
    code: result.code,
    map: null,
  };
}

describe("runtime trans lowering helpers", () => {
  it("splits synthetic declarations into script and replacements", () => {
    const transformed = parseProgram(`
      import { RuntimeTrans as LocalRuntimeTrans } from "lingui-for-test/runtime";
      import { helper } from "./helper.ts";

      const keep = helper();
      const __expr_0 = translate({
        id: "demo.heading",
        message: "Hello"
      });
      const __component_0 = <LocalRuntimeTrans {...{
        id: "demo.docs",
        message: "Read the <0>docs</0>.",
        components: {
          0: <a href="/docs" />
        }
      }} />;
    `);

    const split = splitSyntheticDeclarations(transformed, {
      runtimePackageName: "lingui-for-test/runtime",
      runtimeTransComponentName: "RuntimeTransStable",
      syntheticExpressionPrefix: "__expr_",
      syntheticComponentPrefix: "__component_",
      shouldRemoveRuntimeTransImport: () => true,
    });

    expect(split.script.code).toContain(
      'import { helper } from "./helper.ts";',
    );
    expect(split.script.code).not.toContain("RuntimeTrans");
    expect(split.expressionReplacements.get(0)?.code).toContain(
      'message: "Hello"',
    );
    expect(split.componentReplacements.get(0)?.code).toContain(
      "<RuntimeTransStable {...{",
    );
    expect(split.componentReplacements.get(0)?.code).toContain('tag: "a"');
  });

  it("lowers a synthetic component declaration directly to markup", () => {
    const transformed = parseProgram(`
      const __component_0 = <LocalRuntimeTrans {...{
        id: "demo.docs",
        message: "Read the <0>docs</0>.",
        components: {
          0: <a href="/docs" />
        }
      }} />;
    `);

    expect(
      lowerSyntheticComponentDeclaration(
        transformed,
        "RuntimeTransStable",
        "__component_",
      ),
    ).toContain("<RuntimeTransStable {...{");
  });

  it("removes RuntimeTrans imports when requested", () => {
    const transformed = parseProgram(`
      import { RuntimeTrans, helper } from "lingui-for-test/runtime";
      import { keep } from "./keep.ts";
    `);

    stripRuntimeTransImports(
      transformed.ast.program,
      "lingui-for-test/runtime",
      (localName) => localName === "RuntimeTrans",
    );

    expect(transformed.ast.program.body).toHaveLength(2);
    expect(transformed.ast.program.body[0]).toMatchObject({
      type: "ImportDeclaration",
      source: { value: "lingui-for-test/runtime" },
      specifiers: [{ local: { name: "helper" } }],
    });
    expect(transformed.ast.program.body[1]).toMatchObject({
      type: "ImportDeclaration",
      source: { value: "./keep.ts" },
      specifiers: [{ local: { name: "keep" } }],
    });
  });
});
