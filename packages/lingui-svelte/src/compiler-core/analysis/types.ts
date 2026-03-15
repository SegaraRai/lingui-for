import type { AST } from "svelte/compiler";

import type { ScriptKind, ScriptLang } from "../shared/types.ts";

/**
 * Minimal source range shared by analysis results extracted from a `.svelte` file.
 *
 * Both offsets are zero-based indexes into the original source string.
 */
export type RangeNode = {
  start: number;
  end: number;
};

/**
 * Metadata for one `<script>` block discovered during Svelte analysis.
 *
 * The block records both the outer tag range and the inner content range so later transform stages
 * can either rewrite the script body or map generated code back to the original component.
 */
export type ScriptBlock = {
  kind: ScriptKind;
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  content: string;
  lang: ScriptLang;
  attributes: AST.Attribute[];
};

/**
 * A markup expression from the template portion of a `.svelte` component that references macros.
 *
 * @property index Stable ordinal used to generate synthetic variable names.
 * @property source Original source slice for the expression.
 */
export type MarkupExpression = RangeNode & {
  index: number;
  source: string;
};

/**
 * A component macro occurrence such as `<Trans>` or `<Plural>` found in template markup.
 *
 * @property index Stable ordinal used to generate synthetic variable names.
 * @property name Original component tag name as written in source.
 * @property source Original source slice for the component invocation.
 */
export type MacroComponent = RangeNode & {
  index: number;
  name: string;
  source: string;
};

/**
 * Complete result of analyzing a `.svelte` source file before transform/extraction.
 *
 * The analysis separates script blocks from macro-using template expressions and component macros
 * so later pipeline stages can build synthetic programs and patch the rewritten output back into
 * the original component source.
 */
export type SvelteAnalysis = {
  instance: ScriptBlock | null;
  module: ScriptBlock | null;
  expressions: MarkupExpression[];
  components: MacroComponent[];
};
