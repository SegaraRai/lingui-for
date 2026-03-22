import { describe, expect, test } from "vite-plus/test";

import {
  buildOutputWithIndexedMap,
  createUntouchedChunkMap,
} from "./replacement-map.ts";

describe("replacement map helpers", () => {
  test("creates source maps for untouched source chunks", () => {
    const map = createUntouchedChunkMap(
      "const answer = 42;",
      "/virtual.ts",
      6,
      12,
    );

    expect(map?.file).toBe("/virtual.ts");
    expect(map?.sources).toEqual(["/virtual.ts"]);
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
    expect(result.map.sources).toEqual(["/virtual.ts"]);
    expect(result.map.mappings).toBeTruthy();
  });
});
