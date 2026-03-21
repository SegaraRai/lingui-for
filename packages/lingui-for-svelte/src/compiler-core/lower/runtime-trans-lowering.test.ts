import { transformSync } from "@babel/core";
import dedent from "dedent";
import { describe, expect, test } from "vite-plus/test";

import { splitSyntheticDeclarations } from "./runtime-trans-lowering.ts";
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

describe("splitSyntheticDeclarations", () => {
  test("separates synthetic expressions and lowers RuntimeTrans JSX back to Svelte", () => {
    const transformed = parseProgram(dedent`
      import { RuntimeTrans as LocalRuntimeTrans } from "lingui-for-svelte/runtime";
      import { helper } from "./helper.ts";

      const keep = helper();
      const __lingui_for_svelte_expr_0 = $__l4s_translate({
        id: "demo.heading",
        message: "Hello"
      });
      const __lingui_for_svelte_component_0 = <LocalRuntimeTrans {...{
        id: "demo.docs",
        message: "Read the <0>docs</0>.",
        components: {
          0: <a href="/docs" />
        }
      }} />;
    `);

    const split = splitSyntheticDeclarations(transformed, "RuntimeTransStable");

    expect(split.script.code).toMatchInlineSnapshot(`
    	"import { helper } from "./helper.ts";
    	const keep = helper();"
    `);
    expect(split.expressionReplacements.get(0)?.code).toMatchInlineSnapshot(`
    	"$__l4s_translate({
    	  id: "demo.heading",
    	  message: "Hello"
    	})"
    `);
    expect(split.componentReplacements.get(0)?.code).toMatchInlineSnapshot(`
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
    	    }
    	  }
    	}} />"
    `);
  });
});
