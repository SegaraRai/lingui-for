import type { LinguiConfig } from "@lingui/conf";

import {
  buildSvelteCompilePlan,
  finishSvelteCompile,
  type RuntimeWarningOptions,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import {
  parseCanonicalSourceMap,
  toBabelSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

import {
  normalizeLinguiConfig,
  resolveSvelteWhitespace,
  type RichTextWhitespaceMode,
} from "../common/config.ts";
import { createSvelteFrameworkConventions } from "../common/conventions.ts";
import { lowerSvelteTransformPrograms } from "../lower/transform.ts";

/**
 * Options for {@link transformSvelte}.
 */
export interface LinguiSvelteTransformOptions {
  /**
   * Absolute or virtual filename used for diagnostics, source maps, and synthetic module naming.
   */
  filename: string;
  /**
   * Partial Lingui configuration to merge with the defaults required by `lingui-for-svelte`.
   */
  linguiConfig?: Partial<LinguiConfig> | undefined;
  /**
   * Additional package specifiers that should be recognized as Svelte macro packages.
   */
  sveltePackages?: readonly string[] | undefined;
  /**
   * Whitespace handling mode for rich-text Component Macros during compilation.
   *
   * Use the same mode in extraction and build transforms so catalog entries stay consistent with
   * the emitted runtime code.
   *
   * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros#svelte
   */
  whitespace?: RichTextWhitespaceMode | undefined;
  /**
   * Runtime warning configuration forwarded to the analyzer while compiling `.svelte` files.
   */
  runtimeWarnings?: RuntimeWarningOptions | undefined;
}

/**
 * Result returned by {@link transformSvelte}.
 */
export interface LinguiSvelteTransformResult {
  /**
   * Transformed `.svelte` source.
   */
  code: string;
  /**
   * Source map for the transformed file, or `null` when none is generated.
   */
  map: CanonicalSourceMap | null;
  /**
   * Intermediate artifacts from the transform process, useful for testing and debugging but not guaranteed.
   */
  artifacts: {
    /**
     * The synthetic TSX module produced by the Rust analyzer before any Babel/Lingui transforms run.
     */
    synthetic: LinguiSvelteTransformArtifact;
    /**
     * The Babel/Lingui transform of the synthetic module before framework contextual runtime rewriting.
     */
    lowered: LinguiSvelteTransformArtifact;
    /**
     * The Babel/Lingui transform of the synthetic module with framework runtime bindings applied.
     */
    contextual: LinguiSvelteTransformArtifact;
    /**
     * The final `.svelte` output after Rust reinserts the transformed declarations into the original source.
     */
    final: LinguiSvelteTransformArtifact;
  };
}

/**
 * One intermediate or final output from the Svelte transform pipeline together with its source map.
 */
export interface LinguiSvelteTransformArtifact {
  /**
   * Filename associated with this artifact, typically used for diagnostics and source map generation.
   * May be a virtual name for synthetic modules.
   */
  filename: string;
  /**
   * Transformed source code for this artifact.
   */
  code: string;
  /**
   * Source map for the transformed file, or `null` when none is generated.
   */
  map: CanonicalSourceMap | null;
}

/**
 * Transforms one `.svelte` source string for runtime use.
 *
 * @param source Original `.svelte` source.
 * @param options Transform options including filename and optional Lingui config.
 * @returns Rewritten source, source map, and intermediate artifacts, or `null` when the file
 * contains no Lingui macros that require rewriting.
 *
 * This is the main Svelte entry point for runtime compilation. Rust handles analysis, planning, and
 * final lowering; JS runs the Lingui/Babel passes needed to produce the intermediate programs that
 * the Rust finisher stitches back into `.svelte` output.
 */
export async function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): Promise<LinguiSvelteTransformResult | null> {
  const {
    filename,
    linguiConfig: linguiConfigPartial,
    sveltePackages,
    whitespace = "auto",
    runtimeWarnings,
  } = options;
  const linguiConfig = normalizeLinguiConfig(linguiConfigPartial, {
    sveltePackages,
  });

  await initWasmOnce();

  const compilePlan = buildSvelteCompilePlan({
    source,
    sourceName: filename,
    syntheticName: `${filename}?rust-compile.tsx`,
    whitespace: resolveSvelteWhitespace(whitespace),
    runtimeWarnings,
    conventions: createSvelteFrameworkConventions(linguiConfig, {
      sveltePackages,
    }),
  });
  if (compilePlan.common.declarationIds.length === 0) {
    return null;
  }

  const syntheticMap = parseCanonicalSourceMap(
    compilePlan.common.syntheticSourceMapJson,
  );
  const runtimeBindings = {
    createLinguiAccessors: compilePlan.runtimeBindings.createLinguiAccessors,
    context: compilePlan.runtimeBindings.context,
    getI18n: compilePlan.runtimeBindings.getI18n,
    translate: compilePlan.runtimeBindings.translate,
    reactiveTranslationWrapper:
      compilePlan.runtimeBindings.reactiveTranslationWrapper,
    eagerTranslationWrapper:
      compilePlan.runtimeBindings.eagerTranslationWrapper,
  };
  const loweredFilename = `${compilePlan.common.syntheticName}?lowered`;
  const contextualFilename = `${compilePlan.common.syntheticName}?contextual`;
  const { lowered, contextual } = lowerSvelteTransformPrograms(
    compilePlan.common.syntheticSource,
    {
      loweredFilename,
      contextualFilename,
      inputSourceMap: toBabelSourceMap(syntheticMap),
      lang: compilePlan.common.syntheticLang,
      linguiConfig,
      runtimeBindings,
    },
  );

  const finished = finishSvelteCompile({
    plan: compilePlan,
    source,
    transformedPrograms: {
      loweredCode: lowered.code,
      loweredSourceMapJson:
        lowered.map != null ? JSON.stringify(lowered.map) : undefined,
      contextualCode: contextual.code,
      contextualSourceMapJson:
        contextual.map != null ? JSON.stringify(contextual.map) : undefined,
    },
  });
  const finalMap = parseCanonicalSourceMap(finished.sourceMapJson);

  return {
    code: finished.code,
    map: finalMap,
    artifacts: {
      synthetic: {
        filename: compilePlan.common.syntheticName,
        code: compilePlan.common.syntheticSource,
        map: syntheticMap,
      },
      lowered: {
        filename: lowered.filename,
        code: lowered.code,
        map: lowered.map,
      },
      contextual: {
        filename: contextual.filename,
        code: contextual.code,
        map: contextual.map,
      },
      final: {
        filename,
        code: finished.code,
        map: finalMap,
      },
    },
  };
}
