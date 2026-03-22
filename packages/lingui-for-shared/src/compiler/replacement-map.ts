import { eachMapping, TraceMap } from "@jridgewell/trace-mapping";
import {
  GenMapping,
  addMapping,
  setSourceContent,
  toEncodedMap,
  type EncodedSourceMap,
} from "@jridgewell/gen-mapping";

import { createOffsetToPosition } from "./source-map.ts";

export type GeneratedOffset = {
  line: number;
  column: number;
};

export type ReplacementChunk = {
  start: number;
  end: number;
  code: string;
  map: EncodedSourceMap | null;
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
    if (replacement.map) {
      applyChunkMappings(gen, replacement.map, offset);
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

  return { code, map: toEncodedMap(gen) };
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
    const original = {
      line: mapping.originalLine,
      column: mapping.originalColumn,
    };
    if (mapping.name != null) {
      addMapping(gen, {
        generated,
        original,
        source: mapping.source,
        name: mapping.name,
      });
    } else {
      addMapping(gen, { generated, original, source: mapping.source });
    }
  });
}
