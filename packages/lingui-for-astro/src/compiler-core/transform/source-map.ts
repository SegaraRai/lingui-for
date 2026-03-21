import { SourceMapGenerator, type RawSourceMap } from "source-map";

type SourcePosition = {
  line: number;
  column: number;
};

export function createOffsetToPosition(
  source: string,
): (offset: number) => SourcePosition {
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

function addLineMappings(
  generator: SourceMapGenerator,
  filename: string,
  generatedStartLine: number,
  snippet: string,
  originalStartOffset: number,
  toPosition: (offset: number) => SourcePosition,
): number {
  const lineOffsets = [0];

  for (let index = 0; index < snippet.length; index += 1) {
    if (snippet[index] === "\n" && index + 1 < snippet.length) {
      lineOffsets.push(index + 1);
    }
  }

  lineOffsets.forEach((offset, lineIndex) => {
    generator.addMapping({
      generated: { line: generatedStartLine + lineIndex, column: 0 },
      original: toPosition(originalStartOffset + offset),
      source: filename,
    });
  });

  return lineOffsets.length;
}

function countGeneratedLines(code: string): number {
  let lines = 1;

  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === "\n") {
      lines += 1;
    }
  }

  return lines;
}

export function buildDirectProgramMap(
  source: string,
  filename: string,
  originalStart: number,
  snippet: string,
): RawSourceMap {
  const generator = new SourceMapGenerator({ file: filename });
  const toPosition = createOffsetToPosition(source);

  addLineMappings(generator, filename, 1, snippet, originalStart, toPosition);
  generator.setSourceContent(filename, source);

  return generator.toJSON();
}

export function buildWrappedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  prefix: string,
  snippet: string,
  suffix: string,
): RawSourceMap {
  const generator = new SourceMapGenerator({ file: filename });
  const toPosition = createOffsetToPosition(source);

  addLineMappings(
    generator,
    filename,
    countGeneratedLines(prefix),
    snippet,
    originalStart,
    toPosition,
  );
  generator.setSourceContent(filename, source);

  const fullCode = `${prefix}${snippet}${suffix}`;
  if (!fullCode.endsWith("\n")) {
    generator.addMapping({
      generated: {
        line: countGeneratedLines(fullCode),
        column: fullCode.split("\n").at(-1)?.length ?? 0,
      },
      original: toPosition(originalStart + snippet.length),
      source: filename,
    });
  }

  return generator.toJSON();
}
