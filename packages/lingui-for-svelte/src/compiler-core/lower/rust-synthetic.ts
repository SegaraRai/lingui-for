import type { LinguiConfigNormalized } from "@lingui/conf";
import type { RichTextWhitespaceMode } from "../shared/types.ts";

import {
  buildSvelteCompilePlan,
  finishSvelteCompile,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import {
  parseCanonicalSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/internal-shared-compile";

import { transformProgram } from "./babel-transform.ts";

export interface SvelteLowerResult {
  code: string;
  map: CanonicalSourceMap | null;
  replacements: {
    start: number;
    end: number;
    code: string;
    map: CanonicalSourceMap | null;
  }[];
}

export async function lowerSvelteWithRustSynthetic(
  source: string,
  filename: string,
  linguiConfig: LinguiConfigNormalized,
  whitespace: RichTextWhitespaceMode = "auto",
): Promise<SvelteLowerResult | null> {
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
    replacements: finished.replacements.map((replacement) => ({
      start: replacement.start,
      end: replacement.end,
      code: replacement.code,
      map: parseCanonicalSourceMap(replacement.sourceMapJson),
    })),
  };
}

function resolveSvelteWhitespace(
  whitespace: RichTextWhitespaceMode,
): "jsx" | "svelte" | "astro" {
  return whitespace === "auto" ? "svelte" : whitespace;
}
