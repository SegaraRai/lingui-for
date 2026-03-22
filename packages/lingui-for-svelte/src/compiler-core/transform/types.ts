import type { EncodedSourceMap } from "@jridgewell/gen-mapping";

export type SvelteTransformResult = {
  code: string;
  map: EncodedSourceMap;
};
