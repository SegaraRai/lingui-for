import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { CanonicalSourceMap } from "@lingui-for/internal-shared-compile";
import {
  parseCanonicalSourceMap,
  runBabelExtractionUnits,
  toBabelSourceMap,
} from "@lingui-for/internal-shared-compile";
import {
  buildAstroCompilePlan,
  buildSyntheticModule,
  buildSvelteCompilePlan,
  finishAstroCompile,
  finishSvelteCompile,
  default as initLinguiAnalyzerWasm,
} from "@lingui-for/internal-lingui-analyzer-wasm";
import type { ParserOptions } from "@babel/core";
import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractedMessage, LinguiConfigNormalized } from "@lingui/conf";

import { normalizeLinguiConfig as normalizeAstroLinguiConfig } from "../../packages/lingui-for-astro/src/compile/common/config.ts";
import { createAstroFrameworkConventions } from "../../packages/lingui-for-astro/src/compile/common/conventions.ts";
import { transformProgram as transformAstroProgram } from "../../packages/lingui-for-astro/src/compile/lower/babel-transform.ts";
import { normalizeLinguiConfig as normalizeSvelteLinguiConfig } from "../../packages/lingui-for-svelte/src/compile/common/config.ts";
import { createSvelteFrameworkConventions } from "../../packages/lingui-for-svelte/src/compile/common/conventions.ts";
import { transformProgram as transformSvelteProgram } from "../../packages/lingui-for-svelte/src/compile/lower/babel-transform.ts";

type Framework = "astro" | "svelte" | "core" | "react";
type WhitespaceMode = "auto" | "astro" | "svelte" | "jsx";

type CliOptions = {
  artifacts: boolean;
  artifactsDir: string | null;
  extract: boolean;
  file: string;
  framework: Framework;
  transform: boolean;
  whitespace: WhitespaceMode;
};

type ArtifactFile = {
  content: string;
  ext: string;
  name: string;
};

type OfficialTransformResult = {
  code: string;
  map: CanonicalSourceMap | null;
};

type BabelTransformResult = NonNullable<ReturnType<typeof transformSync>>;

const usage =
  "usage: node inspect.ts [--whitespace auto|astro|svelte|jsx] [--extract] [--transform] [--artifacts] [--artifacts-dir <DIR>] <FILE>";

const linguiConfig: LinguiConfigNormalized = {
  catalogs: [],
  compileNamespace: "cjs",
  extractorParserOptions: {},
  fallbackLocales: {},
  locales: [],
  macro: {
    corePackage: ["@lingui/core/macro", "@lingui/macro"],
    jsxPackage: ["@lingui/react/macro", "@lingui/macro"],
  },
  orderBy: "messageId",
  rootDir: process.cwd(),
  runtimeConfigModule: {
    i18n: ["@lingui/core", "i18n"],
    Trans: ["@lingui/react", "Trans"],
    useLingui: ["@lingui/react", "useLingui"],
  },
  sourceLocale: "en",
};

const parserPlugins: NonNullable<ParserOptions["plugins"]> = [
  "importAttributes",
  "explicitResourceManagement",
  "decoratorAutoAccessors",
  "deferredImportEvaluation",
  "typescript",
  "jsx",
  "decorators",
];

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const source = await readFile(options.file, "utf8");

  await initLinguiAnalyzerWasm({
    module_or_path: readFile(
      new URL(
        "../../shared/lingui-analyzer-wasm/dist/index_bg.wasm",
        import.meta.url,
      ),
    ),
  });

  if (options.extract) {
    const extracted = await runExtract(source, options);
    console.log("=== extract ===");
    console.log(JSON.stringify(extracted, null, 2));
  }

  if (options.transform) {
    const transformed = await runTransform(source, options);
    if (options.extract) {
      console.log("");
    }
    console.log("=== transform ===");
    console.log(transformed);
  }
}

