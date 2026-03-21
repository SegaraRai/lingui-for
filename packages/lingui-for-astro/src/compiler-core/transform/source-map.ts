import {
  SourceMapConsumer,
  SourceMapGenerator,
  type RawSourceMap,
} from "source-map";
import MagicString from "magic-string";

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

export function buildDirectProgramMap(
  source: string,
  filename: string,
  originalStart: number,
  snippetOrLength: string | number,
): RawSourceMap {
  const originalLength =
    typeof snippetOrLength === "number"
      ? snippetOrLength
      : snippetOrLength.length;
  const string = new MagicString(source, { filename }).snip(
    originalStart,
    originalStart + originalLength,
  );

  return string.generateMap({
    file: filename,
    hires: true,
    includeContent: true,
    source: filename,
  }) as never as RawSourceMap;
}

export function buildWrappedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  prefix: string,
  snippet: string,
  _suffix: string,
  originalLength = snippet.length,
): RawSourceMap {
  const snippetMap = buildDirectProgramMap(
    source,
    filename,
    originalStart,
    originalLength,
  );

  return offsetSourceMap(snippetMap, filename, prefix);
}

export function buildGeneratedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  generated: string,
  originalLength: number,
): RawSourceMap {
  const generator = new SourceMapGenerator({ file: filename });
  const toPosition = createOffsetToPosition(source);
  const generatedEnd = createOffsetToPosition(generated)(generated.length);
  const generatedLast = createOffsetToPosition(generated)(
    Math.max(generated.length - 1, 0),
  );

  generator.addMapping({
    generated: { line: 1, column: 0 },
    original: toPosition(originalStart),
    source: filename,
  });

  if (generated.length > 0 && originalLength > 0) {
    generator.addMapping({
      generated: generatedLast,
      original: toPosition(originalStart + originalLength - 1),
      source: filename,
    });
  }

  generator.addMapping({
    generated: generatedEnd,
    original: toPosition(originalStart + originalLength),
    source: filename,
  });

  generator.setSourceContent(filename, source);

  return generator.toJSON();
}

export function offsetSourceMap(
  map: RawSourceMap,
  file: string,
  prefix: string,
): RawSourceMap {
  const offset = {
    line: 0,
    column: 0,
  };

  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] === "\n") {
      offset.line += 1;
      offset.column = 0;
    } else {
      offset.column += 1;
    }
  }

  return {
    version: 3,
    file,
    names: [],
    mappings: "",
    sources: [],
    sections: [
      {
        offset,
        map,
      },
    ],
  } as RawSourceMap;
}

export async function composeSourceMaps(
  outerMap: RawSourceMap,
  innerMap: RawSourceMap,
): Promise<RawSourceMap> {
  return await SourceMapConsumer.with(
    outerMap as never,
    null,
    async (outerConsumer) =>
      await SourceMapConsumer.with(innerMap as never, null, (innerConsumer) => {
        const generator = new SourceMapGenerator({
          file: outerMap.file ?? innerMap.file,
        });

        outerConsumer.eachMapping((mapping) => {
          if (
            mapping.originalLine == null ||
            mapping.originalColumn == null ||
            mapping.source == null
          ) {
            return;
          }

          const original = innerConsumer.originalPositionFor({
            line: mapping.originalLine,
            column: mapping.originalColumn,
          });

          if (
            original.line == null ||
            original.column == null ||
            original.source == null
          ) {
            return;
          }

          generator.addMapping({
            generated: {
              line: mapping.generatedLine,
              column: mapping.generatedColumn,
            },
            original: {
              line: original.line,
              column: original.column,
            },
            source: original.source,
            name: original.name ?? mapping.name ?? undefined,
          });
        });

        innerConsumer.sources.forEach((source) => {
          const content = innerConsumer.sourceContentFor(source, true);

          if (content != null) {
            generator.setSourceContent(source, content);
          }
        });

        return generator.toJSON();
      }),
  );
}
