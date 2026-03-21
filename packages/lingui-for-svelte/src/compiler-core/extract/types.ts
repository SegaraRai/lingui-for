import type { RawSourceMap } from "source-map";

export type ExtractionUnit = {
  code: string;
  map: RawSourceMap | null;
};
