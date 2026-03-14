import type { ParserOptions } from "@babel/core";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import { normalizeLinguiConfig } from "../compiler-core/config.ts";
import type { LinguiSvelteTransformOptions } from "../compiler-core/index.ts";
import {
  createExtractionUnits,
  isTransformableScript,
  transformJavaScriptMacros,
} from "../compiler-core/index.ts";

const MACRO_PACKAGE = "lingui-for-svelte/macro";

function getParserPlugins(
  filename: string,
  ctx?: ExtractorCtx,
): ParserOptions["plugins"] {
  const parserOptions = ctx?.linguiConfig.extractorParserOptions;

  return [
    "importAttributes",
    "explicitResourceManagement",
    "decoratorAutoAccessors",
    "deferredImportEvaluation",
    "typescript",
    "jsx",
    parserOptions?.tsExperimentalDecorators
      ? "decorators-legacy"
      : "decorators",
  ];
}

async function runExtractionUnits(
  filename: string,
  units: ReturnType<typeof createExtractionUnits>,
  onMessageExtracted: Parameters<ExtractorType["extract"]>[2],
  ctx: ExtractorCtx,
): Promise<void> {
  for (const unit of units) {
    await extractFromFileWithBabel(
      filename,
      unit.code,
      onMessageExtracted,
      unit.map
        ? {
            ...ctx,
            sourceMaps: unit.map,
          }
        : ctx,
      {
        plugins: getParserPlugins(filename, ctx),
      },
      true,
    );
  }
}

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  options?: LinguiSvelteTransformOptions,
): ExtractorCtx {
  if (ctx) {
    return ctx;
  }

  return {
    linguiConfig: normalizeLinguiConfig(options?.linguiConfig),
  };
}

export const svelteExtractor: ExtractorType = {
  match(filename) {
    return filename.endsWith(".svelte");
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx, {
      filename,
      linguiConfig: ctx?.linguiConfig,
    });
    const units = createExtractionUnits(source, {
      filename,
      linguiConfig: extractorCtx.linguiConfig,
    });

    await runExtractionUnits(filename, units, onMessageExtracted, extractorCtx);
  },
};

export const jstsExtractor: ExtractorType = {
  match(filename) {
    return isTransformableScript(filename);
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx, {
      filename,
      linguiConfig: ctx?.linguiConfig,
    });

    if (source.includes(MACRO_PACKAGE)) {
      const transformed = transformJavaScriptMacros(
        source,
        {
          filename,
          linguiConfig: extractorCtx.linguiConfig,
        },
        true,
      );

      if (transformed) {
        await extractFromFileWithBabel(
          filename,
          transformed.code,
          onMessageExtracted,
          transformed.map
            ? {
                ...extractorCtx,
                sourceMaps: transformed.map,
              }
            : extractorCtx,
          {
            plugins: getParserPlugins(filename, extractorCtx),
          },
          true,
        );
        return;
      }
    }

    await extractFromFileWithBabel(
      filename,
      source,
      onMessageExtracted,
      extractorCtx,
      {
        plugins: getParserPlugins(filename, extractorCtx),
      },
      true,
    );
  },
};
