import { describe, expect, test } from "vite-plus/test";

import { getBabelTraverse } from "./babel-traverse.ts";

describe("shared/babel-traverse", () => {
  test("returns a traverse function", () => {
    expect(typeof getBabelTraverse()).toBe("function");
  });
});
