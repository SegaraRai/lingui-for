import type { LinguiConfig } from "@lingui/conf";

import type { WhitespaceMode } from "@lingui-for/internal-lingui-analyzer-wasm";

/**
 * Controls how whitespace between rich-text child nodes in component macros is normalized before
 * the synthetic JSX pass runs.
 *
 * The `"auto"` mode defaults to `"astro"`.
 */
export type RichTextWhitespaceMode = "auto" | WhitespaceMode;

export interface LinguiAstroTransformOptions {
  filename: string;
  linguiConfig?: Partial<LinguiConfig> | undefined;
  whitespace?: RichTextWhitespaceMode | undefined;
}
