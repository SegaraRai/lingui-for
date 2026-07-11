import type { ParserOptions } from "@babel/parser";
import { extractFromFileWithBabel } from "@lingui/cli/api";
import type { ExtractorCtx, PerFileExtractorType } from "@lingui/conf";

import type { CanonicalSourceMap } from "./sourcemap-types.ts";

export interface ExtractionUnit {
  code: string;
  map: CanonicalSourceMap | null;
}

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
  ] as unknown as NonNullable<ParserOptions["plugins"]>;
}

export async function runBabelExtractionUnits(
  filename: string,
  units: readonly ExtractionUnit[],
  onMessageExtracted: Parameters<PerFileExtractorType["extract"]>[2],
  ctx: ExtractorCtx,
  options?: {
    normalizeSourceMap?: (map: CanonicalSourceMap) => CanonicalSourceMap;
  },
): Promise<void> {
  const parserPlugins = getLinguiExtractorParserPlugins(ctx);

  for (const unit of units) {
    const sourceMaps =
      unit.map != null
        ? (options?.normalizeSourceMap?.(unit.map) ?? unit.map)
        : null;

    await extractFromFileWithBabel(
      filename,
      unit.code,
      onMessageExtracted,
      sourceMaps != null ? { ...ctx, sourceMaps } : ctx,
      {
        plugins: parserPlugins,
      } as Parameters<typeof extractFromFileWithBabel>[4],
      !sourceMaps,
    );
  }
}
