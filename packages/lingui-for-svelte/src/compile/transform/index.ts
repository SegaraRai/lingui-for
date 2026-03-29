import type { LinguiConfig } from "@lingui/conf";

import {
  buildSvelteCompilePlan,
  finishSvelteCompile,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import {
  parseCanonicalSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

import {
  normalizeLinguiConfig,
  resolveSvelteWhitespace,
  type RichTextWhitespaceMode,
} from "../common/config.ts";
import { createSvelteFrameworkConventions } from "../common/conventions.ts";
import { transformProgram } from "../lower/babel-transform.ts";

export type { RichTextWhitespaceMode } from "../common/config.ts";

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
   * @see https://lingui-for.roundtrip.dev/guides/whitespace-in-component-macros
   */
  whitespace?: RichTextWhitespaceMode | undefined;
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
}

/**
 * Transforms one `.svelte` source file in place for runtime use.
 *
 * @param source Original `.svelte` source.
 * @param options Transform options including filename and optional Lingui config.
 * @returns Rewritten source and source map, or `null` when the file contains no Lingui macros that
 * require rewriting.
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
    conventions: createSvelteFrameworkConventions(linguiConfig, {
      sveltePackages,
    }),
  });
  if (compilePlan.common.declarationIds.length === 0) {
    return null;
  }

  const runtimeBindings = {
    createLinguiAccessors: compilePlan.runtimeBindings.createLinguiAccessors,
    context: compilePlan.runtimeBindings.context,
    getI18n: compilePlan.runtimeBindings.getI18n,
    translate: compilePlan.runtimeBindings.translate,
  };
  const raw = transformProgram(compilePlan.common.syntheticSource, {
    extract: false,
    filename: `${compilePlan.common.syntheticName}?raw`,
    lang: compilePlan.common.syntheticLang,
    linguiConfig,
    translationMode: "raw",
  });
  const svelteContext = transformProgram(compilePlan.common.syntheticSource, {
    extract: false,
    filename: `${compilePlan.common.syntheticName}?svelte-context`,
    lang: compilePlan.common.syntheticLang,
    linguiConfig,
    translationMode: "svelte-context",
    runtimeBindings,
  });

  const finished = finishSvelteCompile({
    plan: compilePlan,
    source,
    transformedPrograms: {
      rawCode: raw.code,
      rawSourceMapJson: raw.map != null ? JSON.stringify(raw.map) : undefined,
      contextCode: svelteContext.code,
      contextSourceMapJson:
        svelteContext.map != null
          ? JSON.stringify(svelteContext.map)
          : undefined,
    },
  });

  return {
    code: finished.code,
    map: parseCanonicalSourceMap(finished.sourceMapJson),
  };
}
