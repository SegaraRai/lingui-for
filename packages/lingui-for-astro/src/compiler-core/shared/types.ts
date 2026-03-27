import type { LinguiConfig } from "@lingui/conf";

export type RichTextWhitespaceMode = "jsx" | "auto" | "astro" | "svelte";

export interface LinguiAstroTransformOptions {
  filename: string;
  linguiConfig?: Partial<LinguiConfig> | undefined;
  whitespace?: RichTextWhitespaceMode | undefined;
}
