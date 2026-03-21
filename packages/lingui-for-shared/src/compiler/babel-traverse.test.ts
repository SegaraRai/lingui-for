import { parseSync } from "@babel/core";
import { describe, expect, test } from "vite-plus/test";

import { babelTraverse } from "./babel-traverse.ts";

describe("babelTraverse", () => {
  test("returns a callable traverse function", () => {
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

    babelTraverse(file, {
      NumericLiteral(path) {
        visited = path.node.value === 42;
      },
    });

    expect(typeof babelTraverse).toBe("function");
    expect(visited).toBe(true);
  });
});
