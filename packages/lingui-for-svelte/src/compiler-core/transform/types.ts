import type { RawSourceMap } from "source-map";

export type SvelteTransformResult = {
  code: string;
  map: RawSourceMap;
};
