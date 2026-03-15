import type * as BabelTypes from "@babel/types";
import type { LinguiConfigNormalized } from "@lingui/conf";
import type MagicString from "magic-string";
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
 *
 * @property code Generated code that can be handed to Lingui's extractor.
 * @property map Optional source map back to the original source. `null` is used when no map is
 * needed or cannot be produced for the unit.
 */
export type ExtractionUnit = {
  code: string;
  map: RawSourceMap | null;
};

/**
 * Result of running the shared Babel/Lingui transform over a synthetic or direct program.
 *
 * @property code Final transformed code emitted by Babel.
 * @property ast Transformed Babel AST used by later lowering steps.
 * @property map Optional raw source map emitted by Babel.
 */
export type ProgramTransform = {
  code: string;
  ast: BabelTypes.File;
  map: RawSourceMap | null;
};

/**
 * Input contract for the shared Babel/Lingui transform.
 *
 * @property filename Logical filename for parser behavior and diagnostics.
 * @property lang Parser mode used for Babel plugins.
 * @property linguiConfig Normalized Lingui configuration consumed by the Lingui macro plugin.
 * @property extract Whether the transform runs in extraction mode.
 * @property translationMode How string-producing macros should lower after Lingui processing.
 * @property runtimeBindings Optional Svelte runtime binding names injected into rewritten code.
 * @property inputSourceMap Optional upstream source map chained into the Babel transform.
 */
export type ProgramTransformRequest = {
  filename: string;
  lang: ScriptLang;
  linguiConfig: LinguiConfigNormalized;
  extract: boolean;
  translationMode: "extract" | "raw" | "svelte-context";
  runtimeBindings?:
    | {
        getLinguiContext: string;
        context: string;
        i18n: string;
        translate: string;
      }
    | undefined;
  inputSourceMap?: RawSourceMap;
};

/**
 * Result of rewriting a `.svelte` component source file.
 *
 * @property code Final rewritten Svelte source.
 * @property map MagicString-generated source map from the rewritten component back to the original.
 */
export type SvelteTransformResult = {
  code: string;
  map: ReturnType<MagicString["generateMap"]>;
};
