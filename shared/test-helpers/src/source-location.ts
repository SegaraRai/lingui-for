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
  const bounded = Math.min(offset, source.length);
  let line = 1;
  let column = 0;

  for (const char of source.slice(0, bounded)) {
    if (char === "\n") {
      line += 1;
      column = 0;
    } else {
      column += char.length;
    }
  }

  return { line, column };
}

export function nextCodePointOffset(source: string, offset: number): number {
  const bounded = Math.min(offset, source.length);
  const codePoint = source.codePointAt(bounded);
  if (codePoint == null) {
    return bounded;
  }

  return bounded + (codePoint > 0xffff ? 2 : 1);
}

export function previousCodePointOffset(
  source: string,
  offset: number,
): number {
  const bounded = Math.min(offset, source.length);
  if (bounded <= 0) {
    return 0;
  }

  const lastCodeUnit = source.charCodeAt(bounded - 1);
  if (bounded >= 2 && lastCodeUnit >= 0xdc00 && lastCodeUnit <= 0xdfff) {
    const previousCodeUnit = source.charCodeAt(bounded - 2);
    if (previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff) {
      return bounded - 2;
    }
  }

  return bounded - 1;
}

export function assertRangeMapping(
  consumer: TraceMap,
  generatedSource: string,
  originalSource: string,
  detection: Detection,
  filename: string,
  mode: "start" | "end" | "both",
  expect: typeof vpExpect,
): void {
  const generated = findUniqueRange(generatedSource, detection.generated);
  const original = findUniqueRange(originalSource, detection.original);
  const generatedStart = offsetToLocation(generatedSource, generated.start);
  const originalStart = offsetToLocation(originalSource, original.start);
  const originalEndExclusive = offsetToLocation(originalSource, original.end);
  const originalEndInclusive = offsetToLocation(
    originalSource,
    previousCodePointOffset(originalSource, original.end),
  );
  const mappedStart = originalPositionFor(consumer, {
    line: generatedStart.line,
    column: generatedStart.column,
  });
  const generatedEndExclusive = offsetToLocation(
    generatedSource,
    generated.end,
  );
  const mappedEndExclusive = originalPositionFor(consumer, {
    line: generatedEndExclusive.line,
    column: generatedEndExclusive.column,
  });
  const generatedEndInclusive = offsetToLocation(
    generatedSource,
    previousCodePointOffset(generatedSource, generated.end),
  );
  const mappedEndInclusive = originalPositionFor(consumer, {
    line: generatedEndInclusive.line,
    column: generatedEndInclusive.column,
  });

  if (mode === "start" || mode === "both") {
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
  }

  const endMatchesExclusive =
    mappedEndExclusive.source === filename &&
    mappedEndExclusive.line === originalEndExclusive.line &&
    mappedEndExclusive.column === originalEndExclusive.column;
  const endMatchesInclusive =
    mappedEndInclusive.source === filename &&
    mappedEndInclusive.line === originalEndInclusive.line &&
    mappedEndInclusive.column === originalEndInclusive.column;

  if (mode === "end" || mode === "both") {
    expect(
      endMatchesExclusive || endMatchesInclusive,
      [
        `${detection.name}: end mapping mismatch`,
        `exclusive generated ${generatedEndExclusive.line}:${generatedEndExclusive.column} -> ${mappedEndExclusive.source}:${mappedEndExclusive.line}:${mappedEndExclusive.column}`,
        `inclusive generated ${generatedEndInclusive.line}:${generatedEndInclusive.column} -> ${mappedEndInclusive.source}:${mappedEndInclusive.line}:${mappedEndInclusive.column}`,
        `expected exclusive ${filename}:${originalEndExclusive.line}:${originalEndExclusive.column} or inclusive ${filename}:${originalEndInclusive.line}:${originalEndInclusive.column}`,
      ].join("\n"),
    ).toBe(true);
  }
}
