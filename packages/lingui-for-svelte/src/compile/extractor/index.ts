import type {
  ExtractorCtx,
  ExtractorType,
  LinguiConfigNormalized,
} from "@lingui/conf";

import {
  buildSvelteSyntheticModule,
  parseCanonicalSourceMap,
  runBabelExtractionUnits,
  toBabelSourceMap,
} from "@lingui-for/framework-core/compile";
import { initWasmOnce } from "@lingui-for/framework-core/compile/wasm-loader";
import {
  createLinguiConfigResolver,
  type LinguiConfigSource,
} from "@lingui-for/framework-core/config";

import {
  loadLinguiConfig,
  type LinguiSvelteFrameworkConfig,
} from "../common/config.ts";
import { createSvelteFrameworkConventions } from "../common/conventions.ts";
import { lowerSvelteExtractProgram } from "../lower/extract.ts";

/**
 * Options for {@link svelteExtractor}.
 */
export interface SvelteExtractorOptions {
  config?: LinguiConfigSource;
}

/**
 * Lingui extractor for `.svelte` files.
 *
 * The extractor accepts Svelte source, lowers it into a single Rust-generated synthetic module,
 * and forwards that module to Lingui's Babel-based extractor together with the corresponding
 * source map. Messages are emitted through Lingui's `onMessageExtracted` callback.
 */
export const svelteExtractor: ExtractorType & typeof svelteExtractorFactory =
  /*#__PURE__*/ Object.assign(svelteExtractorFactory, svelteExtractorFactory());

/**
 * Lingui extractor factory for `.svelte` files.
 */
function svelteExtractorFactory(
  options?: SvelteExtractorOptions,
): ExtractorType {
  const configResolver = createLinguiConfigResolver({
    loadConfig: loadLinguiConfig,
    config: options?.config,
    missingConfigMessage:
      "lingui-for-svelte extractor requires a Lingui config file or explicit config option.",
  });

  return {
    match(filename) {
      return filename.endsWith(".svelte");
    },
    async extract(filename, source, onMessageExtracted, ctx) {
      await initWasmOnce();

      const resolvedConfigPath = ctx?.linguiConfig.resolvedConfigPath;
      if (resolvedConfigPath != null) {
        configResolver.finalizeResolvedConfigPath(resolvedConfigPath);
      }

      const syntheticName = filename.replace(/\.svelte$/, ".synthetic.tsx");
      const extractorCtx = createExtractorContext(
        ctx,
        await configResolver.getConfig(),
      );
      const synthetic = buildSvelteSyntheticModule({
        source,
        sourceName: filename,
        syntheticName,
        whitespace: extractorCtx.frameworkConfig.whitespace ?? "svelte",
        conventions: createSvelteFrameworkConventions(
          extractorCtx.linguiConfig,
          { packages: extractorCtx.frameworkConfig.packages },
        ),
      });
      if (synthetic.source.trim().length === 0) {
        return;
      }

      const transformed = lowerSvelteExtractProgram(synthetic.source, {
        filename: syntheticName,
        lang: "ts",
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
      );
    },
  };
}

function createExtractorContext(
  ctx: ExtractorCtx | undefined,
  loaded: {
    linguiConfig: LinguiConfigNormalized;
    frameworkConfig: LinguiSvelteFrameworkConfig;
  },
): ExtractorCtx & {
  linguiConfig: LinguiConfigNormalized;
  frameworkConfig: LinguiSvelteFrameworkConfig;
} {
  return { ...ctx, ...loaded };
}
