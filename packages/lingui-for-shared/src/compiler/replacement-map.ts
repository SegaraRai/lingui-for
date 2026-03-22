import {
  addMapping,
  GenMapping,
  setSourceContent,
  toEncodedMap,
  type EncodedSourceMap,
} from "@jridgewell/gen-mapping";
import { eachMapping, TraceMap } from "@jridgewell/trace-mapping";

import {
  addMapping2,
  computeGeneratedOffset,
  createOffsetToPosition,
  type SourcePosition,
} from "./source-map.ts";

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
  let offset: SourcePosition = { line: 0, column: 0 };

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
    offset = computeGeneratedOffset(untouched, offset);

    code += replacement.code;
    if (replacement.map) {
      applyChunkMappings(gen, replacement.map, offset);
    }
    offset = computeGeneratedOffset(replacement.code, offset);
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
  offset: SourcePosition,
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
    addMapping2(gen, {
      generated,
      original,
      source: mapping.source,
      name: mapping.name,
    });
  });
}
