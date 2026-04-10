import type { LinguiConfigNormalized } from "@lingui/conf";

import {
  buildAstroCompilePlan,
  finishAstroCompile,
} from "@lingui-for/framework-core/compile";
import { initWasmOnce } from "@lingui-for/framework-core/compile/wasm-loader";
import {
  parseCanonicalSourceMap,
  toBabelSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/framework-core/compile";

import {
  resolveAstroWhitespace,
  type LinguiAstroFrameworkConfig,
} from "../common/config.ts";
import { createAstroFrameworkConventions } from "../common/conventions.ts";
import { lowerAstroTransformProgram } from "../lower/transform.ts";

/**
 * Options for {@link transformAstro}.
 */
export interface LinguiAstroTransformOptions {
  /**
   * Absolute or virtual filename used for diagnostics, source maps, and synthetic module naming.
   */
  filename: string;
  /**
   * Fully resolved Lingui config to use for this transform.
   */
  linguiConfig: LinguiConfigNormalized;
  /**
   * Fully resolved Astro framework config to use for this transform.
   */
  frameworkConfig: LinguiAstroFrameworkConfig;
}

/**
 * Result returned by {@link transformAstro}.
 */
export interface LinguiAstroTransformResult {
  /**
   * Transformed `.astro` source.
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
    synthetic: LinguiAstroTransformArtifact;
    /**
     * The Babel/Lingui transform of the synthetic module with Astro runtime bindings applied.
     */
    contextual: LinguiAstroTransformArtifact;
    /**
     * The final `.astro` output after Rust reinserts the transformed declarations into the original source.
     */
    final: LinguiAstroTransformArtifact;
  };
}

/**
 * One intermediate or final output from the Astro transform pipeline together with its source map.
 */
export interface LinguiAstroTransformArtifact {
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
 * Transforms one `.astro` source string for runtime use.
 *
 * @param source Original `.astro` source.
 * @param options Transform options including filename and fully resolved config.
 * @returns Rewritten source, source map, and intermediate artifacts, or `null` when the file
 * contains no Lingui macros that require rewriting.
 *
 * This is the main Astro entry point for runtime compilation. Rust handles analysis, planning, and
 * final lowering; JS runs the Lingui/Babel passes needed to produce the intermediate programs that
 * the Rust finisher stitches back into `.astro` output.
 */
export async function transformAstro(
  source: string,
  options: LinguiAstroTransformOptions,
): Promise<LinguiAstroTransformResult | null> {
  const { filename, linguiConfig, frameworkConfig } = options;

  await initWasmOnce();

  const compilePlan = buildAstroCompilePlan({
    source,
    sourceName: filename,
    syntheticName: `${filename}?rust-compile.tsx`,
    whitespace: resolveAstroWhitespace(frameworkConfig.whitespace ?? "auto"),
    runtimeWarnings: frameworkConfig.runtimeWarnings,
    conventions: createAstroFrameworkConventions(linguiConfig, {
      packages: frameworkConfig.packages,
    }),
  });
  if (compilePlan.common.declarationIds.length === 0) {
    return null;
  }

  const syntheticMap = parseCanonicalSourceMap(
    compilePlan.common.syntheticSourceMapJson,
  );
  const contextualFilename = `${compilePlan.common.syntheticName}?contextual`;
  const contextual = lowerAstroTransformProgram(
    compilePlan.common.syntheticSource,
    {
      filename: contextualFilename,
      linguiConfig,
      inputSourceMap: toBabelSourceMap(syntheticMap),
      runtimeBinding: compilePlan.runtimeBindings.i18n,
    },
  );

  const finished = finishAstroCompile({
    plan: compilePlan,
    source,
    transformedPrograms: {
      contextualCode: contextual.code,
      contextualSourceMapJson:
        contextual.map != null ? JSON.stringify(contextual.map) : undefined,
      loweredCode: undefined,
      loweredSourceMapJson: undefined,
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
      contextual: {
        filename: contextualFilename,
        code: contextual.code,
        map: contextual.map ?? null,
      },
      final: {
        filename,
        code: finished.code,
        map: finalMap,
      },
    },
  };
}
