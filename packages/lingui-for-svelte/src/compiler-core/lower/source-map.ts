import {
  SourceMapConsumer,
  SourceMapGenerator,
  type RawSourceMap,
} from "source-map";

import {
  buildDirectProgramMap as buildDirectProgramMapShared,
  buildGeneratedSnippetMap as buildGeneratedSnippetMapShared,
  buildPrefixedSnippetMap as buildPrefixedSnippetMapShared,
} from "lingui-for-shared/compiler";

export {
  advanceGeneratedOffset,
  createIndexedSourceMap,
  createUntouchedChunkMap,
  type GeneratedOffset,
} from "lingui-for-shared/compiler";

import type { SourcePosition } from "./types.ts";

/**
 * Creates a converter from character offsets within a source string to 1-based source-map positions.
 *
 * @param source Full original source text.
 * @returns A function that maps a zero-based character offset to a source-map line/column pair.
 *
 * The returned mapper is used while synthesizing JS/TS snippets from `.svelte` sources so emitted
 * mappings can point back to the correct original location.
 */
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
      lineStarts[lineIndex + 1] <= offset
    ) {
      lineIndex += 1;
    }

    return {
      line: lineIndex + 1,
      column: offset - lineStarts[lineIndex],
    };
  };
}

/**
 * Adds one mapping per generated line for a copied snippet.
 *
 * @param generator Source-map generator receiving the mappings.
 * @param filename Logical original filename recorded in the map.
 * @param generatedStartLine 1-based line number where the snippet starts in generated output.
 * @param snippet Generated snippet text whose lines should be mapped.
 * @param originalStartOffset Zero-based offset in the original source where the snippet starts.
 * @param toPosition Offset-to-position converter for the original source.
 * @returns The number of generated lines represented by the snippet.
 *
 * This helper is used by both direct-program and synthetic-program mapping code to keep line mapping
 * logic consistent across transform stages.
 */
export function addLineMappings(
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

/**
 * Builds a simple source map for a snippet copied directly from the original source.
 *
 * @param source Full original source text.
 * @param filename Logical filename to embed in the source map.
 * @param originalStart Zero-based source offset where the snippet begins.
 * @param snippet Generated snippet copied from the original source.
 * @returns A raw source map whose generated file is the provided filename.
 *
 * This is used when a script block can be transformed independently without first building a larger
 * synthetic program.
 */
export function buildDirectProgramMap(
  source: string,
  filename: string,
  originalStart: number,
  snippet: string,
): RawSourceMap {
  return normalizeSourceMap(
    buildDirectProgramMapShared(
      source,
      filename,
      originalStart,
      snippet.length,
    ),
    filename,
    source,
  );
}

export function buildPrefixedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  prefix: string,
  originalLength: number,
): RawSourceMap {
  return normalizeSourceMap(
    buildPrefixedSnippetMapShared(
      source,
      filename,
      originalStart,
      prefix,
      originalLength,
    ),
    filename,
    source,
  );
}

export function buildGeneratedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  generated: string,
  originalLength: number,
): RawSourceMap {
  return normalizeSourceMap(
    buildGeneratedSnippetMapShared(
      source,
      filename,
      originalStart,
      generated,
      originalLength,
    ),
    filename,
    source,
  );
}

export function buildAnchoredGeneratedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  generated: string,
  originalLength: number,
  anchorOffset: number,
): RawSourceMap {
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

  return normalizeSourceMap(generator.toJSON(), filename, source);
}

export function buildAnchoredBoundarySnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  generated: string,
  originalLength: number,
  anchorOffset: number,
): RawSourceMap {
  const generator = new SourceMapGenerator({ file: filename });
  const toPosition = createOffsetToPosition(source);
  const generatedToPosition = createOffsetToPosition(generated);
  const originalEnd = originalStart + originalLength - 1;
  const clampedAnchor = Math.max(0, Math.min(anchorOffset, generated.length));

  for (let offset = 0; offset <= generated.length; offset += 1) {
    generator.addMapping({
      generated: generatedToPosition(offset),
      original:
        offset <= clampedAnchor
          ? toPosition(originalStart)
          : toPosition(originalEnd),
      source: filename,
    });
  }

  generator.setSourceContent(filename, source);

  return normalizeSourceMap(generator.toJSON(), filename, source);
}

export async function composeSourceMaps(
  outerMap: RawSourceMap,
  innerMap: RawSourceMap,
): Promise<RawSourceMap> {
  return await SourceMapConsumer.with(
    outerMap,
    null,
    async (outerConsumer) =>
      await SourceMapConsumer.with(innerMap, null, (innerConsumer) => {
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

export async function densifyGeneratedLineMappings(
  map: RawSourceMap,
  source: string,
  filename: string,
  generated: string,
  originalStart: number,
): Promise<RawSourceMap> {
  const generator = new SourceMapGenerator({
    file: map.file ?? filename,
  });
  const originalStartPosition = createOffsetToPosition(source)(originalStart);
  const lineCount = generated.split("\n").length;

  return await SourceMapConsumer.with(map, null, (consumer) => {
    let nextLineToSeed = 1;
    let lastOriginal = originalStartPosition;

    consumer.eachMapping((mapping) => {
      while (nextLineToSeed <= mapping.generatedLine) {
        generator.addMapping({
          generated: { line: nextLineToSeed, column: 0 },
          original: lastOriginal,
          source: filename,
        });
        nextLineToSeed += 1;
      }

      if (
        mapping.originalLine != null &&
        mapping.originalColumn != null &&
        mapping.source != null
      ) {
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
        lastOriginal = {
          line: mapping.originalLine,
          column: mapping.originalColumn,
        };
      }
    });

    while (nextLineToSeed <= lineCount) {
      generator.addMapping({
        generated: { line: nextLineToSeed, column: 0 },
        original: lastOriginal,
        source: filename,
      });
      nextLineToSeed += 1;
    }

    consumer.sources.forEach((sourceName) => {
      const content = consumer.sourceContentFor(sourceName, true);

      if (content != null) {
        generator.setSourceContent(sourceName, content);
      }
    });

    return normalizeSourceMap(generator.toJSON(), filename, source);
  });
}

function normalizeSourceMap(
  map: RawSourceMap,
  filename: string,
  source: string,
): RawSourceMap {
  return {
    ...map,
    file: filename,
    sources: [filename],
    sourcesContent: [source],
  };
}
