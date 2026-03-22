import type { ParserOptions } from "@babel/core";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractorCtx, ExtractorType } from "@lingui/conf";

export type ExtractionUnit = {
  code: string;
  map?: ExtractorCtx["sourceMaps"];
};

export function getLinguiExtractorParserPlugins(
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

export async function runBabelExtractionUnits(
  filename: string,
  units: readonly ExtractionUnit[],
  onMessageExtracted: Parameters<ExtractorType["extract"]>[2],
  ctx: ExtractorCtx,
  options?: {
    normalizeSourceMap?: (
      map: NonNullable<ExtractorCtx["sourceMaps"]>,
    ) => ExtractorCtx["sourceMaps"];
  },
): Promise<void> {
  const parserPlugins = getLinguiExtractorParserPlugins(ctx);

  for (const unit of units) {
    const sourceMaps = unit.map
      ? options?.normalizeSourceMap
        ? options.normalizeSourceMap(unit.map)
        : unit.map
      : undefined;

    await extractFromFileWithBabel(
      filename,
      unit.code,
      onMessageExtracted,
      sourceMaps
        ? {
            ...ctx,
            sourceMaps,
          }
        : ctx,
      {
        plugins: parserPlugins,
      },
      !sourceMaps,
    );
  }
}
