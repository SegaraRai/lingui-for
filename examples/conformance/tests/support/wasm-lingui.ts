import { transformSync } from "@babel/core";
import { generate } from "@babel/generator";
import { type NodePath } from "@babel/traverse";
import type { File, VariableDeclarator } from "@babel/types";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import type {
  ExtractedMessage,
  ExtractorCtx,
  LinguiConfigNormalized,
} from "@lingui/conf";

import {
  buildSyntheticModule,
  reinsertTransformedDeclarations,
  type FrameworkConventions,
  type ReinsertedModule,
  type SyntheticModule,
  type WhitespaceMode,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import { initWasmOnce } from "@lingui-for/internal-lingui-analyzer-wasm/loader";
import {
  babelTraverse,
  getParserPlugins,
  LINGUI_CORE_PACKAGE,
  LINGUI_I18N_EXPORT,
  LINGUI_STANDARD_CORE_MACRO_PACKAGES,
  runBabelExtractionUnits,
} from "@lingui-for/internal-shared-compile";

export type SyntheticTransformResult = {
  synthetic: SyntheticModule;
  code: string;
  map: string | null;
  declarations: Record<string, string>;
};

const SYNTHETIC_MODULE_PARSER_PLUGINS = getParserPlugins({ typescript: true });

await initWasmOnce();

export function buildSyntheticModuleForTest(
  framework: "astro" | "svelte",
  source: string,
  options?: {
    sourceName?: string;
    syntheticName?: string;
    whitespace?: WhitespaceMode;
  },
): SyntheticModule {
  return buildSyntheticModule({
    source,
    sourceName: options?.sourceName,
    syntheticName: options?.syntheticName,
    whitespace: options?.whitespace,
    conventions: createTestFrameworkConventions(framework),
  });
}

export function transformSyntheticModule(
  synthetic: SyntheticModule,
): SyntheticTransformResult {
  const framework = detectFramework(synthetic);
  const linguiConfig = createLinguiConfigForFramework(framework);
  const transformed = transformSync(synthetic.source, {
    filename: synthetic.syntheticName,
    babelrc: false,
    configFile: false,
    sourceType: "module",
    inputSourceMap: parseSourceMap(synthetic.sourceMapJson),
    parserOpts: {
      plugins: SYNTHETIC_MODULE_PARSER_PLUGINS,
    },
    plugins: [
      [
        linguiMacroPlugin,
        {
          linguiConfig,
          stripMessageField: false,
        },
      ],
    ],
    ast: true,
    code: true,
    sourceMaps: true,
  });

  if (!transformed?.code || !transformed.ast) {
    throw new Error("Lingui transform did not return code and AST");
  }

  return {
    synthetic,
    code: transformed.code,
    map: transformed.map != null ? JSON.stringify(transformed.map) : null,
    declarations: collectDeclarationInitializers(
      transformed.ast,
      synthetic.declarationIds,
    ),
  };
}

export async function extractMessagesFromSyntheticModule(
  filename: string,
  synthetic: SyntheticModule,
): Promise<ExtractedMessage[]> {
  const extracted: ExtractedMessage[] = [];
  const extractorContext = {
    linguiConfig: createLinguiConfigForFramework(detectFramework(synthetic)),
  } as unknown as ExtractorCtx;

  await runBabelExtractionUnits(
    filename,
    [
      {
        code: synthetic.source,
        map: parseSourceMap(synthetic.sourceMapJson),
      },
    ],
    (message) => {
      extracted.push(message);
    },
    extractorContext,
  );

  return extracted;
}

export function reinsertTransformedModule(
  originalSource: string,
  synthetic: SyntheticModule,
  transformedProgram: Pick<SyntheticTransformResult, "code" | "map">,
  options?: {
    sourceName?: string;
  },
): ReinsertedModule {
  return reinsertTransformedDeclarations({
    originalSource: originalSource,
    sourceName: options?.sourceName,
    syntheticModule: synthetic,
    transformedProgram: {
      code: transformedProgram.code,
      sourceMapJson: transformedProgram.map ?? undefined,
    },
  });
}

function parseSourceMap(sourceMapJson?: string | null) {
  return sourceMapJson ? JSON.parse(sourceMapJson) : undefined;
}

function detectFramework(synthetic: SyntheticModule): "astro" | "svelte" {
  if (synthetic.source.includes("lingui-for-astro/macro")) {
    return "astro";
  }
  return "svelte";
}

function createLinguiConfigForFramework(
  framework: "astro" | "svelte",
): LinguiConfigNormalized {
  const macroPackage =
    framework === "astro"
      ? "lingui-for-astro/macro"
      : "lingui-for-svelte/macro";
  const runtimePackage =
    framework === "astro"
      ? "lingui-for-astro/runtime"
      : "lingui-for-svelte/runtime";

  return {
    catalogs: [],
    compileNamespace: "cjs",
    extractorParserOptions: {},
    fallbackLocales: {},
    locales: [],
    macro: {
      corePackage: [...LINGUI_STANDARD_CORE_MACRO_PACKAGES, macroPackage],
      jsxPackage: [macroPackage],
    },
    orderBy: "messageId",
    rootDir: "/virtual",
    runtimeConfigModule: {
      i18n: [LINGUI_CORE_PACKAGE, LINGUI_I18N_EXPORT],
      Trans: [runtimePackage, "RuntimeTrans"],
      useLingui: ["@lingui/react", "useLingui"],
    },
    sourceLocale: "en",
  };
}

function createTestFrameworkConventions(framework: "astro" | "svelte") {
  if (framework === "astro") {
    return {
      framework,
      macro: {
        packages: new Map([
          ["core", { packages: [...LINGUI_STANDARD_CORE_MACRO_PACKAGES] }],
          ["astro", { packages: ["lingui-for-astro/macro"] }],
        ]),
      },
      runtime: {
        package: "lingui-for-astro/runtime",
        exports: {
          trans: "RuntimeTrans",
          i18nAccessor: "createLinguiAccessors",
        },
      },
      bindings: {
        i18nAccessorFactory: "__l4a_createI18n",
        i18nInstance: "__l4a_i18n",
        runtimeTransComponent: "L4aRuntimeTrans",
      },
    } satisfies FrameworkConventions;
  }

  return {
    framework,
    macro: {
      packages: new Map([
        ["core", { packages: [...LINGUI_STANDARD_CORE_MACRO_PACKAGES] }],
        ["svelte", { packages: ["lingui-for-svelte/macro"] }],
      ]),
    },
    runtime: {
      package: "lingui-for-svelte/runtime",
      exports: {
        trans: "RuntimeTrans",
        i18nAccessor: "createLinguiAccessors",
      },
    },
    bindings: {
      i18nAccessorFactory: "createLinguiAccessors",
      context: "__l4s_ctx",
      getI18n: "__l4s_getI18n",
      translate: "__l4s_translate",
      runtimeTransComponent: "L4sRuntimeTrans",
      reactiveTranslationWrapper: "__lingui_for_svelte_reactive_translation__",
      eagerTranslationWrapper: "__lingui_for_svelte_eager_translation__",
    },
  } satisfies FrameworkConventions;
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
