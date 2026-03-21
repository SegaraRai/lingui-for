import type { RawSourceMap } from "source-map";
import { describe, expect, test } from "vite-plus/test";

import {
  advanceGeneratedOffset,
  buildOutputWithIndexedMap,
  createUntouchedChunkMap,
} from "./replacement-map.ts";

describe("replacement map helpers", () => {
  test("advances generated offsets across lines", () => {
    expect(advanceGeneratedOffset({ line: 0, column: 0 }, "a\nbc")).toEqual({
      line: 1,
      column: 2,
    });
  });

  test("creates source maps for untouched source chunks", () => {
    const map = createUntouchedChunkMap(
      "const answer = 42;",
      "/virtual.ts",
      6,
      12,
    );

    expect(map?.file).toBe("virtual.ts");
    expect(map?.sources).toEqual(["virtual.ts"]);
    expect(map?.sourcesContent).toEqual(["const answer = 42;"]);
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
          map: {
            version: 3,
            file: "/virtual.ts",
            names: [],
            mappings: "",
            sources: ["/virtual.ts"],
            sourcesContent: ["result"],
          },
        },
      ],
    );

    expect(result.code).toBe("const result = 42;");
    expect(result.map.file).toBe("/virtual.ts");
    expect(
      (result.map as RawSourceMap & { sections: unknown[] }).sections,
    ).toHaveLength(3);
  });
});
