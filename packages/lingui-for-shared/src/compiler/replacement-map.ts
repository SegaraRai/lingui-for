import { eachMapping, TraceMap } from "@jridgewell/trace-mapping";
import {
  GenMapping,
  addMapping,
  setSourceContent,
  toEncodedMap,
  type EncodedSourceMap,
} from "@jridgewell/gen-mapping";

import { createOffsetToPosition } from "./source-map.ts";

export type ReplacementChunk = {
  start: number;
  end: number;
  code: string;
  map?: EncodedSourceMap | null;
};

type GeneratedOffset = {
  line: number;
  column: number;
};

export function createUntouchedChunkMap(
  source: string,
  filename: string,
  start: number,
  end: number,
): EncodedSourceMap | null {
  if (end <= start) {
    return null;
  }

  const snippet = source.slice(start, end);
  const gen = new GenMapping({ file: filename });
  const toOriginalPosition = createOffsetToPosition(source);
  const toSnippetPosition = createOffsetToPosition(snippet);

  for (let offset = 0; offset <= snippet.length; offset += 1) {
    addMapping(gen, {
      generated: toSnippetPosition(offset),
      original: toOriginalPosition(start + offset),
      source: filename,
    });
  }

  setSourceContent(gen, filename, source);

  return toEncodedMap(gen);
}

export function advanceGeneratedOffset(
  current: GeneratedOffset,
  code: string,
): GeneratedOffset {
  let line = current.line;
  let column = current.column;

  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function createBoundaryReplacementMap(
  source: string,
  filename: string,
  replacement: ReplacementChunk,
): EncodedSourceMap | null {
  if (replacement.code.length === 0 && replacement.start === replacement.end) {
    return null;
  }

  const gen = new GenMapping({ file: filename });
  const toGeneratedPosition = createOffsetToPosition(replacement.code);
  const toOriginalPosition = createOffsetToPosition(source);

  if (replacement.code.length === 0) {
    addMapping(gen, {
      generated: { line: 1, column: 0 },
      original: toOriginalPosition(replacement.end),
      source: filename,
    });
    setSourceContent(gen, filename, source);
    return toEncodedMap(gen);
  }

  addMapping(gen, {
    generated: { line: 1, column: 0 },
    original: toOriginalPosition(replacement.start),
    source: filename,
  });

  for (let index = 0; index < replacement.code.length; index += 1) {
    if (
      replacement.code[index] === "\n" &&
      index + 1 < replacement.code.length
    ) {
      addMapping(gen, {
        generated: toGeneratedPosition(index + 1),
        original: toOriginalPosition(replacement.start),
        source: filename,
      });
    }
  }

  addMapping(gen, {
    generated: toGeneratedPosition(replacement.code.length),
    original: toOriginalPosition(replacement.end),
    source: filename,
  });

  setSourceContent(gen, filename, source);

  return toEncodedMap(gen);
}

export function buildOutputWithIndexedMap(
  source: string,
  mapFile: string,
  replacements: ReplacementChunk[],
): { code: string; map: EncodedSourceMap } {
  const sorted = replacements
    .slice()
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const gen = new GenMapping({ file: mapFile });
  let cursor = 0;
  let code = "";
  let offset: GeneratedOffset = { line: 0, column: 0 };

  for (const replacement of sorted) {
    if (replacement.start < cursor) {
      continue;
    }

    const untouched = source.slice(cursor, replacement.start);
    const untouchedMap = createUntouchedChunkMap(
      source,
      mapFile,
      cursor,
      replacement.start,
    );

    code += untouched;
    if (untouchedMap) {
      applyChunkMappings(gen, untouchedMap, offset);
    }
    offset = advanceGeneratedOffset(offset, untouched);

    code += replacement.code;
    const replacementMap =
      replacement.map ??
      createBoundaryReplacementMap(source, mapFile, replacement);
    if (replacementMap) {
      applyChunkMappings(gen, replacementMap, offset);
    }
    offset = advanceGeneratedOffset(offset, replacement.code);
    cursor = replacement.end;
  }

  const tail = source.slice(cursor);
  const tailMap = createUntouchedChunkMap(
    source,
    mapFile,
    cursor,
    source.length,
  );

  code += tail;
  if (tailMap) {
    applyChunkMappings(gen, tailMap, offset);
  }

  setSourceContent(gen, mapFile, source);

  const map = toEncodedMap(gen);
  map.file = mapFile;
  map.sources = [mapFile];
  map.sourcesContent = [source];

  return { code, map };
}

function applyChunkMappings(
  gen: GenMapping,
  map: EncodedSourceMap,
  offset: GeneratedOffset,
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

    if (mapping.name != null) {
      addMapping(gen, {
        generated,
        original: {
          line: mapping.originalLine,
          column: mapping.originalColumn,
        },
        source: mapping.source,
        name: mapping.name,
      });
      return;
    }

    addMapping(gen, {
      generated,
      original: {
        line: mapping.originalLine,
        column: mapping.originalColumn,
      },
      source: mapping.source,
    });
  });
}
