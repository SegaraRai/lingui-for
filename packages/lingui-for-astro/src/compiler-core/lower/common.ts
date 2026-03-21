import type { RawSourceMap } from "source-map";

export type LoweringSourceMapOptions = {
  fullSource: string;
  sourceStart: number;
};

export type LoweredSnippet = {
  code: string;
  map: RawSourceMap | null;
};
