import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ParserOptions } from "@babel/core";
import { transformSync } from "@babel/core";
import linguiMacroPlugin from "@lingui/babel-plugin-lingui-macro";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractedMessage, LinguiConfigNormalized } from "@lingui/conf";

import { astroExtractor } from "lingui-for-astro/extractor";
import { unstable_transformAstro } from "lingui-for-astro/transform";
import { svelteExtractor } from "lingui-for-svelte/extractor";
import { unstable_transformSvelte } from "lingui-for-svelte/transform";

type Framework = "astro" | "svelte" | "core" | "react";
type WhitespaceMode = "auto" | "astro" | "svelte" | "jsx";

type CliOptions = {
  extract: boolean;
  file: string;
  framework: Framework;
  transform: boolean;
  whitespace: WhitespaceMode;
};

const usage =
  "usage: node inspect.ts [--whitespace auto|astro|svelte|jsx] [--extract] [--transform] <FILE>";

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
    const messages: ExtractedMessage[] = [];
    const transformed = transformOfficialSource(source, options.file);
    await extractFromFileWithBabel(
      options.file,
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

  const messages: ExtractedMessage[] = [];

  if (options.framework === "astro") {
    const extractor = astroExtractor({ whitespace: options.whitespace });
    await extractor.extract(
      options.file,
      source,
      (message) => {
        messages.push(message);
      },
      { linguiConfig },
    );
    return messages;
  }

  const extractor = svelteExtractor({ whitespace: options.whitespace });
  await extractor.extract(
    options.file,
    source,
    (message) => {
      messages.push(message);
    },
    { linguiConfig },
  );
  return messages;
}

async function runTransform(
  source: string,
  options: CliOptions,
): Promise<string> {
  if (options.framework === "core" || options.framework === "react") {
    return transformOfficialSource(source, options.file);
  }

  if (options.framework === "astro") {
    const transformed = await unstable_transformAstro(source, {
      filename: options.file,
      linguiConfig,
      whitespace: options.whitespace,
    });
    return transformed?.code ?? source;
  }

  const transformed = await unstable_transformSvelte(source, {
    filename: options.file,
    linguiConfig,
    whitespace: options.whitespace,
  });
  return transformed?.code ?? source;
}

function transformOfficialSource(source: string, filename: string): string {
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
  });

  if (!transformed?.code) {
    throw new Error(`Failed to transform ${filename}`);
  }

  return transformed.code;
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
