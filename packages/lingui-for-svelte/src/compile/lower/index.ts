import { type CanonicalSourceMap } from "@lingui-for/internal-shared-compile";

export interface SvelteLowerResult {
  code: string;
  map: CanonicalSourceMap | null;
  replacements: {
    start: number;
    end: number;
    code: string;
    map: CanonicalSourceMap | null;
  }[];
}
