import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { ParserOptions } from "@babel/core";
import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractedMessage, LinguiConfigNormalized } from "@lingui/conf";

import type { CanonicalSourceMap } from "@lingui-for/framework-core/compile";
import { astroExtractor } from "lingui-for-astro/extractor";
import {
  unstable_transformAstro,
  type LinguiAstroFrameworkConfig,
} from "lingui-for-astro/internal/compile";
import { svelteExtractor } from "lingui-for-svelte/extractor";
import {
  unstable_transformSvelte,
  type LinguiSvelteFrameworkConfig,
} from "lingui-for-svelte/internal/compile";

export type Framework = "astro" | "svelte" | "core" | "react";
export type WhitespaceMode = "auto" | "astro" | "svelte" | "jsx";

export type CliOptions = {
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

export async function runExtract(
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
      makeMapArtifact("extract.final", transformed.map, "js"),
      makeJsonArtifact(
        "extract.messages",
        relativizeExtractedMessages(messages),
      ),
    ]);

    return messages;
  }

  if (options.framework === "astro") {
    const result = await inspectAstroExtract(source, options);
    await writeArtifacts(options, [
      makeJsonArtifact(
        "extract.messages",
        relativizeExtractedMessages(result.messages),
      ),
    ]);
    return result.messages;
  }

  const result = await inspectSvelteExtract(source, options);
  await writeArtifacts(options, [
    makeJsonArtifact(
      "extract.messages",
      relativizeExtractedMessages(result.messages),
    ),
  ]);
  return result.messages;
}

export async function runTransform(
  source: string,
  options: CliOptions,
): Promise<string> {
  if (options.framework === "core" || options.framework === "react") {
    const transformed = transformOfficialSource(source, options.file);
    const ext = normalizeSourceExtension(options.file);
    await writeArtifacts(options, [
      makeCodeArtifact("transform.final", transformed.code, ext),
      makeMapArtifact("transform.final", transformed.map, ext),
    ]);
    return transformed.code;
  }

  if (options.framework === "astro") {
    const result = await inspectAstroTransform(source, options);
    await writeArtifacts(options, [
      makeCodeArtifact("transform.synthetic", result.syntheticSource, "tsx"),
      makeMapArtifact("transform.synthetic", result.syntheticMap, "tsx"),
      makeCodeArtifact("transform.contextual", result.contextual.code, "tsx"),
      makeMapArtifact("transform.contextual", result.contextual.map, "tsx"),
      makeCodeArtifact("transform.final", result.final.code, "astro"),
      makeMapArtifact("transform.final", result.final.map, "astro"),
    ]);
    return result.final.code;
  }

  const result = await inspectSvelteTransform(source, options);
  await writeArtifacts(options, [
    makeCodeArtifact("transform.synthetic", result.syntheticSource, "tsx"),
    makeMapArtifact("transform.synthetic", result.syntheticMap, "tsx"),
    makeCodeArtifact("transform.lowered", result.lowered.code, "tsx"),
    makeMapArtifact("transform.lowered", result.lowered.map, "tsx"),
    makeCodeArtifact("transform.contextual", result.contextual.code, "tsx"),
    makeMapArtifact("transform.contextual", result.contextual.map, "tsx"),
    makeCodeArtifact("transform.final", result.final.code, "svelte"),
    makeMapArtifact("transform.final", result.final.map, "svelte"),
  ]);
  return result.final.code;
}

async function inspectSvelteExtract(source: string, options: CliOptions) {
  const extractor = svelteExtractor({
    config: createSvelteInspectConfig(options.whitespace),
  });
  const messages: ExtractedMessage[] = [];

  await extractor.extract(
    options.file,
    source,
    (message) => {
      messages.push(message);
    },
    { linguiConfig },
  );

  return { messages };
}

async function inspectAstroExtract(source: string, options: CliOptions) {
  const extractor = astroExtractor({
    config: createAstroInspectConfig(options.whitespace),
  });
  const messages: ExtractedMessage[] = [];

  await extractor.extract(
    options.file,
    source,
    (message) => {
      messages.push(message);
    },
    { linguiConfig },
  );

  return { messages };
}

