import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";
import type { RawSourceMap } from "source-map";

import type { ScriptLang } from "../shared/types.ts";

/**
 * 1-based source-map position used when converting character offsets into mappings.
 *
 * `line` is 1-based to match source-map conventions, while `column` is 0-based.
 */
export type SourcePosition = {
  line: number;
  column: number;
};

/**
 * One extraction-ready JS/TS unit produced from a source file.
 */
export type ExtractionUnit = {
  /**
   * Generated code that can be handed to Lingui's extractor.
   */
  code: string;
  /**
   * Optional source map back to the original source. `null` is used when no map is
   * needed or cannot be produced for the unit.
   */
  map: RawSourceMap | null;
};

/**
 * Result of running the shared Babel/Lingui transform over a synthetic or direct program.
 */
export type ProgramTransform = {
  /**
   * Final transformed code emitted by Babel.
   */
  code: string;
  /**
   * Transformed Babel AST used by later lowering steps.
   */
  ast: BabelTypes.File;
  /**
   * Optional raw source map emitted by Babel.
   */
  map: RawSourceMap | null;
};

/**
 * One generated code fragment paired with an optional source map.
 */
export type MappedCodeFragment = {
  code: string;
  map: ProgramTransform["map"];
};

/**
 * Runtime bindings injected into transformed Svelte code when the transform detects they are needed.
 */
export type RuntimeBindingsForTransform = {
  createLinguiAccessors: string;
  context: string;
  getI18n: string;
  translate: string;
};

/**
 * Input contract for the shared Babel/Lingui transform.
 */
export type ProgramTransformRequest = {
  /**
   * Logical filename for parser behavior and diagnostics.
   */
  filename: string;
  /**
   * Parser mode used for Babel plugins.
   */
  lang: ScriptLang;
  /**
   * Normalized Lingui configuration consumed by the Lingui macro plugin.
   */
  linguiConfig: LinguiConfigNormalized;
  /**
   * Whether the transform runs in extraction mode.
   */
  extract: boolean;
  /**
   * How string-producing macros should lower after Lingui processing.
   */
  translationMode: "extract" | "raw" | "svelte-context";
  /**
   * Optional Svelte runtime binding names injected into rewritten code.
   */
  runtimeBindings?: RuntimeBindingsForTransform | undefined;
  /**
   * Optional upstream source map chained into the Babel transform.
   */
  inputSourceMap?: RawSourceMap;
};

/**
 * Result of rewriting a `.svelte` component source file.
 */
export type SvelteTransformResult = {
  /**
   * Final rewritten Svelte source.
   */
  code: string;
  /**
   * Source map from the rewritten component back to the original.
   */
  map: RawSourceMap;
};
