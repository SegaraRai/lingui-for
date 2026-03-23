import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { NodePath } from "@babel/core";
import generateModule from "@babel/generator";
import type { File, VariableDeclarator } from "@babel/types";
import {
  buildCompilePlanWithOptions,
  finishCompileWithOptions,
  initSync,
} from "lingui-analyzer-wasm";
import type { EncodedSourceMap } from "@jridgewell/gen-mapping";

import { babelTraverse } from "lingui-for-shared/compiler";

import type { LinguiConfigNormalized } from "@lingui/conf";
import { transformProgram } from "./babel-transform.ts";

const generate = getBabelGenerate();

type CompileRuntimeBindings = {
  create_lingui_accessors: string;
  context: string;
  get_i18n: string;
  translate: string;
  trans_component: string;
};

type CompileTarget = {
  declaration_id: string;
  original_span: { start: number; end: number };
  normalized_span: { start: number; end: number };
  source_map_anchor?: { start: number; end: number } | null;
  local_name: string;
  imported_name: string;
  flavor: "Direct" | "Reactive" | "Eager";
  translation_mode: "Raw" | "SvelteContext" | "AstroContext";
  output_kind: "Expression" | "Component";
  normalized_segments: Array<{
    original_start: number;
    generated_start: number;
    len: number;
  }>;
};

type CompilePlan = {
  source_name: string;
  synthetic_source: string;
  synthetic_name: string;
  synthetic_lang: "js" | "ts";
  declaration_ids: readonly string[];
  targets: CompileTarget[];
  runtime_bindings?: CompileRuntimeBindings | null;
};

type FinishedCompileReplacement = {
  start: number;
  end: number;
  code: string;
  source_map_json?: string | null;
};

type FinishedCompile = {
  replacements: FinishedCompileReplacement[];
};

type RustReplacement = {
  start: number;
  end: number;
  code: string;
  map: EncodedSourceMap | null;
};

let wasmInitialized = false;

export function lowerSvelteWithRustSynthetic(
  source: string,
  filename: string,
  linguiConfig: LinguiConfigNormalized,
): RustReplacement[] {
  const compilePlan = buildCompilePlan(source, filename);
  if (compilePlan.declaration_ids.length === 0) {
    return [];
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
    allowBareSyntheticDirectMacros: true,
  });
  const svelteContext = transformProgram(compilePlan.synthetic_source, {
    extract: false,
    filename: `${compilePlan.synthetic_name}?svelte-context`,
    lang: compilePlan.synthetic_lang,
    linguiConfig,
    translationMode: "svelte-context",
    allowBareSyntheticDirectMacros: true,
    ...(runtimeBindings ? { runtimeBindings } : {}),
  });

  const transformedDeclarations = Object.fromEntries(
    compilePlan.targets.flatMap((target) => {
      const transformed =
        target.translation_mode === "Raw" ? raw : svelteContext;

      const declaration = collectDeclarationInitializer(
        transformed.ast,
        target.declaration_id,
      );
      return declaration == null
        ? []
        : [[target.declaration_id, declaration] as const];
    }),
  );

  const finished = finishCompileWithOptions({
    plan: compilePlan,
    source,
    transformed_declarations: transformedDeclarations,
  }) as FinishedCompile;

  return finished.replacements.map((replacement) => ({
    start: replacement.start,
    end: replacement.end,
    code: replacement.code,
    map:
      replacement.source_map_json != null
        ? (JSON.parse(replacement.source_map_json) as EncodedSourceMap)
        : null,
  }));
}

export function buildCompilePlan(
  source: string,
  filename: string,
): CompilePlan {
  ensureWasmInitialized();
  const plan = buildCompilePlanWithOptions({
    framework: "svelte",
    source,
    source_name: filename,
    synthetic_name: `${filename}?rust-compile.tsx`,
  }) as CompilePlan;
  repairSvelteCompilePlan(source, plan);
  return plan;
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

function collectDeclarationInitializer(
  ast: File,
  declarationId: string,
): string | null {
  let found: string | null = null;

  babelTraverse(ast, {
    VariableDeclarator(path: NodePath<VariableDeclarator>) {
      if (path.node.id.type !== "Identifier" || !path.node.init) {
        return;
      }
      if (path.node.id.name !== declarationId) {
        return;
      }

      found = generateInitializer(path.node.init);
      path.stop();
    },
  });

  return found;
}

function generateInitializer(node: VariableDeclarator["init"]): string {
  return node == null ? "" : generate(node).code;
}

function getBabelGenerate(): typeof import("@babel/generator").default {
  const moduleValue = generateModule as unknown as {
    default?:
      | typeof import("@babel/generator").default
      | { default?: typeof import("@babel/generator").default };
  };

  if (typeof moduleValue === "function") {
    return moduleValue as typeof import("@babel/generator").default;
  }

  if (typeof moduleValue.default === "function") {
    return moduleValue.default;
  }

  if (typeof moduleValue.default?.default === "function") {
    return moduleValue.default.default;
  }

  throw new TypeError(
    "Unable to resolve @babel/generator default export at runtime.",
  );
}

function repairSvelteCompilePlan(source: string, plan: CompilePlan): void {
  for (const target of plan.targets) {
    if (target.flavor === "Reactive") {
      const pattern = `$${target.local_name}`;
      const start = findSveltePrefixNear(
        source,
        target.original_span.start,
        target.original_span.end,
        pattern,
      );
      if (start == null || start >= target.original_span.start) {
        continue;
      }

      const end = start + totalNormalizedLength(target) + 1;
      target.original_span = { start, end };
      target.normalized_span = { start, end };
      target.source_map_anchor = {
        start: start + 1,
        end: start + pattern.length,
      };
      if (target.normalized_segments[0]) {
        target.normalized_segments[0] = {
          ...target.normalized_segments[0],
          original_start: start + 1,
        };
      }
      continue;
    }

    if (target.flavor === "Eager") {
      const pattern = `${target.local_name}.eager`;
      const start = findSveltePrefixNear(
        source,
        target.original_span.start,
        target.original_span.end,
        pattern,
      );
      if (start == null || start >= target.original_span.start) {
        continue;
      }

      const end = start + totalNormalizedLength(target) + ".eager".length;
      target.original_span = { start, end };
      target.normalized_span = { start, end };
      target.source_map_anchor = {
        start,
        end: start + target.local_name.length,
      };
      if (target.normalized_segments[0]) {
        target.normalized_segments[0] = {
          ...target.normalized_segments[0],
          original_start: start,
        };
      }
    }
  }
}

function totalNormalizedLength(target: CompileTarget): number {
  const last = target.normalized_segments.at(-1);
  if (!last) {
    return Math.max(
      0,
      target.normalized_span.end - target.normalized_span.start,
    );
  }
  return last.generated_start + last.len;
}

function findSveltePrefixNear(
  source: string,
  currentStart: number,
  currentEnd: number,
  pattern: string,
): number | null {
  const windowStart = Math.max(0, currentStart - pattern.length - 8);
  const windowEnd = Math.min(source.length, currentEnd);
  const window = source.slice(windowStart, windowEnd);
  let found: number | null = null;
  let cursor = 0;
  while (true) {
    const offset = window.indexOf(pattern, cursor);
    if (offset === -1) {
      return found;
    }
    const start = windowStart + offset;
    if (start <= currentStart) {
      found = start;
    }
    cursor = offset + 1;
  }
}
