import { describe, expect, it } from "vite-plus/test";

import { getBabelTraverse } from "./babel-traverse.ts";

describe("shared/babel-traverse", () => {
  it("returns a traverse function", () => {
    expect(typeof getBabelTraverse()).toBe("function");
  });
});
