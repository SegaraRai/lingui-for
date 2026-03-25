import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { analyzeAstro, initWasmOnce } from "#astro-analyzer-wasm";
import { lowerAstroWithRustSynthetic } from "../lower/index.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import type { AstroTransformResult } from "./types.ts";

/**
 * Transforms one `.astro` source file in place for runtime use.
 *
 * @param source Original `.astro` source.
 * @param options Transform options including filename and optional Lingui config.
 * @returns Rewritten source, source map, and the structural analysis used during the transform.
 *
 * This is the main Astro entry point for runtime compilation. It analyzes frontmatter and template
 * expressions, rewrites function macros against the request-scoped `i18n` binding, lowers
 * component macros to `RuntimeTrans`, and injects only the frontmatter prelude actually needed by
 * the rewritten file.
 */
export function transformAstro(
  source: string,
  options: LinguiAstroTransformOptions,
): AstroTransformResult {
  initWasmOnce();
  const analysis = analyzeAstro(source);
  const output = lowerAstroWithRustSynthetic(
    source,
    options.filename,
    normalizeLinguiConfig(options.linguiConfig),
  );

  return {
    code: output?.code ?? source,
    map: output?.map ?? null,
    analysis,
  };
}
