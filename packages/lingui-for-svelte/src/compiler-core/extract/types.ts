import type { EncodedSourceMap } from "@jridgewell/gen-mapping";

export type ExtractionUnit = {
  code: string;
  map: EncodedSourceMap | null;
};
