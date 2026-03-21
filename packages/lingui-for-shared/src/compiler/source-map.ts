import MagicString from "magic-string";
import { SourceMapConsumer, SourceMapGenerator } from "source-map";

import type { IndexedSourceMap, SourceMap } from "./source-map-types.ts";

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
  originalLength: number,
): SourceMap {
  const string = new MagicString(source, { filename }).snip(
    originalStart,
    originalStart + originalLength,
  );

  return normalizeMagicStringMapFilename(
    string.generateMap({
      file: filename,
      hires: true,
      includeContent: true,
      source: filename,
    }),
    filename,
    string.toString(),
  );
}

export function buildPrefixedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  prefix: string,
  originalLength: number,
): SourceMap {
  const originalPosition = createOffsetToPosition(source)(originalStart);
  const prefixPosition = createOffsetToPosition(prefix);
  const bodyMap = buildDirectProgramMap(
    source,
    filename,
    originalStart,
    originalLength,
  );
  const offsetBodyMap = offsetSourceMap(bodyMap, filename, prefix);
  const generator = new SourceMapGenerator({ file: filename });
  const prefixEnd = prefixPosition(prefix.length);

  for (let line = 1; line <= prefixEnd.line; line += 1) {
    const maxColumn =
      line === prefixEnd.line
        ? prefixEnd.column
        : (prefix.split("\n")[line - 1]?.length ?? 0);

    for (let column = 0; column <= maxColumn; column += 1) {
      generator.addMapping({
        generated: { line, column },
        original: originalPosition,
        source: filename,
      });
    }
  }

  void SourceMapConsumer.with(offsetBodyMap, null, (consumer) => {
    consumer.eachMapping((mapping) => {
      if (
        mapping.originalLine == null ||
        mapping.originalColumn == null ||
        mapping.source == null
      ) {
        return;
      }

      generator.addMapping({
        generated: {
          line: mapping.generatedLine,
          column: mapping.generatedColumn,
        },
        original: {
          line: mapping.originalLine,
          column: mapping.originalColumn,
        },
        source: mapping.source,
        name: mapping.name ?? undefined,
      });
    });
  });

  generator.setSourceContent(filename, source);

  return generator.toJSON();
}

export function buildPrefixedMappedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  prefix: string,
  bodyMap: SourceMap,
): IndexedSourceMap {
  const originalPosition = createOffsetToPosition(source)(originalStart);
  const prefixPosition = createOffsetToPosition(prefix);
  const generator = new SourceMapGenerator({ file: filename });
  const prefixEnd = prefixPosition(prefix.length);

  for (let line = 1; line <= prefixEnd.line; line += 1) {
    const maxColumn =
      line === prefixEnd.line
        ? prefixEnd.column
        : (prefix.split("\n")[line - 1]?.length ?? 0);

    for (let column = 0; column <= maxColumn; column += 1) {
      generator.addMapping({
        generated: { line, column },
        original: originalPosition,
        source: filename,
      });
    }
  }

  generator.setSourceContent(filename, source);

  return {
    version: 3,
    file: filename,
    names: [],
    mappings: "",
    sources: [filename],
    sourcesContent: [source],
    sections: [
      {
        offset: { line: 0, column: 0 },
        map: generator.toJSON(),
      },
      {
        offset: computeGeneratedOffset(prefix),
        map: bodyMap,
      },
    ],
  };
}

export function buildGeneratedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  generated: string,
  originalLength: number,
): SourceMap {
  const generator = new SourceMapGenerator({ file: filename });
  const toPosition = createOffsetToPosition(source);
  const generatedToPosition = createOffsetToPosition(generated);
  const generatedLength = Math.max(generated.length, 1);

  for (let offset = 0; offset <= generated.length; offset += 1) {
    const ratio = offset / generatedLength;
    const originalOffset =
      originalStart +
      Math.min(Math.floor(ratio * originalLength), originalLength);

    generator.addMapping({
      generated: generatedToPosition(offset),
      original: toPosition(originalOffset),
      source: filename,
    });
  }

  generator.setSourceContent(filename, source);

  return generator.toJSON();
}

export function buildAnchoredGeneratedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  generated: string,
  originalLength: number,
  anchorOffset: number,
): SourceMap {
  const generator = new SourceMapGenerator({ file: filename });
  const toPosition = createOffsetToPosition(source);
  const generatedToPosition = createOffsetToPosition(generated);
  const clampedAnchor = Math.max(0, Math.min(anchorOffset, generated.length));
  const generatedTailLength = Math.max(generated.length - clampedAnchor, 1);

  for (let offset = 0; offset <= generated.length; offset += 1) {
    const originalOffset =
      offset <= clampedAnchor
        ? originalStart
        : originalStart +
          Math.min(
            Math.floor(
              ((offset - clampedAnchor) / generatedTailLength) * originalLength,
            ),
            originalLength,
          );

    generator.addMapping({
      generated: generatedToPosition(offset),
      original: toPosition(originalOffset),
      source: filename,
    });
  }

  generator.setSourceContent(filename, source);

  return generator.toJSON();
}

export async function composeSourceMaps(
  outerMap: SourceMap,
  innerMap: SourceMap,
): Promise<SourceMap> {
  return await SourceMapConsumer.with(
    outerMap,
    null,
    async (outerConsumer) =>
      await SourceMapConsumer.with(innerMap, null, (innerConsumer) => {
        const generator = new SourceMapGenerator({
          file: outerMap.file ?? innerMap.file ?? "",
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

export function offsetSourceMap(
  map: SourceMap,
  file: string,
  prefix: string,
): IndexedSourceMap {
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
  };
}

function computeGeneratedOffset(code: string): {
  line: number;
  column: number;
} {
  const offset = {
    line: 0,
    column: 0,
  };

  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === "\n") {
      offset.line += 1;
      offset.column = 0;
    } else {
      offset.column += 1;
    }
  }

  return offset;
}

function normalizeMagicStringMapFilename(
  map: SourceMap,
  filename: string,
  sourceContent: string,
): SourceMap {
  return {
    ...map,
    file: filename,
    sources: [filename],
    sourcesContent: [sourceContent],
  };
}
