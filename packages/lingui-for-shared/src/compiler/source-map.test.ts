import { describe, expect, test } from "vite-plus/test";

import {
  buildDirectProgramMap,
  buildGeneratedSnippetMap,
  buildPrefixedSnippetMap,
  createOffsetToPosition,
  offsetSourceMap,
} from "./source-map.ts";

describe("source-map helpers", () => {
  test("computes line and column from a byte offset", () => {
    const toPosition = createOffsetToPosition("a\nbc\n");

    expect(toPosition(0)).toEqual({ line: 1, column: 0 });
    expect(toPosition(2)).toEqual({ line: 2, column: 0 });
    expect(toPosition(4)).toEqual({ line: 2, column: 2 });
  });

  test("builds direct and prefixed snippet maps", () => {
    const direct = buildDirectProgramMap(
      "const answer = 42;",
      "/virtual/file.ts",
      6,
      6,
    );
    const prefixed = buildPrefixedSnippetMap(
      "const answer = 42;",
      "/virtual/file.ts",
      6,
      "const wrapped = (\n",
      6,
    );

    expect(direct.file).toBe("/virtual/file.ts");
    expect(direct.sources).toEqual(["/virtual/file.ts"]);
    expect(direct.sourcesContent).toEqual(["answer"]);
    expect(prefixed.file).toBe("/virtual/file.ts");
    expect(prefixed.sources).toEqual(["/virtual/file.ts"]);
  });

  test("builds generated snippet boundary maps and offsets maps", () => {
    const generated = buildGeneratedSnippetMap(
      "const answer = 42;",
      "file.ts",
      6,
      "__i18n._({ id: 'x' })",
      6,
    );
    const offset = offsetSourceMap(generated, "file.ts", "{");

    expect(generated.sources).toEqual(["file.ts"]);
    expect(offset.sources).toEqual(["file.ts"]);
    expect(offset.mappings).toBeTruthy();
  });
});
