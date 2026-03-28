import type { LinguiConfig } from "@lingui/conf";
import {
  buildAstroCompilePlan,
  finishAstroCompile,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import type { CanonicalSourceMap } from "@lingui-for/internal-shared-compile";
import { parseCanonicalSourceMap } from "@lingui-for/internal-shared-compile";

import {
  normalizeLinguiConfig,
  resolveAstroWhitespace,
  type RichTextWhitespaceMode,
} from "../common/config.ts";
import { createAstroFrameworkConventions } from "../common/conventions.ts";
import { transformProgram } from "../lower/babel-transform.ts";

export type { RichTextWhitespaceMode } from "../common/config.ts";

export interface LinguiAstroTransformOptions {
  filename: string;
  linguiConfig?: Partial<LinguiConfig> | undefined;
  astroPackages?: readonly string[] | undefined;
  whitespace?: RichTextWhitespaceMode | undefined;
}

/**
 * Result returned by `transformAstro`.
 */
export interface AstroTransformResult {
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
 * @returns Rewritten source and source map.
 *
 * This is the main Astro entry point for runtime compilation. Rust handles analysis, planning, and
 * final lowering; JS only runs Babel/Lingui and returns the finished code and source map.
 */
export async function transformAstro(
  source: string,
  options: LinguiAstroTransformOptions,
): Promise<AstroTransformResult | null> {
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
