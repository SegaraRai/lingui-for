import type { LinguiConfig } from "@lingui/conf";

export interface LinguiAstroPluginOptions {
  linguiConfig?: Partial<LinguiConfig> | undefined;
}
