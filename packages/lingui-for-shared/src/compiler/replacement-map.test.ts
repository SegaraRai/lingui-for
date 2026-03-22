import { describe, expect, test } from "vite-plus/test";

import { buildOutputWithIndexedMap } from "./replacement-map.ts";

describe("replacement map helpers", () => {
  test("maps untouched source regions back to the original file", () => {
    const result = buildOutputWithIndexedMap(
      "const answer = 42;",
      "/virtual.ts",
      [],
    );

    expect(result.code).toBe("const answer = 42;");
    expect(result.map.file).toBe("/virtual.ts");
    expect(result.map.sources).toEqual(["/virtual.ts"]);
    expect(result.map.sourcesContent).toEqual(["const answer = 42;"]);
  });

  test("builds output and indexed maps for replaced source", () => {
    const result = buildOutputWithIndexedMap(
      "const answer = 42;",
      "/virtual.ts",
      [
        {
          start: 6,
          end: 12,
          code: "result",
        },
      ],
    );

    expect(result.code).toBe("const result = 42;");
    expect(result.map.file).toBe("/virtual.ts");
    expect(result.map.sources).toEqual(["/virtual.ts"]);
    expect(result.map.mappings).toBeTruthy();
  });
});
