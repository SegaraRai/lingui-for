import type { LinguiConfig } from "@lingui/conf";

export interface LinguiSveltePluginOptions {
  linguiConfig?: Partial<LinguiConfig> | undefined;
}
