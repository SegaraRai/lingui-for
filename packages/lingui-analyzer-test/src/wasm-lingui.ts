import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { transformSync } from "@babel/core";
import generateModule from "@babel/generator";
import traverseModule, { type NodePath } from "@babel/traverse";
import type { File, VariableDeclarator } from "@babel/types";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type {
  ExtractedMessage,
  ExtractorCtx,
  LinguiConfigNormalized,
} from "@lingui/conf";
import {
  buildSyntheticModule,
  buildSyntheticModuleWithOptions,
  initSync,
  reinsertTransformedDeclarations,
} from "../../../shared/lingui-analyzer-wasm/dist/index.js";

const require = createRequire(import.meta.url);
const linguiMacroPlugin = require("@lingui/babel-plugin-lingui-macro") as
  | typeof import("@lingui/babel-plugin-lingui-macro")
  | { default: typeof import("@lingui/babel-plugin-lingui-macro") };
const linguiMacroPluginFactory =
  "default" in linguiMacroPlugin
    ? linguiMacroPlugin.default
    : linguiMacroPlugin;
const generate = generateModule as typeof import("@babel/generator").default;
const traverse = traverseModule as typeof import("@babel/traverse").default;
let wasmInitialized = false;
const linguiConfig = createLinguiConfig();

export type SyntheticModule = {
  source: string;
  source_name: string;
  synthetic_name: string;
  source_map_json?: string | null;
  declaration_ids: readonly string[];
};

export type SyntheticTransformResult = {
  synthetic: SyntheticModule;
  code: string;
  declarations: Record<string, string>;
};

export type ReinsertedModule = {
  code: string;
  source_name: string;
  source_map_json?: string | null;
};

export function buildSyntheticModuleForTest(
  framework: "astro" | "svelte",
  source: string,
  options?: {
    sourceName?: string;
    syntheticName?: string;
  },
): SyntheticModule {
  ensureWasmInitialized();
  if (!options?.sourceName && !options?.syntheticName) {
    return buildSyntheticModule(framework, source) as SyntheticModule;
  }
  return buildSyntheticModuleWithOptions({
    framework,
    source,
    source_name: options.sourceName,
    synthetic_name: options.syntheticName,
  }) as SyntheticModule;
}

export function transformSyntheticModule(
  synthetic: SyntheticModule,
): SyntheticTransformResult {
  const transformed = transformSync(synthetic.source, {
    filename: synthetic.synthetic_name,
    babelrc: false,
    configFile: false,
    sourceType: "module",
    parserOpts: {
      plugins: ["typescript", "jsx"],
    },
    plugins: [
      [
        linguiMacroPluginFactory,
        {
          linguiConfig,
          stripMessageField: false,
        },
      ],
    ],
    ast: true,
    code: true,
  });

  if (!transformed?.code || !transformed.ast) {
    throw new Error("Lingui transform did not return code and AST");
  }

  return {
    synthetic,
    code: transformed.code,
    declarations: collectDeclarationInitializers(
      transformed.ast,
      synthetic.declaration_ids,
    ),
  };
}

export async function extractMessagesFromSyntheticModule(
  filename: string,
  synthetic: SyntheticModule,
): Promise<ExtractedMessage[]> {
  const extracted: ExtractedMessage[] = [];
  const sourceMaps = synthetic.source_map_json
    ? JSON.parse(synthetic.source_map_json)
    : undefined;

  await extractFromFileWithBabel(
    filename,
    synthetic.source,
    (message) => {
      extracted.push(message);
    },
    sourceMaps
      ? {
          ...createExtractorContext(),
          sourceMaps,
        }
      : createExtractorContext(),
    {
      plugins: [
        "importAttributes",
        "explicitResourceManagement",
        "decoratorAutoAccessors",
        "deferredImportEvaluation",
        "typescript",
        "jsx",
        "decorators",
      ],
    },
    !sourceMaps,
  );

  return extracted;
}

export function reinsertTransformedModule(
  originalSource: string,
  synthetic: SyntheticModule,
  declarations: Record<string, string>,
  options?: {
    sourceName?: string;
  },
): ReinsertedModule {
  ensureWasmInitialized();
  return reinsertTransformedDeclarations({
    original_source: originalSource,
    source_name: options?.sourceName,
    synthetic_module: synthetic,
    transformed_declarations: declarations,
  }) as ReinsertedModule;
}

function ensureWasmInitialized(): void {
  if (wasmInitialized) {
    return;
  }

  const wasmPath = fileURLToPath(
    new URL(
      "../../../shared/lingui-analyzer-wasm/dist/index_bg.wasm",
      import.meta.url,
    ),
  );
  initSync({ module: readFileSync(wasmPath) });
  wasmInitialized = true;
}

function createExtractorContext(): ExtractorCtx {
  return {
    linguiConfig,
  } as ExtractorCtx;
}

function createLinguiConfig(): LinguiConfigNormalized {
  return {
    macro: {
      corePackage: ["@lingui/core/macro", "@lingui/macro"],
      jsxPackage: ["@lingui/react/macro", "@lingui/macro"],
    },
    runtimeConfigModule: {
      i18n: ["@lingui/core", "i18n"],
      Trans: ["@lingui/react", "Trans"],
    },
    extractorParserOptions: {},
  } as unknown as LinguiConfigNormalized;
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

  for (const declarationId of declarationIds) {
    if (!(declarationId in found)) {
      throw new Error(`Missing transformed declaration: ${declarationId}`);
    }
  }

  return found;
}
