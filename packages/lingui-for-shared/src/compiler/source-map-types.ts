import type { RawSourceMap } from "source-map";

export type FlatSourceMap = RawSourceMap;

export type IndexedSourceMapSection = {
  offset: {
    line: number;
    column: number;
  };
  map: SourceMap;
};

export type IndexedSourceMap = Omit<
  RawSourceMap,
  "mappings" | "sources" | "names"
> & {
  mappings: "";
  names: string[];
  sources: string[];
  sections: IndexedSourceMapSection[];
};

export type SourceMap = FlatSourceMap | IndexedSourceMap;

export function isIndexedSourceMap(map: SourceMap): map is IndexedSourceMap {
  return "sections" in map && Array.isArray(map.sections);
}
