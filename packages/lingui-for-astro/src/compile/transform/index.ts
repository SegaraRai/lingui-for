import type { LinguiConfig } from "@lingui/conf";

import {
  buildAstroCompilePlan,
  finishAstroCompile,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import type { CanonicalSourceMap } from "@lingui-for/internal-shared-compile";
import {
  parseCanonicalSourceMap,
  toBabelSourceMap,
} from "@lingui-for/internal-shared-compile";

import {
  normalizeLinguiConfig,
  resolveAstroWhitespace,
  type RichTextWhitespaceMode,
} from "../common/config.ts";
import { createAstroFrameworkConventions } from "../common/conventions.ts";
import { transformProgram } from "../lower/babel-transform.ts";

export type { RichTextWhitespaceMode } from "../common/config.ts";

/**
 * Options for {@link transformAstro}.
 */
export interface LinguiAstroTransformOptions {
  /**
   * Absolute or virtual filename used for diagnostics, source maps, and synthetic module naming.
   */
  filename: string;
  /**
   * Partial Lingui configuration to merge with the defaults required by `lingui-for-astro`.
   */
  linguiConfig?: Partial<LinguiConfig> | undefined;
  /**
   * Additional package specifiers that should be recognized as Astro macro packages.
   */
  astroPackages?: readonly string[] | undefined;
  /**
   * Whitespace handling mode for rich-text Component Macros during compilation.
   *
   * Use the same mode in extraction and build transforms so catalog entries stay consistent with
   * the emitted runtime code.
   *
   * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros#astro
   */
  whitespace?: RichTextWhitespaceMode | undefined;
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
}

/**
 * Transforms one `.astro` source file in place for runtime use.
 *
 * @param source Original `.astro` source.
 * @param options Transform options including filename and optional Lingui config.
 * @returns Rewritten source and source map, or `null` when the file contains no Lingui macros that
 * require rewriting.
 *
 * This is the main Astro entry point for runtime compilation. Rust handles analysis, planning, and
 * final lowering; JS runs the Lingui/Babel passes needed to produce the intermediate programs that
 * the Rust finisher stitches back into `.astro` output.
 */
export async function transformAstro(
  source: string,
  options: LinguiAstroTransformOptions,
): Promise<LinguiAstroTransformResult | null> {
  const {
    filename,
    linguiConfig: linguiConfigPartial,
    astroPackages,
    whitespace = "auto",
  } = options;
  const linguiConfig = normalizeLinguiConfig(linguiConfigPartial, {
    astroPackages,
  });

  await initWasmOnce();

  const compilePlan = buildAstroCompilePlan({
    source,
    sourceName: filename,
    syntheticName: `${filename}?rust-compile.tsx`,
    whitespace: resolveAstroWhitespace(whitespace),
    conventions: createAstroFrameworkConventions(linguiConfig, {
      astroPackages,
    }),
  });
  if (compilePlan.common.declarationIds.length === 0) {
    return null;
  }

  const context = transformProgram(compilePlan.common.syntheticSource, {
    translationMode: "astro-context",
    filename: `${compilePlan.common.syntheticName}?astro-context`,
    linguiConfig,
    inputSourceMap: toBabelSourceMap(
      parseCanonicalSourceMap(compilePlan.common.syntheticSourceMapJson),
    ),
    runtimeBinding: compilePlan.runtimeBindings.i18n,
  });

  const finished = finishAstroCompile({
    plan: compilePlan,
    source,
    transformedPrograms: {
      contextCode: context.code,
      contextSourceMapJson:
        context.map != null ? JSON.stringify(context.map) : undefined,
      rawCode: undefined,
      rawSourceMapJson: undefined,
    },
  });

  return {
    code: finished.code,
    map: parseCanonicalSourceMap(finished.sourceMapJson),
  };
}
