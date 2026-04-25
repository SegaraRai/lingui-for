import type {
  ExtractorCtx,
  ExtractorType,
  LinguiConfigNormalized,
} from "@lingui/conf";

import {
  buildAstroSyntheticModule,
  parseCanonicalSourceMap,
  runBabelExtractionUnits,
  stripQuery,
  toBabelSourceMap,
  type CanonicalSourceMap,
} from "@lingui-for/framework-core/compile";
import { initWasmOnce } from "@lingui-for/framework-core/compile/wasm-loader";
import {
  createLinguiConfigResolver,
  type LinguiConfigSource,
} from "@lingui-for/framework-core/config";

import {
  loadLinguiConfig,
  type LinguiAstroFrameworkConfig,
} from "../common/config.ts";
import { createAstroFrameworkConventions } from "../common/conventions.ts";
import { lowerAstroExtractProgram } from "../lower/extract.ts";

/**
 * Options for {@link astroExtractor}.
 */
export interface AstroExtractorOptions {
  config?: LinguiConfigSource;
}

/**
 * Lingui extractor for `.astro` source files.
 *
 * It matches Astro files, lowers macro-bearing syntax into a Rust-generated
 * synthetic module, and forwards the extracted messages to Lingui's Babel
 * extractor pipeline.
 */
export const astroExtractor: ExtractorType & typeof astroExtractorFactory =
  /*#__PURE__*/ Object.assign(astroExtractorFactory, astroExtractorFactory());

/**
 * Lingui extractor factory for `.astro` source files.
 */
function astroExtractorFactory(options?: AstroExtractorOptions): ExtractorType {
  const configResolver = createLinguiConfigResolver({
    loadConfig: loadLinguiConfig,
    config: options?.config,
    missingConfigMessage:
      "lingui-for-astro extractor requires a Lingui config file or explicit config option.",
  });

  return {
    match(filename) {
      return filename.endsWith(".astro");
    },
    async extract(filename, source, onMessageExtracted, ctx) {
      await initWasmOnce();

      const resolvedConfigPath = ctx?.linguiConfig.resolvedConfigPath;
      if (resolvedConfigPath != null) {
        configResolver.finalizeResolvedConfigPath(resolvedConfigPath);
      }

      const extractorCtx = createExtractorContext(
        ctx,
        await configResolver.getConfig(),
      );
      const syntheticName = filename.replace(/\.astro$/, ".synthetic.tsx");
      const synthetic = buildAstroSyntheticModule({
        source,
        sourceName: filename,
        syntheticName,
        whitespace: extractorCtx.frameworkConfig.whitespace ?? "astro",
        conventions: createAstroFrameworkConventions(
          extractorCtx.linguiConfig,
          {
            packages: extractorCtx.frameworkConfig.packages,
          },
        ),
      });
      const transformed = lowerAstroExtractProgram(synthetic.source, {
        filename: syntheticName,
        linguiConfig: extractorCtx.linguiConfig,
        inputSourceMap: toBabelSourceMap(
          parseCanonicalSourceMap(synthetic.sourceMapJson),
        ),
      });

      await runBabelExtractionUnits(
        filename,
        [
          {
            code: transformed.code,
            map: transformed.map,
          },
        ],
        onMessageExtracted,
        extractorCtx,
        {
          normalizeSourceMap: normalizeExtractionSourceMap,
        },
      );
    },
  };
}

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  loaded: {
    linguiConfig: LinguiConfigNormalized;
    frameworkConfig: LinguiAstroFrameworkConfig;
  },
): ExtractorCtx & {
  linguiConfig: LinguiConfigNormalized;
  frameworkConfig: LinguiAstroFrameworkConfig;
} {
  return { ...ctx, ...loaded };
}

function normalizeExtractionSourceMap(
  map: CanonicalSourceMap,
): CanonicalSourceMap {
  return {
    ...map,
    file: map.file != null ? stripQuery(map.file) : map.file,
    sources: (map.sources as string[] | undefined)?.map(stripQuery) ?? [],
  };
}
