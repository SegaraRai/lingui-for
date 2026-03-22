import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import type { expect as vpExpect } from "vite-plus/test";

export type SourceLocation = {
  line: number;
  column: number;
};

export type SourceRange = {
  start: number;
  end: number;
};

export type Detection = {
  name: string;
  original: string | RegExp;
  generated: string | RegExp;
};

export function findUniqueRange(
  source: string,
  needle: string | RegExp,
): SourceRange {
  if (typeof needle === "string") {
    const start = source.indexOf(needle);
    if (start < 0) {
      throw new Error(`Needle not found: ${needle}`);
    }

    const second = source.indexOf(needle, start + 1);
    if (second >= 0) {
      throw new Error(`Needle matched multiple times: ${needle}`);
    }

    return {
      start,
      end: start + needle.length,
    };
  }

  const flags = needle.flags.includes("g") ? needle.flags : `${needle.flags}g`;
  const expression = new RegExp(needle.source, flags);
  const matches = [...source.matchAll(expression)];

  if (matches.length === 0) {
    throw new Error(`Pattern not found: ${needle}`);
  }
  if (matches.length > 1) {
    throw new Error(`Pattern matched multiple times: ${needle}`);
  }

  const match = matches[0];
  const fullMatch = match?.[0];
  const index = match?.index;

  if (fullMatch == null || index == null) {
    throw new Error(`Pattern did not provide a stable range: ${needle}`);
  }

  return {
    start: index,
    end: index + fullMatch.length,
  };
}

export function offsetToLocation(
  source: string,
  offset: number,
): SourceLocation {
  let line = 1;
  let column = 0;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

export function assertRangeMapping(
  consumer: TraceMap,
  generatedSource: string,
  originalSource: string,
  detection: Detection,
  filename: string,
  expect: typeof vpExpect,
): void {
  const generated = findUniqueRange(generatedSource, detection.generated);
  const original = findUniqueRange(originalSource, detection.original);
  const generatedStart = offsetToLocation(generatedSource, generated.start);
  const generatedEnd = offsetToLocation(generatedSource, generated.end);
  const originalStart = offsetToLocation(originalSource, original.start);
  const originalEnd = offsetToLocation(originalSource, original.end);
  const mappedStart = originalPositionFor(consumer, {
    line: generatedStart.line,
    column: generatedStart.column,
  });
  const mappedEnd = originalPositionFor(consumer, {
    line: generatedEnd.line,
    column: generatedEnd.column,
  });

  expect(
    mappedStart.source,
    `${detection.name}: missing source for start position`,
  ).toBe(filename);
  expect(mappedStart.line, `${detection.name}: start line`).toBe(
    originalStart.line,
  );
  expect(mappedStart.column, `${detection.name}: start column`).toBe(
    originalStart.column,
  );

  expect(
    mappedEnd.source,
    `${detection.name}: missing source for end position`,
  ).toBe(filename);
  expect(mappedEnd.line, `${detection.name}: end line`).toBe(originalEnd.line);
  expect(mappedEnd.column, `${detection.name}: end column`).toBe(
    originalEnd.column,
  );
}
