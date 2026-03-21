import { describe, expect, it } from "vite-plus/test";

import { buildDirectProgramMap, createOffsetToPosition } from "./source-map.ts";

describe("createOffsetToPosition", () => {
  it("maps offsets to line and column", () => {
    const locate = createOffsetToPosition("alpha\nbeta\ngamma");

    expect(locate(0)).toEqual({ line: 1, column: 0 });
    expect(locate(6)).toEqual({ line: 2, column: 0 });
    expect(locate(11)).toEqual({ line: 3, column: 0 });
  });
});

describe("buildDirectProgramMap", () => {
  it("preserves filename and source contents", () => {
    const source = "<script>\nconst value = 1;\n</script>";
    const snippet = "\nconst value = 1;\n";
    const map = buildDirectProgramMap(source, "Component.svelte", 8, snippet);

    expect(map.file).toBe("Component.svelte");
    expect(map.sources).toEqual(["Component.svelte"]);
    expect(map.sourcesContent).toEqual([source]);
  });
});
