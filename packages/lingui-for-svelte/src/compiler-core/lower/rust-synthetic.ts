import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { EncodedSourceMap } from "@jridgewell/gen-mapping";
import type { LinguiConfigNormalized } from "@lingui/conf";

import {
  buildSvelteCompilePlanWithOptions,
  finishSvelteCompileWithOptions,
  initSync,
} from "@lingui-for/internal-lingui-analyzer-wasm";

import type { SvelteTransformResult } from "../transform/types.ts";
import { transformProgram } from "./babel-transform.ts";

type CompileRuntimeBindings = {
  create_lingui_accessors: string;
  context: string;
  get_i18n: string;
  translate: string;
  trans_component: string;
};

type CommonCompilePlan = {
  source_name: string;
  synthetic_source: string;
  synthetic_name: string;
  synthetic_lang: "js" | "ts";
  declaration_ids: readonly string[];
};

type SvelteCompilePlan = {
  common: CommonCompilePlan;
  runtime_bindings: CompileRuntimeBindings;
};

type FinishedCompile = {
  code: string;
  source_name: string;
  source_map_json?: string | null;
  replacements: Array<{
    start: number;
    end: number;
    code: string;
    source_map_json?: string | null;
  }>;
};

type SvelteRustLoweredResult = SvelteTransformResult & {
  replacements: Array<{
    start: number;
    end: number;
    code: string;
    map: EncodedSourceMap | null;
  }>;
};

type TransformedPrograms = {
  raw_code?: string;
  raw_source_map_json?: string | null;
  context_code?: string;
  context_source_map_json?: string | null;
};

let wasmInitialized = false;

export function lowerSvelteWithRustSynthetic(
  source: string,
  filename: string,
  linguiConfig: LinguiConfigNormalized,
): SvelteRustLoweredResult | null {
  const compilePlan = buildCompilePlan(source, filename);
  if (compilePlan.common.declaration_ids.length === 0) {
    return null;
  }

  const runtimeBindings = {
    createLinguiAccessors: compilePlan.runtime_bindings.create_lingui_accessors,
    context: compilePlan.runtime_bindings.context,
    getI18n: compilePlan.runtime_bindings.get_i18n,
    translate: compilePlan.runtime_bindings.translate,
  };
  const raw = transformProgram(compilePlan.common.synthetic_source, {
    extract: false,
    filename: `${compilePlan.common.synthetic_name}?raw`,
    lang: compilePlan.common.synthetic_lang,
    linguiConfig,
    translationMode: "raw",
  });
  const svelteContext = transformProgram(compilePlan.common.synthetic_source, {
    extract: false,
    filename: `${compilePlan.common.synthetic_name}?svelte-context`,
    lang: compilePlan.common.synthetic_lang,
    linguiConfig,
    translationMode: "svelte-context",
    runtimeBindings,
  });

  const transformedPrograms: TransformedPrograms = {
    raw_code: raw.code,
    raw_source_map_json: raw.map != null ? JSON.stringify(raw.map) : null,
    context_code: svelteContext.code,
    context_source_map_json:
      svelteContext.map != null ? JSON.stringify(svelteContext.map) : null,
  };

  const finished = finishSvelteCompileWithOptions({
    plan: compilePlan,
    source,
    transformed_programs: transformedPrograms,
  }) as FinishedCompile;

  return {
    code: finished.code,
    map: JSON.parse(finished.source_map_json ?? "null") as EncodedSourceMap,
    replacements: finished.replacements.map((replacement) => ({
      start: replacement.start,
      end: replacement.end,
      code: replacement.code,
      map:
        replacement.source_map_json != null
          ? (JSON.parse(replacement.source_map_json) as EncodedSourceMap)
          : null,
    })),
  };
}

function buildCompilePlan(source: string, filename: string): SvelteCompilePlan {
  ensureWasmInitialized();
  const plan = buildSvelteCompilePlanWithOptions({
    source,
    source_name: filename,
    synthetic_name: `${filename}?rust-compile.tsx`,
  }) as SvelteCompilePlan;
  return plan;
}

function ensureWasmInitialized(): void {
  if (wasmInitialized) {
    return;
  }

  const wasmPath = fileURLToPath(
    import.meta.resolve("@lingui-for/internal-lingui-analyzer-wasm/wasm"),
  );
  initSync({ module: readFileSync(wasmPath) });
  wasmInitialized = true;
}
