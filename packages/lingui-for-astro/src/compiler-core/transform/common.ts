import type { RawSourceMap } from "source-map";

export type MappedSnippet = {
  code: string;
  map: RawSourceMap | null;
};
