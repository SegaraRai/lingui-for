import type { ParserOptions } from "@babel/core";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

import {
  createExtractionUnits,
  isTransformableScript,
  normalizeLinguiConfig,
  transformJavaScriptMacros,
  type LinguiSvelteTransformOptions,
} from "../compiler-core/index.ts";
import { PACKAGE_MACRO } from "../compiler-core/shared/constants.ts";

function getParserPlugins(
  ctx: ExtractorCtx,
): NonNullable<ParserOptions["plugins"]> {
  const parserOptions = ctx.linguiConfig.extractorParserOptions;

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
        plugins: getParserPlugins(ctx),
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

/**
 * Lingui extractor implementation for `.svelte` files.
 *
 * The extractor accepts Svelte source, converts it into one or more extraction units via the
 * compiler core, and forwards each unit to Lingui's Babel-based extractor together with the
 * corresponding source map. Messages are emitted through Lingui's `onMessageExtracted` callback.
 */
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

/**
 * Lingui extractor implementation for JS/TS-family files handled by the compiler core.
 *
 * When the source imports the lingui-for-svelte macro package, the file is first transformed in
 * extraction mode so custom runtime semantics are normalized before Lingui extracts messages.
 * Otherwise the original source is forwarded directly to Lingui's Babel-based extractor.
 */
export const jstsExtractor: ExtractorType = {
  match(filename) {
    return isTransformableScript(filename);
  },
  async extract(filename, source, onMessageExtracted, ctx) {
    const extractorCtx = createExtractorContext(ctx, {
      filename,
      linguiConfig: ctx?.linguiConfig,
    });

    if (source.includes(PACKAGE_MACRO)) {
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
            plugins: getParserPlugins(extractorCtx),
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
        plugins: getParserPlugins(extractorCtx),
      },
      true,
    );
  },
};
