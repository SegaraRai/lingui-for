import { describe, expect, test } from "vite-plus/test";

import type { LoweredSnippet, LoweringSourceMapOptions } from "./common.ts";

describe("lower/common", () => {
  test("exposes shared lowering types", () => {
    const mapOptions: LoweringSourceMapOptions = {
      fullSource: "source",
      sourceStart: 0,
    };
    const lowered: LoweredSnippet = {
      code: "code",
      map: null,
    };

    expect(mapOptions.sourceStart).toBe(0);
    expect(lowered.code).toBe("code");
  });
});
