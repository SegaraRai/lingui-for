import { parseSync } from "@babel/core";
import { describe, expect, it } from "vite-plus/test";

import { getBabelTraverse } from "./babel-traverse.ts";

describe("getBabelTraverse", () => {
  it("returns a callable traverse function", () => {
    const file = parseSync("const answer = 42;", {
      ast: true,
      babelrc: false,
      code: false,
      configFile: false,
      parserOpts: {
        sourceType: "module",
      },
    });

    if (!file) {
      throw new Error("Failed to parse test fixture");
    }

    let visited = false;
    const traverse = getBabelTraverse();

    traverse(file, {
      NumericLiteral(path) {
        visited = path.node.value === 42;
      },
    });

    expect(typeof traverse).toBe("function");
    expect(visited).toBe(true);
  });
});
