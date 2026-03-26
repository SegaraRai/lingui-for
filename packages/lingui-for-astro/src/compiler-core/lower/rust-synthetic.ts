import type { EncodedSourceMap } from "@jridgewell/gen-mapping";
import type { LinguiConfigNormalized } from "@lingui/conf";

import {
  buildAstroCompilePlanWithOptions,
  finishAstroCompileWithOptions,
} from "@lingui-for/internal-lingui-analyzer-wasm";

import { transformProgram } from "./babel-transform.ts";

type CommonCompilePlan = {
  source_name: string;
  synthetic_source: string;
  synthetic_name: string;
  synthetic_lang: "js" | "ts";
  declaration_ids: readonly string[];
};

type CompileRuntimeBindings = {
  create_i18n: string;
  i18n: string;
  runtime_trans: string;
};

type AstroCompilePlan = {
  common: CommonCompilePlan;
  runtime_requirements: {
    needs_runtime_i18n_binding: boolean;
    needs_runtime_trans_component: boolean;
  };
  runtime_bindings: CompileRuntimeBindings;
  frontmatter?: unknown;
};

type FinishedCompile = {
  code: string;
  source_name: string;
  source_map_json?: string | null;
};

type TransformedPrograms = {
  context_code?: string;
  context_source_map_json?: string | null;
};

export function lowerAstroWithRustSynthetic(
  source: string,
  filename: string,
  linguiConfig: LinguiConfigNormalized,
): { code: string; map: EncodedSourceMap | null } | null {
  const compilePlan = buildCompilePlan(source, filename);
  if (compilePlan.common.declaration_ids.length === 0) {
    return null;
  }

  const context = transformProgram(compilePlan.common.synthetic_source, {
    translationMode: "astro-context",
    filename: `${compilePlan.common.synthetic_name}?astro-context`,
    linguiConfig,
    runtimeBinding: compilePlan.runtime_bindings.i18n,
  });

  const finished = finishAstroCompileWithOptions({
    plan: compilePlan,
    source,
    transformed_programs: {
      context_code: context.code,
      context_source_map_json:
        context.map != null ? JSON.stringify(context.map) : null,
    } satisfies TransformedPrograms,
  }) as FinishedCompile;

  return {
    code: finished.code,
    map: JSON.parse(finished.source_map_json ?? "null") as EncodedSourceMap,
  };
}

function buildCompilePlan(source: string, filename: string): AstroCompilePlan {
  return buildAstroCompilePlanWithOptions({
    source,
    source_name: filename,
    synthetic_name: `${filename}?rust-compile.tsx`,
  }) as AstroCompilePlan;
}
