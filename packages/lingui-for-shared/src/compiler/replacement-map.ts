import MagicString from "magic-string";

import type {
  IndexedSourceMap,
  IndexedSourceMapSection,
  SourceMap,
} from "./source-map-types.ts";

export type GeneratedOffset = {
  line: number;
  column: number;
};

export type ReplacementChunk<TMap = SourceMap> = {
  start: number;
  end: number;
  code: string;
  map: TMap | null;
};

export function createUntouchedChunkMap(
  source: string,
  filename: string,
  start: number,
  end: number,
): SourceMap | null {
  if (end <= start) {
    return null;
  }

  const string = new MagicString(source, { filename }).snip(start, end);
  const map = string.generateMap({
    file: filename,
    hires: true,
    includeContent: true,
    source: filename,
  });

  map.file = filename;
  map.sources = [filename];
  map.sourcesContent = [source];

  return map;
}

export function createIndexedSourceMap(
  file: string,
  sections: IndexedSourceMapSection[],
): IndexedSourceMap {
  return {
    version: 3,
    file,
    names: [],
    mappings: "",
    sources: [],
    sections,
  };
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

export function buildOutputWithIndexedMap<TMap extends SourceMap>(
  source: string,
  mapFile: string,
  replacements: ReplacementChunk<TMap>[],
): { code: string; map: IndexedSourceMap } {
  const sorted = replacements
    .slice()
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const sections: IndexedSourceMapSection[] = [];
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
      sections.push({ offset, map: untouchedMap });
    }
    offset = advanceGeneratedOffset(offset, untouched);

    code += replacement.code;
    if (replacement.map) {
      sections.push({ offset, map: replacement.map });
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
    sections.push({ offset, map: tailMap });
  }

  return {
    code,
    map: {
      ...createIndexedSourceMap(mapFile, sections),
      sources: [mapFile],
      sourcesContent: [source],
    },
  };
}
