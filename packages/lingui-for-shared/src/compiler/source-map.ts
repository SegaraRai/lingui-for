import type { TransformOptions } from "@babel/core";
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

export function addMappingHelper(
  gen: GenMapping,
  mapping: {
    generated: SourcePosition;
    original: SourcePosition;
    source: string;
    name: string | null;
  },
): void {
  const { name, ...base } = mapping;

  if (name == null) {
    addMapping(gen, base);
  } else {
    addMapping(gen, {
      ...base,
      name,
    });
  }
}

type InputSourceMap = NonNullable<TransformOptions["inputSourceMap"]>;
export function toBabelInputSourceMap(map: EncodedSourceMap): InputSourceMap {
  return map as InputSourceMap;
}

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

export function buildDirectProgramMap(
  source: string,
  filename: string,
  originalStart: number,
  originalLength: number,
): EncodedSourceMap {
  const snippet = source.slice(originalStart, originalStart + originalLength);
  const gen = new GenMapping({ file: filename });
  const toOriginalPosition = createOffsetToPosition(source);
  const toSnippetPosition = createOffsetToPosition(snippet);

  for (let offset = 0; offset <= snippet.length; offset += 1) {
    addMapping(gen, {
      generated: toSnippetPosition(offset),
      original: toOriginalPosition(originalStart + offset),
      source: filename,
    });
  }

  setSourceContent(gen, filename, snippet);

  return toEncodedMap(gen);
}

export function buildPrefixedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  prefix: string,
  originalLength: number,
): EncodedSourceMap {
  const originalPosition = createOffsetToPosition(source)(originalStart);
  const prefixPosition = createOffsetToPosition(prefix);
  const bodyMap = buildDirectProgramMap(
    source,
    filename,
    originalStart,
    originalLength,
  );
  const offsetBodyMap = offsetSourceMap(bodyMap, filename, prefix);
  const gen = new GenMapping({ file: filename });
  const prefixEnd = prefixPosition(prefix.length);

  for (let line = 1; line <= prefixEnd.line; line += 1) {
    const maxColumn =
      line === prefixEnd.line
        ? prefixEnd.column
        : (prefix.split("\n")[line - 1]?.length ?? 0);

    for (let column = 0; column <= maxColumn; column += 1) {
      addMapping(gen, {
        generated: { line, column },
        original: originalPosition,
        source: filename,
      });
    }
  }

  applyMappings(gen, offsetBodyMap);

  setSourceContent(gen, filename, source);

  return toEncodedMap(gen);
}

export function buildPrefixedMappedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  prefix: string,
  bodyMap: EncodedSourceMap,
): EncodedSourceMap {
  const originalPosition = createOffsetToPosition(source)(originalStart);
  const prefixPosition = createOffsetToPosition(prefix);
  const gen = new GenMapping({ file: filename });
  const prefixEnd = prefixPosition(prefix.length);

  for (let line = 1; line <= prefixEnd.line; line += 1) {
    const maxColumn =
      line === prefixEnd.line
        ? prefixEnd.column
        : (prefix.split("\n")[line - 1]?.length ?? 0);

    for (let column = 0; column <= maxColumn; column += 1) {
      addMapping(gen, {
        generated: { line, column },
        original: originalPosition,
        source: filename,
      });
    }
  }

  setSourceContent(gen, filename, source);

  applyMappingsWithOffset(gen, bodyMap, computeGeneratedOffset(prefix));

  return toEncodedMap(gen);
}

export function buildGeneratedSnippetMap(
  source: string,
  filename: string,
  originalStart: number,
  generated: string,
  originalLength: number,
): EncodedSourceMap {
  const gen = new GenMapping({ file: filename });
  const toPosition = createOffsetToPosition(source);
  const generatedToPosition = createOffsetToPosition(generated);
  const generatedLength = Math.max(generated.length, 1);

  for (let offset = 0; offset <= generated.length; offset += 1) {
    const ratio = offset / generatedLength;
    const originalOffset =
      originalStart +
      Math.min(Math.floor(ratio * originalLength), originalLength);

    addMapping(gen, {
      generated: generatedToPosition(offset),
      original: toPosition(originalOffset),
      source: filename,
    });
  }

  setSourceContent(gen, filename, source);

  return toEncodedMap(gen);
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

  return toEncodedMap(gen);
}

export function composeSourceMaps(
  outerMap: EncodedSourceMap,
  innerMap: EncodedSourceMap,
): EncodedSourceMap {
  const gen = new GenMapping({
    file: outerMap.file ?? innerMap.file ?? "",
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
      original?.line == null ||
      original.column == null ||
      original.source == null
    ) {
      return;
    }

    const name = original.name ?? mapping.name;
    addMappingHelper(gen, {
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      original: {
        line: original.line,
        column: original.column,
      },
      source: original.source,
      name,
    });
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

export function offsetSourceMap(
  map: EncodedSourceMap,
  file: string,
  prefix: string,
): EncodedSourceMap {
  const prefixOffset = computeGeneratedOffset(prefix);
  const gen = new GenMapping({ file });

  applyMappingsWithOffset(gen, map, prefixOffset);

  map.sources.forEach((source) => {
    if (source == null) return;
    const content = map.sourcesContent?.[map.sources.indexOf(source)] ?? null;
    if (content != null) {
      setSourceContent(gen, source, content);
    }
  });

  return toEncodedMap(gen);
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

function applyMappings(gen: GenMapping, map: EncodedSourceMap): void {
  applyMappingsWithOffset(gen, map, { line: 0, column: 0 });
}

function applyMappingsWithOffset(
  gen: GenMapping,
  map: EncodedSourceMap,
  offset: { line: number; column: number },
): void {
  const tracer = new TraceMap(map);

  eachMapping(tracer, (mapping) => {
    if (
      mapping.source == null ||
      mapping.originalLine == null ||
      mapping.originalColumn == null
    ) {
      return;
    }

    const generated = {
      line: offset.line + mapping.generatedLine,
      column:
        mapping.generatedLine === 1
          ? offset.column + mapping.generatedColumn
          : mapping.generatedColumn,
    };
    const original = {
      line: mapping.originalLine,
      column: mapping.originalColumn,
    };
    addMappingHelper(gen, {
      generated,
      original,
      source: mapping.source,
      name: mapping.name ?? null,
    });
  });
}
