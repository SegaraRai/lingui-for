import type { SourceMap } from "lingui-for-shared/compiler";

export type SvelteTransformResult = {
  code: string;
  map: SourceMap;
};
