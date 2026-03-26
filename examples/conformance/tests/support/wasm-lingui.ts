import { transformSync } from "@babel/core";
import { generate } from "@babel/generator";
import { type NodePath } from "@babel/traverse";
import type { File, VariableDeclarator } from "@babel/types";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import type { ExtractedMessage, ExtractorCtx } from "@lingui/conf";

import {
  buildSyntheticModule,
  buildSyntheticModuleWithOptions,
  reinsertTransformedDeclarations,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import {
  babelTraverse,
  getParserPlugins,
  LINGUI_CORE_MACRO_PACKAGE,
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_MACRO_PACKAGE,
  LINGUI_REACT_MACRO_PACKAGE,
  runBabelExtractionUnits,
} from "@lingui-for/internal-shared-compile";

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

const SYNTHETIC_MODULE_PARSER_PLUGINS = getParserPlugins({ typescript: true });

const LINGUI_CONFIG = {
  macro: {
    corePackage: [LINGUI_CORE_MACRO_PACKAGE, LINGUI_MACRO_PACKAGE],
    jsxPackage: [LINGUI_REACT_MACRO_PACKAGE, LINGUI_MACRO_PACKAGE],
  },
  runtimeConfigModule: {
    i18n: [LINGUI_CORE_PACKAGE, LINGUI_I18N_EXPORT],
    Trans: ["@lingui/react", "Trans"],
  },
  extractorParserOptions: {},
} as const;

const EXTRACTOR_CONTEXT = {
  linguiConfig: LINGUI_CONFIG,
} as unknown as ExtractorCtx;

await initWasmOnce();

export function buildSyntheticModuleForTest(
  framework: "astro" | "svelte",
  source: string,
  options?: {
    sourceName?: string;
    syntheticName?: string;
  },
): SyntheticModule {
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
      plugins: SYNTHETIC_MODULE_PARSER_PLUGINS,
    },
    plugins: [
      [
        linguiMacroPlugin,
        {
          linguiConfig: LINGUI_CONFIG,
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

  await runBabelExtractionUnits(
    filename,
    [
      {
        code: synthetic.source,
        map: parseSourceMap(synthetic.source_map_json),
      },
    ],
    (message) => {
      extracted.push(message);
    },
    EXTRACTOR_CONTEXT,
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
  return reinsertTransformedDeclarations({
    original_source: originalSource,
    source_name: options?.sourceName,
    synthetic_module: synthetic,
    transformed_declarations: declarations,
  }) as ReinsertedModule;
}

function parseSourceMap(sourceMapJson?: string | null) {
  return sourceMapJson ? JSON.parse(sourceMapJson) : undefined;
}

function collectDeclarationInitializers(
  ast: File,
  declarationIds: readonly string[],
): Record<string, string> {
  const found: Record<string, string> = {};
  const declarationIdSet = new Set(declarationIds);

  babelTraverse(ast, {
    VariableDeclarator(path: NodePath<VariableDeclarator>) {
      if (path.node.id.type !== "Identifier" || !path.node.init) {
        return;
      }
      if (!declarationIdSet.has(path.node.id.name)) {
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