function parseArgs(argv: readonly string[]): CliOptions {
  let whitespace: WhitespaceMode = "auto";
  let extract = false;
  let transform = false;
  let artifacts = false;
  let artifactsDir: string | null = null;
  let file: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--extract") {
      extract = true;
      continue;
    }

    if (arg === "--transform") {
      transform = true;
      continue;
    }

    if (arg === "--artifacts") {
      artifacts = true;
      continue;
    }

    if (arg === "--artifacts-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(
          `Invalid value for --artifacts-dir: ${next ?? "(missing)"}\n${usage}`,
        );
      }
      artifacts = true;
      artifactsDir = resolve(next);
      index += 1;
      continue;
    }

    if (arg === "--whitespace") {
      const next = argv[index + 1];
      if (!isWhitespaceMode(next)) {
        throw new Error(
          `Invalid value for --whitespace: ${next ?? "(missing)"}\n${usage}`,
        );
      }
      whitespace = next;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}\n${usage}`);
    }

    if (file != null) {
      throw new Error(`Only one input file is supported.\n${usage}`);
    }

    file = resolve(arg);
  }

  if (file == null) {
    throw new Error(`Missing input file.\n${usage}`);
  }

  if (!extract && !transform) {
    extract = true;
    transform = true;
  }

  return {
    artifacts,
    artifactsDir,
    extract,
    file,
    framework: detectFramework(file),
    transform,
    whitespace,
  };
}

function detectFramework(file: string): Framework {
  if (file.endsWith(".astro")) {
    return "astro";
  }

  if (file.endsWith(".svelte")) {
    return "svelte";
  }

  if (file.endsWith(".jsx") || file.endsWith(".tsx")) {
    return "react";
  }

  if (file.endsWith(".js") || file.endsWith(".ts")) {
    return "core";
  }

  throw new Error(`Unsupported file extension: ${file}\n${usage}`);
}

function isWhitespaceMode(value: string | undefined): value is WhitespaceMode {
  return (
    value === "auto" ||
    value === "astro" ||
    value === "svelte" ||
    value === "jsx"
  );
}

async function runExtract(
  source: string,
  options: CliOptions,
): Promise<ExtractedMessage[]> {
  if (options.framework === "core" || options.framework === "react") {
    const transformed = transformOfficialSource(source, options.file);
    const messages = await extractOfficialMessages(
      options.file,
      transformed.code,
    );

    await writeArtifacts(options, [
      makeCodeArtifact("extract.final", transformed.code, "js"),
      makeMapArtifact("extract.final", transformed.map),
      makeJsonArtifact("extract.messages", messages),
    ]);

    return messages;
  }

  if (options.framework === "astro") {
    const result = await inspectAstroExtract(source, options);
    await writeArtifacts(options, [
      makeCodeArtifact("extract.synthetic", result.synthetic.source, "tsx"),
      makeMapArtifact(
        "extract.synthetic",
        parseCanonicalSourceMap(result.synthetic.sourceMapJson),
      ),
      makeCodeArtifact("extract.final", result.transformed.code, "tsx"),
      makeMapArtifact("extract.final", result.transformed.map),
      makeJsonArtifact("extract.messages", result.messages),
    ]);
    return result.messages;
  }

  const result = await inspectSvelteExtract(source, options);
  await writeArtifacts(options, [
    makeCodeArtifact("extract.synthetic", result.synthetic.source, "tsx"),
    makeMapArtifact(
      "extract.synthetic",
      parseCanonicalSourceMap(result.synthetic.sourceMapJson),
    ),
    makeCodeArtifact("extract.final", result.transformed.code, "ts"),
    makeMapArtifact("extract.final", result.transformed.map),
    makeJsonArtifact("extract.messages", result.messages),
  ]);
  return result.messages;
}

async function runTransform(
  source: string,
  options: CliOptions,
): Promise<string> {
  if (options.framework === "core" || options.framework === "react") {
    const transformed = transformOfficialSource(source, options.file);
    await writeArtifacts(options, [
      makeCodeArtifact(
        "transform.final",
        transformed.code,
        normalizeSourceExtension(options.file),
      ),
      makeMapArtifact("transform.final", transformed.map),
    ]);
    return transformed.code;
  }

  if (options.framework === "astro") {
    const result = await inspectAstroTransform(source, options);
    await writeArtifacts(options, [
      makeCodeArtifact("transform.synthetic", result.syntheticSource, "tsx"),
      makeMapArtifact("transform.synthetic", result.syntheticMap),
      makeCodeArtifact("transform.context", result.context.code, "tsx"),
      makeMapArtifact("transform.context", result.context.map),
      makeCodeArtifact("transform.final", result.final.code, "astro"),
      makeMapArtifact("transform.final", result.final.map),
    ]);
    return result.final.code;
  }

  const result = await inspectSvelteTransform(source, options);
  await writeArtifacts(options, [
    makeCodeArtifact("transform.synthetic", result.syntheticSource, "tsx"),
    makeMapArtifact("transform.synthetic", result.syntheticMap),
    makeCodeArtifact("transform.raw", result.raw.code, "tsx"),
    makeMapArtifact("transform.raw", result.raw.map),
    makeCodeArtifact("transform.context", result.context.code, "tsx"),
    makeMapArtifact("transform.context", result.context.map),
    makeCodeArtifact("transform.final", result.final.code, "svelte"),
    makeMapArtifact("transform.final", result.final.map),
  ]);
  return result.final.code;
}

async function inspectSvelteExtract(source: string, options: CliOptions) {
  const normalized = normalizeSvelteLinguiConfig(linguiConfig);
  const synthetic = buildSyntheticModule({
    source,
    sourceName: options.file,
    syntheticName: options.file.replace(/\.svelte$/, ".synthetic.tsx"),
    whitespace: options.whitespace === "auto" ? "svelte" : options.whitespace,
    conventions: createSvelteFrameworkConventions(normalized),
  });

  const transformed = transformSvelteProgram(synthetic.source, {
    filename: synthetic.syntheticName,
    lang: "ts",
    linguiConfig: normalized,
    extract: true,
    translationMode: "extract",
    inputSourceMap: toBabelSourceMap(
      parseCanonicalSourceMap(synthetic.sourceMapJson),
    ),
  });

  const messages = await extractWithUnits(
    options.file,
    transformed.code,
    transformed.map,
  );
  return { messages, synthetic, transformed };
}

async function inspectAstroExtract(source: string, options: CliOptions) {
  const normalized = normalizeAstroLinguiConfig(linguiConfig);
  const synthetic = buildSyntheticModule({
    source,
    sourceName: options.file,
    syntheticName: options.file.replace(/\.astro$/, ".synthetic.tsx"),
    whitespace: options.whitespace === "auto" ? "astro" : options.whitespace,
    conventions: createAstroFrameworkConventions(normalized),
  });

  const transformed = transformAstroProgram(synthetic.source, {
    translationMode: "extract",
    filename: synthetic.syntheticName,
    linguiConfig: normalized,
    runtimeBinding: null,
    inputSourceMap: toBabelSourceMap(
      parseCanonicalSourceMap(synthetic.sourceMapJson),
    ),
  });

  const messages = await extractWithUnits(
    options.file,
    transformed.code,
    transformed.map,
  );
  return { messages, synthetic, transformed };
}

async function inspectSvelteTransform(source: string, options: CliOptions) {
  const normalized = normalizeSvelteLinguiConfig(linguiConfig);
  const compilePlan = buildSvelteCompilePlan({
    source,
    sourceName: options.file,
    syntheticName: `${options.file}?rust-compile.tsx`,
    whitespace: options.whitespace === "auto" ? "svelte" : options.whitespace,
    conventions: createSvelteFrameworkConventions(normalized),
  });

  const runtimeBindings = {
    createLinguiAccessors: compilePlan.runtimeBindings.createLinguiAccessors,
    context: compilePlan.runtimeBindings.context,
    getI18n: compilePlan.runtimeBindings.getI18n,
    translate: compilePlan.runtimeBindings.translate,
  };
  const raw = transformSvelteProgram(compilePlan.common.syntheticSource, {
    extract: false,
    filename: `${compilePlan.common.syntheticName}?raw`,
    inputSourceMap: toBabelSourceMap(
      parseCanonicalSourceMap(compilePlan.common.syntheticSourceMapJson),
    ),
    lang: compilePlan.common.syntheticLang,
    linguiConfig: normalized,
    translationMode: "raw",
  });
  const context = transformSvelteProgram(compilePlan.common.syntheticSource, {
    extract: false,
    filename: `${compilePlan.common.syntheticName}?svelte-context`,
    inputSourceMap: toBabelSourceMap(
      parseCanonicalSourceMap(compilePlan.common.syntheticSourceMapJson),
    ),
    lang: compilePlan.common.syntheticLang,
    linguiConfig: normalized,
    translationMode: "svelte-context",
    runtimeBindings,
  });

  const finished = finishSvelteCompile({
    plan: compilePlan,
    source,
    transformedPrograms: {
      rawCode: raw.code,
      rawSourceMapJson: raw.map != null ? JSON.stringify(raw.map) : undefined,
      contextCode: context.code,
      contextSourceMapJson:
        context.map != null ? JSON.stringify(context.map) : undefined,
    },
  });

  return {
    syntheticMap: parseCanonicalSourceMap(
      compilePlan.common.syntheticSourceMapJson,
    ),
    syntheticSource: compilePlan.common.syntheticSource,
    raw,
    context,
    final: {
      code: finished.code,
      map: parseCanonicalSourceMap(finished.sourceMapJson),
    },
  };
}

async function inspectAstroTransform(source: string, options: CliOptions) {
  const normalized = normalizeAstroLinguiConfig(linguiConfig);
  const compilePlan = buildAstroCompilePlan({
    source,
    sourceName: options.file,
    syntheticName: `${options.file}?rust-compile.tsx`,
    whitespace: options.whitespace === "auto" ? "astro" : options.whitespace,
    conventions: createAstroFrameworkConventions(normalized),
  });

  const context = transformAstroProgram(compilePlan.common.syntheticSource, {
    translationMode: "astro-context",
    filename: `${compilePlan.common.syntheticName}?astro-context`,
    inputSourceMap: toBabelSourceMap(
      parseCanonicalSourceMap(compilePlan.common.syntheticSourceMapJson),
    ),
    linguiConfig: normalized,
    runtimeBinding: compilePlan.runtimeBindings.i18n,
  });

  const finished = finishAstroCompile({
    plan: compilePlan,
    source,
    transformedPrograms: {
      contextCode: context.code,
      contextSourceMapJson:
        context.map != null ? JSON.stringify(context.map) : undefined,
      rawCode: undefined,
      rawSourceMapJson: undefined,
    },
  });

  return {
    syntheticMap: parseCanonicalSourceMap(
      compilePlan.common.syntheticSourceMapJson,
    ),
    syntheticSource: compilePlan.common.syntheticSource,
    context,
    final: {
      code: finished.code,
      map: parseCanonicalSourceMap(finished.sourceMapJson),
    },
  };
}

async function extractWithUnits(
  filename: string,
  code: string,
  map: CanonicalSourceMap | null,
): Promise<ExtractedMessage[]> {
  const messages: ExtractedMessage[] = [];
  await runBabelExtractionUnits(
    filename,
    [
      {
        code,
        map,
      },
    ],
    (message) => {
      messages.push(message);
    },
    { linguiConfig },
  );
  return messages;
}

async function extractOfficialMessages(
  filename: string,
  transformed: string,
): Promise<ExtractedMessage[]> {
  const messages: ExtractedMessage[] = [];
  await extractFromFileWithBabel(
    filename,
    transformed,
    (message) => {
      messages.push(message);
    },
    { linguiConfig },
    { plugins: parserPlugins },
    true,
  );
  return messages;
}

function transformOfficialSource(
  source: string,
  filename: string,
): OfficialTransformResult {
  const transformed = transformSync(source, {
    ast: false,
    babelrc: false,
    code: true,
    configFile: false,
    filename,
    parserOpts: {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    },
    plugins: [[linguiMacroPlugin, { extract: false, linguiConfig }]],
    sourceMaps: true,
  });

  if (!transformed?.code) {
    throw new Error(`Failed to transform ${filename}`);
  }

  return {
    code: transformed.code,
    map: parseTransformMap(transformed),
  };
}

function parseTransformMap(
  result: BabelTransformResult,
): CanonicalSourceMap | null {
  if (result.map == null) {
    return null;
  }

  if (typeof result.map === "string") {
    return JSON.parse(result.map) as CanonicalSourceMap;
  }

  return result.map as CanonicalSourceMap;
}

function makeCodeArtifact(
  name: string,
  content: string,
  ext: string,
): ArtifactFile {
  return {
    content,
    ext,
    name,
  };
}

function makeMapArtifact(
  name: string,
  map: CanonicalSourceMap | null,
): ArtifactFile | null {
  if (map == null) {
    return null;
  }

  return {
    content: JSON.stringify(map, null, 2),
    ext: "map",
    name,
  };
}

function makeJsonArtifact(name: string, value: unknown): ArtifactFile {
  return {
    content: JSON.stringify(value, null, 2),
    ext: "json",
    name,
  };
}

async function writeArtifacts(
  options: CliOptions,
  artifacts: readonly (ArtifactFile | null)[],
): Promise<void> {
  if (!options.artifacts) {
    return;
  }

  const outDir = options.artifactsDir ?? dirname(options.file);
  const inputName = basename(options.file);
  await mkdir(outDir, { recursive: true });

  for (const artifact of artifacts) {
    if (artifact == null) {
      continue;
    }

    const target = join(
      outDir,
      `${inputName}.${artifact.name}.${artifact.ext}`,
    );
    await writeFile(target, artifact.content);
  }
}

function normalizeSourceExtension(file: string): string {
  return extname(file).slice(1) || "js";
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
