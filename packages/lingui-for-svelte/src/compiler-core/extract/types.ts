import type { SourceMap } from "lingui-for-shared/compiler";

export type ExtractionUnit = {
  code: string;
  map: SourceMap | null;
};
