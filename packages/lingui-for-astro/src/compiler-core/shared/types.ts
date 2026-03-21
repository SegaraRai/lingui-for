import type { LinguiConfig } from "@lingui/conf";

export interface LinguiAstroTransformOptions {
  filename: string;
  linguiConfig?: Partial<LinguiConfig> | undefined;
}
