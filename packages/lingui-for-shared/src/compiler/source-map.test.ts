import {
  GenMapping,
  setSourceContent,
  toEncodedMap,
} from "@jridgewell/gen-mapping";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { describe, expect, test } from "vite-plus/test";

import { addLineMappings, createOffsetToPosition } from "./source-map.ts";

describe("source-map helpers", () => {
  test("computes line and column from a byte offset", () => {
    const toPosition = createOffsetToPosition("a\nbc\n");

    expect(toPosition(0)).toEqual({ line: 1, column: 0 });
    expect(toPosition(2)).toEqual({ line: 2, column: 0 });
    expect(toPosition(4)).toEqual({ line: 2, column: 2 });
  });

  test("addLineMappings maps each line of a snippet to the original source offset", () => {
    const source = "function foo() {\n  return 1;\n}\n";
    const filename = "/virtual/file.ts";
    const gen = new GenMapping({ file: filename });
    setSourceContent(gen, filename, source);
    const toPosition = createOffsetToPosition(source);

    // Map snippet starting at offset 17 (start of "  return 1;\n}")
    const snippet = source.slice(17);
    addLineMappings(gen, filename, 1, snippet, 17, toPosition);

    const map = toEncodedMap(gen);
    const consumer = new TraceMap(map);

    // Line 1, column 0 in generated → offset 17 in source → line 2, column 0
    const result = originalPositionFor(consumer, { line: 1, column: 0 });
    expect(result.source).toBe(filename);
    expect(result.line).toBe(2);
    expect(result.column).toBe(0);
  });

  test("addLineMappings handles a multi-line snippet starting at a non-zero offset", () => {
    const source = "const a = 1;\nconst b = 2;\nconst c = 3;\n";
    const filename = "/virtual/file.ts";
    const gen = new GenMapping({ file: filename });
    setSourceContent(gen, filename, source);
    const toPosition = createOffsetToPosition(source);

    const snippetStart = 13; // start of "const b = 2;\n..."
    const snippet = source.slice(snippetStart);
    addLineMappings(gen, filename, 1, snippet, snippetStart, toPosition);

    const map = toEncodedMap(gen);
    const consumer = new TraceMap(map);

    // Line 2 in generated → "const c = 3;" → offset 26 in source → line 3
    const result = originalPositionFor(consumer, { line: 2, column: 0 });
    expect(result.source).toBe(filename);
    expect(result.line).toBe(3);
  });
});
