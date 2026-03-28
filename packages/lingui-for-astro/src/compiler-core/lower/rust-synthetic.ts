import type { LinguiConfigNormalized } from "@lingui/conf";

import {
  buildAstroCompilePlan,
  finishAstroCompile,
  type WhitespaceMode,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import {
  parseCanonicalSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

import type { RichTextWhitespaceMode } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";

export interface AstroLowerResult {
  code: string;
  map: CanonicalSourceMap | null;
}

export async function lowerAstroWithRustSynthetic(
  source: string,
  filename: string,
  linguiConfig: LinguiConfigNormalized,
  whitespace: RichTextWhitespaceMode,
): Promise<AstroLowerResult | null> {
  await initWasmOnce();

  const compilePlan = buildAstroCompilePlan({
    source,
    sourceName: filename,
    syntheticName: `${filename}?rust-compile.tsx`,
    whitespace: resolveAstroWhitespace(whitespace),
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

function resolveAstroWhitespace(
  whitespace: RichTextWhitespaceMode,
): WhitespaceMode {
  return whitespace === "auto" ? "astro" : whitespace;
}
