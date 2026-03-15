import type { LinguiConfig } from "@lingui/conf";

export interface LinguiAstroTransformOptions {
  filename: string;
  linguiConfig?: Partial<LinguiConfig> | undefined;
}

export interface RawSourceMapLike {
  version: number;
  sources: string[];
  names: string[];
  mappings: string;
  file?: string | undefined;
  sourcesContent?: (string | null)[] | undefined;
}
