import type { LinguiAstroTransformOptions } from "../shared/types.ts";
import { createAstroPlan } from "../plan/index.ts";
import {
  applyAstroReplacementPlan,
  createAstroReplacementPlan,
} from "./astro-transform-plan.ts";
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
  const plan = createAstroPlan(source, options);
  const replacements = createAstroReplacementPlan(plan);
  const output = applyAstroReplacementPlan(
    source,
    options.filename,
    replacements,
  );

  return {
    code: output.code,
    map: output.map,
    analysis: plan.analysis,
  };
}
