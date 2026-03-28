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
import { transformProgram } from "../lower/babel-transform.ts";

export type { RichTextWhitespaceMode } from "../common/config.ts";

export interface LinguiSvelteTransformOptions {
  filename: string;
  linguiConfig?: Partial<LinguiConfig> | undefined;
  whitespace?: RichTextWhitespaceMode | undefined;
}

/**
 * Result returned by `transformSvelte`.
 */
export interface SvelteTransformResult {
  /**
   * Transformed `.svelte` source.
   */
  code: string;
  /**
   * Source map for the transformed file, or `null` when none is generated.
   */
  map: CanonicalSourceMap | null;
}

export async function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): Promise<SvelteTransformResult | null> {
  const {
    filename,
    linguiConfig: linguiConfigPartial,
    whitespace = "auto",
  } = options;
  const linguiConfig = normalizeLinguiConfig(linguiConfigPartial);

  await initWasmOnce();

  const compilePlan = buildSvelteCompilePlan({
    source,
    sourceName: filename,
    syntheticName: `${filename}?rust-compile.tsx`,
    whitespace: resolveSvelteWhitespace(whitespace),
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
