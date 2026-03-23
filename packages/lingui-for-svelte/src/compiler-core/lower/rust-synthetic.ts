import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import generateModule from "@babel/generator";
import type { NodePath } from "@babel/core";
import traverseModule from "@babel/traverse";
import type { File, VariableDeclarator } from "@babel/types";
import { buildCompilePlanWithOptions, initSync } from "lingui-analyzer-wasm";
import {
  GenMapping,
  addMapping,
  setSourceContent,
  toEncodedMap,
} from "@jridgewell/gen-mapping";
import type { EncodedSourceMap } from "@jridgewell/gen-mapping";

import { createOffsetToPosition } from "lingui-for-shared/compiler";

import type { SveltePlan } from "../plan/svelte-plan.ts";
import type { RuntimeBindingsForTransform } from "./types.ts";
import { transformProgram } from "./babel-transform.ts";

const generate = generateModule as typeof import("@babel/generator").default;
const traverse = traverseModule as typeof import("@babel/traverse").default;

type NormalizedSegment = {
  original_start: number;
  generated_start: number;
  len: number;
};

type CompileTarget = {
  declaration_id: string;
  original_span: { start: number; end: number };
  normalized_span: { start: number; end: number };
  source_map_anchor?: { start: number; end: number } | null;
  local_name: string;
  imported_name: string;
  flavor: "Direct" | "Reactive" | "Eager";
  context: "ModuleScript" | "InstanceScript" | "Frontmatter" | "Template";
  output_kind: "Expression" | "Component";
  translation_mode: "Raw" | "SvelteContext" | "AstroContext";
  normalized_segments: NormalizedSegment[];
};

type CompilePlan = {
  synthetic_source: string;
  synthetic_name: string;
  declaration_ids: readonly string[];
  targets: CompileTarget[];
};

type RustReplacement = {
  start: number;
  end: number;
  code: string;
  map: EncodedSourceMap | null;
};

let wasmInitialized = false;

export function lowerSvelteWithRustSynthetic(
  plan: SveltePlan,
  runtimeBindings: RuntimeBindingsForTransform,
): RustReplacement[] {
  const compilePlan = buildCompilePlan(plan);
  if (compilePlan.declaration_ids.length === 0) {
    return [];
  }

  const raw = transformProgram(compilePlan.synthetic_source, {
    extract: false,
    filename: `${compilePlan.synthetic_name}?raw`,
    lang: plan.expressionLang,
    linguiConfig: plan.linguiConfig,
    translationMode: "raw",
    allowBareSyntheticDirectMacros: true,
  });
  const svelteContext = transformProgram(compilePlan.synthetic_source, {
    extract: false,
    filename: `${compilePlan.synthetic_name}?svelte-context`,
    lang: plan.expressionLang,
    linguiConfig: plan.linguiConfig,
    translationMode: "svelte-context",
    allowBareSyntheticDirectMacros: true,
    runtimeBindings,
  });

  const rawDeclarations = collectDeclarationInitializers(
    raw.ast,
    compilePlan.declaration_ids,
  );
  const svelteContextDeclarations = collectDeclarationInitializers(
    svelteContext.ast,
    compilePlan.declaration_ids,
  );

  return compilePlan.targets
    .filter((target) => target.output_kind === "Expression")
    .flatMap((target) => {
      const declaration =
        target.translation_mode === "Raw"
          ? rawDeclarations[target.declaration_id]
          : target.translation_mode === "SvelteContext"
            ? svelteContextDeclarations[target.declaration_id]
            : undefined;

      if (declaration == null) {
        return [];
      }

      const code = indentMultilineReplacement(
        declaration,
        getSourceLineIndent(plan.source, target.original_span.start),
      );

      return [
        {
          start: target.original_span.start,
          end: target.original_span.end,
          code,
          map: createReplacementChunkMap(
            plan.source,
            plan.filename,
            code,
            target,
          ),
        },
      ];
    });
}

function buildCompilePlan(plan: SveltePlan): CompilePlan {
  ensureWasmInitialized();
  return buildCompilePlanWithOptions({
    framework: "svelte",
    source: plan.source,
    source_name: plan.filename,
    synthetic_name: `${plan.filename}?rust-compile.tsx`,
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

function collectDeclarationInitializers(
  ast: File,
  declarationIds: readonly string[],
): Record<string, string> {
  const found: Record<string, string> = {};

  traverse(ast, {
    VariableDeclarator(path: NodePath<VariableDeclarator>) {
      if (path.node.id.type !== "Identifier" || !path.node.init) {
        return;
      }
      if (!declarationIds.includes(path.node.id.name)) {
        return;
      }

      found[path.node.id.name] = generate(path.node.init).code;
    },
  });

  return found;
}

function createReplacementChunkMap(
  source: string,
  filename: string,
  replacement: string,
  target: CompileTarget,
): EncodedSourceMap | null {
  if (replacement.length === 0) {
    return null;
  }

  const originalStart =
    target.normalized_segments[0]?.original_start ??
    target.source_map_anchor?.start ??
    target.original_span.start;
  const originalEnd =
    target.normalized_segments.length > 0
      ? endOfNormalizedSegment(
          target.normalized_segments[target.normalized_segments.length - 1]!,
        )
      : target.original_span.end;
  const originalLength = Math.max(0, originalEnd - originalStart);
  const gen = new GenMapping({ file: filename });
  const toGeneratedPosition = createOffsetToPosition(replacement);
  const toOriginalPosition = createOffsetToPosition(source);

  for (let index = 0; index <= replacement.length; index += 1) {
    addMapping(gen, {
      generated: toGeneratedPosition(index),
      original: toOriginalPosition(
        originalStart + Math.min(index, originalLength),
      ),
      source: filename,
    });
  }

  setSourceContent(gen, filename, source);
  return toEncodedMap(gen);
}

function endOfNormalizedSegment(segment: NormalizedSegment): number {
  return segment.original_start + segment.len;
}

function getSourceLineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  let index = lineStart;

  while (source[index] === " " || source[index] === "\t") {
    index += 1;
  }

  return source.slice(lineStart, index);
}

function indentMultilineReplacement(code: string, indent: string): string {
  if (indent.length === 0 || !code.includes("\n")) {
    return code;
  }

  const lines = code.split("\n");
  return lines
    .map((line, index) =>
      index === 0 || line.length === 0 ? line : `${indent}${line}`,
    )
    .join("\n");
}
