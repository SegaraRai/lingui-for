import MagicString from "magic-string";
import type { RawSourceMap } from "source-map";

export type GeneratedOffset = {
  line: number;
  column: number;
};

export type ReplacementChunk<TMap = RawSourceMap> = {
  start: number;
  end: number;
  code: string;
  map: TMap | null;
};

type IndexedSourceMapSection = {
  offset: {
    line: number;
    column: number;
  };
  map: RawSourceMap;
};

export function createUntouchedChunkMap(
  source: string,
  filename: string,
  start: number,
  end: number,
): RawSourceMap | null {
  if (end <= start) {
    return null;
  }

  const string = new MagicString(source, { filename }).snip(start, end);

  return string.generateMap({
    file: filename,
    hires: true,
    includeContent: true,
    source: filename,
  }) as never as RawSourceMap;
}

export function createIndexedSourceMap(
  file: string,
  sections: IndexedSourceMapSection[],
): RawSourceMap {
  return {
    version: 3,
    file,
    names: [],
    mappings: "",
    sources: [],
    sections,
  } as RawSourceMap;
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

export function buildOutputWithIndexedMap<TMap extends RawSourceMap>(
  source: string,
  mapFile: string,
  replacements: ReplacementChunk<TMap>[],
): { code: string; map: RawSourceMap } {
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
