import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { transformSync } from "@babel/core";
import generateModule from "@babel/generator";
import traverseModule, { type NodePath } from "@babel/traverse";
import type { File, VariableDeclarator } from "@babel/types";
import type {
  ExtractedMessage,
  ExtractorCtx,
  LinguiConfigNormalized,
} from "@lingui/conf";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import {
  buildSyntheticModule,
  initSync,
} from "../../lingui-analyzer-wasm/dist/index.js";

const require = createRequire(import.meta.url);
const linguiMacroPlugin = require("@lingui/babel-plugin-lingui-macro") as
  | typeof import("@lingui/babel-plugin-lingui-macro")
  | { default: typeof import("@lingui/babel-plugin-lingui-macro") };
const linguiMacroPluginFactory =
  "default" in linguiMacroPlugin
    ? linguiMacroPlugin.default
    : linguiMacroPlugin;
const generate =
  typeof generateModule === "function" ? generateModule : generateModule.default;
const traverse =
  typeof traverseModule === "function" ? traverseModule : traverseModule.default;
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

export function buildSyntheticModuleForTest(
  framework: "astro" | "svelte",
  source: string,
): SyntheticModule {
  ensureWasmInitialized();
  return buildSyntheticModule(framework, source) as SyntheticModule;
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
    ? normalizeSourceMap(
        JSON.parse(synthetic.source_map_json) as ExtractorCtx["sourceMaps"],
        filename,
      )
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

function ensureWasmInitialized(): void {
  if (wasmInitialized) {
    return;
  }

  const wasmPath = fileURLToPath(
    new URL("../../lingui-analyzer-wasm/dist/index_bg.wasm", import.meta.url),
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

function normalizeSourceMap(
  map: NonNullable<ExtractorCtx["sourceMaps"]>,
  filename: string,
): NonNullable<ExtractorCtx["sourceMaps"]> {
  return {
    ...map,
    file: filename,
    sources: map.sources.map(() => filename),
  };
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