async function inspectSvelteTransform(source: string, options: CliOptions) {
  const result = await unstable_transformSvelte(source, {
    filename: options.file,
    linguiConfig,
    frameworkConfig: createSvelteFrameworkConfig(options.whitespace),
  });
  if (result == null) {
    throw new Error(`No Lingui macros found in ${options.file}`);
  }

  return {
    syntheticMap: result.artifacts.synthetic.map,
    syntheticSource: result.artifacts.synthetic.code,
    lowered: result.artifacts.lowered,
    contextual: result.artifacts.contextual,
    final: result.artifacts.final,
  };
}

async function inspectAstroTransform(source: string, options: CliOptions) {
  const result = await unstable_transformAstro(source, {
    filename: options.file,
    linguiConfig,
    frameworkConfig: createAstroFrameworkConfig(options.whitespace),
  });
  if (result == null) {
    throw new Error(`No Lingui macros found in ${options.file}`);
  }

  return {
    syntheticMap: result.artifacts.synthetic.map,
    syntheticSource: result.artifacts.synthetic.code,
    contextual: result.artifacts.contextual,
    final: result.artifacts.final,
  };
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
  ext: string,
): ArtifactFile | null {
  if (map == null) {
    return null;
  }

  const normalized = relativizeSourceMap(map);

  return {
    content: JSON.stringify(normalized, null, 2),
    ext: `${ext}.map`,
    name,
  };
}

function relativizeSourceMap(map: CanonicalSourceMap): CanonicalSourceMap {
  return {
    ...map,
    file: typeof map.file === "string" ? basename(map.file) : map.file,
    sourceRoot: undefined,
    sources: map.sources.map((source) => basename(source)),
  };
}

function makeJsonArtifact(name: string, value: unknown): ArtifactFile {
  return {
    content: JSON.stringify(value, null, 2),
    ext: "json",
    name,
  };
}

function relativizeExtractedMessages(
  messages: readonly ExtractedMessage[],
): ExtractedMessage[] {
  return messages.map((message) => {
    if (message.origin == null) {
      return message;
    }

    const [filepath, ...rest] = message.origin;
    return {
      ...message,
      origin: [basename(filepath), ...rest],
    };
  });
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

function createSvelteInspectConfig(whitespace: WhitespaceMode) {
  return {
    ...linguiConfig,
    framework: {
      svelte: createSvelteFrameworkConfig(whitespace),
    },
  };
}

function createAstroInspectConfig(whitespace: WhitespaceMode) {
  return {
    ...linguiConfig,
    framework: {
      astro: createAstroFrameworkConfig(whitespace),
    },
  };
}

function createSvelteFrameworkConfig(
  whitespace: WhitespaceMode,
): LinguiSvelteFrameworkConfig {
  return {
    whitespace: resolveSvelteWhitespace(whitespace),
  };
}

function createAstroFrameworkConfig(
  whitespace: WhitespaceMode,
): LinguiAstroFrameworkConfig {
  return {
    whitespace: resolveAstroWhitespace(whitespace),
  };
}

function resolveSvelteWhitespace(
  whitespace: WhitespaceMode,
): LinguiSvelteFrameworkConfig["whitespace"] {
  if (whitespace === "auto") {
    return "svelte";
  }
  if (whitespace === "svelte" || whitespace === "jsx") {
    return whitespace;
  }
  throw new Error(`Svelte whitespace mode cannot be "${whitespace}".`);
}

function resolveAstroWhitespace(
  whitespace: WhitespaceMode,
): LinguiAstroFrameworkConfig["whitespace"] {
  if (whitespace === "auto") {
    return "astro";
  }
  if (whitespace === "astro" || whitespace === "jsx") {
    return whitespace;
  }
  throw new Error(`Astro whitespace mode cannot be "${whitespace}".`);
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
