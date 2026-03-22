import {
  addMapping,
  GenMapping,
  setSourceContent,
  toEncodedMap,
  type EncodedSourceMap,
} from "@jridgewell/gen-mapping";
import {
  eachMapping,
  originalPositionFor,
  sourceContentFor,
  TraceMap,
} from "@jridgewell/trace-mapping";

import {
  buildDirectProgramMap as buildDirectProgramMapShared,
  buildGeneratedSnippetMap as buildGeneratedSnippetMapShared,
  buildPrefixedSnippetMap as buildPrefixedSnippetMapShared,
} from "lingui-for-shared/compiler";

import type { SourcePosition } from "./types.ts";

export {
  advanceGeneratedOffset,
  createUntouchedChunkMap,
  type GeneratedOffset,
} from "lingui-for-shared/compiler";

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
 * @param gen Source-map generator receiving the mappings.
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
  gen: GenMapping,
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
    addMapping(gen, {
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
): EncodedSourceMap {
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
): EncodedSourceMap {
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
): EncodedSourceMap {
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
): EncodedSourceMap {
  const gen = new GenMapping({ file: filename });
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

    addMapping(gen, {
      generated: generatedToPosition(offset),
      original: toPosition(originalOffset),
      source: filename,
    });
  }

  setSourceContent(gen, filename, source);

  return normalizeSourceMap(toEncodedMap(gen), filename, source);
}

export function buildAnchoredBoundarySnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  generated: string,
  originalLength: number,
  anchorOffset: number,
): EncodedSourceMap {
  const gen = new GenMapping({ file: filename });
  const toPosition = createOffsetToPosition(source);
  const generatedToPosition = createOffsetToPosition(generated);
  const originalEnd = originalStart + originalLength - 1;
  const clampedAnchor = Math.max(0, Math.min(anchorOffset, generated.length));

  for (let offset = 0; offset <= generated.length; offset += 1) {
    addMapping(gen, {
      generated: generatedToPosition(offset),
      original:
        offset <= clampedAnchor
          ? toPosition(originalStart)
          : toPosition(originalEnd),
      source: filename,
    });
  }

  setSourceContent(gen, filename, source);

  return normalizeSourceMap(toEncodedMap(gen), filename, source);
}

export function composeSourceMaps(
  outerMap: EncodedSourceMap,
  innerMap: EncodedSourceMap,
): EncodedSourceMap {
  const gen = new GenMapping({
    file: outerMap.file ?? innerMap.file,
  });

  const outer = new TraceMap(outerMap);
  const inner = new TraceMap(innerMap);

  eachMapping(outer, (mapping) => {
    if (
      mapping.originalLine == null ||
      mapping.originalColumn == null ||
      mapping.source == null
    ) {
      return;
    }

    const original = originalPositionFor(inner, {
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

    const base = {
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      original: {
        line: original.line,
        column: original.column,
      },
      source: original.source,
    };
    const name = original.name ?? mapping.name;
    if (name == null) {
      addMapping(gen, base);
    } else {
      addMapping(gen, {
        ...base,
        name,
      });
    }
  });

  inner.sources.forEach((source) => {
    if (source == null) return;
    const content = sourceContentFor(inner, source);
    if (content != null) {
      setSourceContent(gen, source, content);
    }
  });

  return toEncodedMap(gen);
}

export function densifyGeneratedLineMappings(
  map: EncodedSourceMap,
  source: string,
  filename: string,
  generated: string,
  originalStart: number,
): EncodedSourceMap {
  const gen = new GenMapping({
    file: map.file ?? filename,
  });
  const originalStartPosition = createOffsetToPosition(source)(originalStart);
  const lineCount = generated.split("\n").length;
  const tracer = new TraceMap(map);

  let nextLineToSeed = 1;
  let lastOriginal = originalStartPosition;

  eachMapping(tracer, (mapping) => {
    while (nextLineToSeed <= mapping.generatedLine) {
      addMapping(gen, {
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
      const base = {
        generated: {
          line: mapping.generatedLine,
          column: mapping.generatedColumn,
        },
        original: {
          line: mapping.originalLine,
          column: mapping.originalColumn,
        },
        source: mapping.source,
      };
      const name = mapping.name;
      if (name == null) {
        addMapping(gen, base);
      } else {
        addMapping(gen, {
          ...base,
          name,
        });
      }
      lastOriginal = {
        line: mapping.originalLine,
        column: mapping.originalColumn,
      };
    }
  });

  while (nextLineToSeed <= lineCount) {
    addMapping(gen, {
      generated: { line: nextLineToSeed, column: 0 },
      original: lastOriginal,
      source: filename,
    });
    nextLineToSeed += 1;
  }

  tracer.sources.forEach((sourceName) => {
    if (sourceName == null) return;
    const content = sourceContentFor(tracer, sourceName);
    if (content != null) {
      setSourceContent(gen, sourceName, content);
    }
  });

  return normalizeSourceMap(toEncodedMap(gen), filename, source);
}

function normalizeSourceMap(
  map: EncodedSourceMap,
  filename: string,
  source: string,
): EncodedSourceMap {
  return {
    ...map,
    file: filename,
    sources: [filename],
    sourcesContent: [source],
  };
}
