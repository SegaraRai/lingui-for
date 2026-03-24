import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { EncodedSourceMap } from "@jridgewell/gen-mapping";
import type { LinguiConfigNormalized } from "@lingui/conf";

import {
  buildCompilePlanWithOptions,
  finishCompileWithOptions,
  initSync,
} from "lingui-analyzer-wasm";

import type { SvelteTransformResult } from "../transform/types.ts";
import { transformProgram } from "./babel-transform.ts";

type CompileRuntimeBindings = {
  create_lingui_accessors: string;
  context: string;
  get_i18n: string;
  translate: string;
  trans_component: string;
};

type CompilePlan = {
  source_name: string;
  synthetic_source: string;
  synthetic_name: string;
  synthetic_lang: "js" | "ts";
  declaration_ids: readonly string[];
  runtime_bindings?: CompileRuntimeBindings | null;
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

export type SvelteRustLoweredResult = SvelteTransformResult & {
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
  svelte_context_code?: string;
  svelte_context_source_map_json?: string | null;
  astro_context_code?: string;
  astro_context_source_map_json?: string | null;
};

let wasmInitialized = false;

export function lowerSvelteWithRustSynthetic(
  source: string,
  filename: string,
  linguiConfig: LinguiConfigNormalized,
): SvelteRustLoweredResult | null {
  const compilePlan = buildCompilePlan(source, filename);
  if (compilePlan.declaration_ids.length === 0) {
    return null;
  }

  const runtimeBindings = compilePlan.runtime_bindings
    ? {
        createLinguiAccessors:
          compilePlan.runtime_bindings.create_lingui_accessors,
        context: compilePlan.runtime_bindings.context,
        getI18n: compilePlan.runtime_bindings.get_i18n,
        translate: compilePlan.runtime_bindings.translate,
      }
    : undefined;
  const raw = transformProgram(compilePlan.synthetic_source, {
    extract: false,
    filename: `${compilePlan.synthetic_name}?raw`,
    lang: compilePlan.synthetic_lang,
    linguiConfig,
    translationMode: "raw",
  });
  const svelteContext = transformProgram(compilePlan.synthetic_source, {
    extract: false,
    filename: `${compilePlan.synthetic_name}?svelte-context`,
    lang: compilePlan.synthetic_lang,
    linguiConfig,
    translationMode: "svelte-context",
    ...(runtimeBindings ? { runtimeBindings } : {}),
  });

  const transformedPrograms: TransformedPrograms = {
    raw_code: raw.code,
    raw_source_map_json: raw.map != null ? JSON.stringify(raw.map) : null,
    svelte_context_code: svelteContext.code,
    svelte_context_source_map_json:
      svelteContext.map != null ? JSON.stringify(svelteContext.map) : null,
  };

  const finished = finishCompileWithOptions({
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

function buildCompilePlan(source: string, filename: string): CompilePlan {
  ensureWasmInitialized();
  return buildCompilePlanWithOptions({
    framework: "svelte",
    source,
    source_name: filename,
    synthetic_name: `${filename}?rust-compile.tsx`,
  }) as CompilePlan;
}

function ensureWasmInitialized(): void {
  if (wasmInitialized) {
    return;
  }

  const wasmPath = fileURLToPath(
    import.meta.resolve("lingui-analyzer-wasm/wasm"),
  );
  initSync({ module: readFileSync(wasmPath) });
  wasmInitialized = true;
}
