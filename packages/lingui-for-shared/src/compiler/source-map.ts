import {
  addMapping,
  GenMapping,
  type EncodedSourceMap,
} from "@jridgewell/gen-mapping";

type UnpluginSourceMap = {
  file?: string | undefined;
  mappings: string;
  names: string[];
  sourceRoot?: string | undefined;
  sources: string[];
  sourcesContent?: string[] | undefined;
  version: number;
};
export function toUnpluginSourceMap(map: EncodedSourceMap): UnpluginSourceMap {
  return map as UnpluginSourceMap;
}

export function createOffsetToPosition(
  source: string,
): (offset: number) => { line: number; column: number } {
  const lineStarts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return (offset: number) => {
    let lineIndex = 0;

    while (
      lineIndex + 1 < lineStarts.length &&
      (lineStarts[lineIndex + 1] ?? Number.POSITIVE_INFINITY) <= offset
    ) {
      lineIndex += 1;
    }

    return {
      line: lineIndex + 1,
      column: offset - (lineStarts[lineIndex] ?? 0),
    };
  };
}

export function addLineMappings(
  gen: GenMapping,
  filename: string,
  generatedStartLine: number,
  snippet: string,
  originalStartOffset: number,
  toPosition: (offset: number) => { line: number; column: number },
): number {
  const lineOffsets = [0];

  for (let index = 0; index < snippet.length; index += 1) {
    if (snippet[index] === "\n" && index + 1 < snippet.length) {
      lineOffsets.push(index + 1);
    }
  }

  lineOffsets.forEach((offset, lineIndex) => {
    addMapping(gen, {
      generated: { line: generatedStartLine + lineIndex, column: 0 },
      original: toPosition(originalStartOffset + offset),
      source: filename,
    });
  });

  return lineOffsets.length;
}
