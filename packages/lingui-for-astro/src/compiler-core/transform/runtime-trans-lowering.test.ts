import { transformSync } from "@babel/core";
import dedent from "dedent";
import { describe, expect, it } from "vitest";

import {
  lowerSyntheticComponentDeclaration,
  stripRuntimeTransImports,
} from "./runtime-trans-lowering.ts";
import type { ProgramTransform } from "./types.ts";

function parseProgram(code: string): ProgramTransform {
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

describe("lowerSyntheticComponentDeclaration", () => {
  it("lowers RuntimeTrans JSX back to Astro component markup", () => {
    const transformed = parseProgram(dedent`
      import { RuntimeTrans as LocalRuntimeTrans } from "lingui-for-astro/runtime";
      import { helper } from "./helper.ts";

      const keep = helper();
      const __lingui_for_astro_component_0 = <LocalRuntimeTrans {...{
        id: "demo.docs",
        message: "Read the <0>docs</0>.",
        components: {
          0: <a href="/docs" />,
          1: <Link to="/settings" />
        }
      }} />;
    `);

    const lowered = lowerSyntheticComponentDeclaration(
      transformed,
      "RuntimeTransStable",
    );

    expect(lowered).toMatchInlineSnapshot(`
      "<RuntimeTransStable {...{
        id: "demo.docs",
        message: "Read the <0>docs</0>.",
        components: {
          0: {
            kind: "element",
            tag: "a",
            props: {
              href: "/docs"
            }
          },
          1: {
            kind: "component",
            component: Link,
            props: {
              to: "/settings"
            }
          }
        }
      }} />"
    `);
  });

  it("supports compact output when requested", () => {
    const transformed = parseProgram(dedent`
      const __lingui_for_astro_component_0 = <LocalRuntimeTrans {...{
        message: "Hello",
        components: {
          0: <a href="/docs" />
        }
      }} />;
    `);

    const lowered = lowerSyntheticComponentDeclaration(
      transformed,
      "RuntimeTransStable",
      { compact: true },
    );

    expect(lowered).toBe(
      '<RuntimeTransStable {...{message:"Hello",components:{0:{kind:"element",tag:"a",props:{href:"/docs"}}}}} />',
    );
  });
});

describe("stripRuntimeTransImports", () => {
  it("removes RuntimeTrans imports from the runtime package and keeps other imports", () => {
    const transformed = parseProgram(dedent`
      import { RuntimeTrans as LocalRuntimeTrans, getLinguiContext } from "lingui-for-astro/runtime";
      import { helper } from "./helper.ts";

      const keep = helper();
    `);

    stripRuntimeTransImports(transformed.ast.program);

    const remaining = transformed.ast.program.body
      .filter((statement) => statement.type === "ImportDeclaration")
      .map((statement) =>
        "source" in statement ? String(statement.source?.value) : "",
      );

    expect(remaining).toEqual(["lingui-for-astro/runtime", "./helper.ts"]);

    const runtimeImport = transformed.ast.program.body.find(
      (statement) =>
        statement.type === "ImportDeclaration" &&
        "source" in statement &&
        statement.source.value === "lingui-for-astro/runtime",
    );

    expect(runtimeImport).toBeTruthy();
    expect(JSON.stringify(runtimeImport)).not.toContain("RuntimeTrans");
    expect(JSON.stringify(runtimeImport)).toContain("getLinguiContext");
  });

  it("drops the entire import when RuntimeTrans was the only imported symbol", () => {
    const transformed = parseProgram(dedent`
      import { RuntimeTrans as LocalRuntimeTrans } from "lingui-for-astro/runtime";
      import { helper } from "./helper.ts";

      const keep = helper();
    `);

    stripRuntimeTransImports(transformed.ast.program);

    const sources = transformed.ast.program.body
      .filter((statement) => statement.type === "ImportDeclaration")
      .map((statement) =>
        "source" in statement ? String(statement.source?.value) : "",
      );

    expect(sources).toEqual(["./helper.ts"]);
  });
});
