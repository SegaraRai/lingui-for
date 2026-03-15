import { analyzeSvelte } from "../analysis/svelte-analysis.ts";
import { normalizeLinguiConfig } from "../shared/config.ts";
import { createScriptFilename } from "../shared/paths.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";
import { buildDirectProgramMap } from "./source-map.ts";
import { buildCombinedProgram } from "./synthetic-program.ts";
import type { ExtractionUnit } from "./types.ts";

/**
 * Builds extraction-ready JS/TS units from a Svelte source file.
 *
 * @param source Full `.svelte` source text.
 * @param options Filename and optional Lingui config used for parsing and transformation.
 * @returns An array of extraction units, each containing transformed code and an optional source map.
 *
 * Module script content is transformed independently. Instance script content, markup
 * expressions, and component macros are first lifted into a synthetic program and then
 * transformed together. Units that do not contain extracted Lingui descriptor markers are dropped.
 */
export function createExtractionUnits(
  source: string,
  options: LinguiSvelteTransformOptions,
): ExtractionUnit[] {
  const analysis = analyzeSvelte(source, options.filename);
  const linguiConfig = normalizeLinguiConfig(options.linguiConfig);
  const units: ExtractionUnit[] = [];

  if (analysis.module) {
    const transformedModule = transformProgram(analysis.module.content, {
      extract: true,
      filename: createScriptFilename(
        options.filename,
        "module",
        analysis.module.lang,
      ),
      lang: analysis.module.lang,
      linguiConfig,
      translationMode: "extract",
      inputSourceMap: buildDirectProgramMap(
        source,
        options.filename,
        analysis.module.contentStart,
        analysis.module.content,
      ),
    });

    if (isExtractionCodeRelevant(transformedModule.code)) {
      units.push({
        code: transformedModule.code,
        map: transformedModule.map,
      });
    }
  }

  if (
    analysis.instance ||
    analysis.expressions.length > 0 ||
    analysis.components.length > 0
  ) {
    const combined = buildCombinedProgram(
      source,
      options.filename,
      analysis.instance,
      analysis.expressions,
      analysis.components,
    );
    const transformedInstance = transformProgram(combined.code, {
      extract: true,
      filename: createScriptFilename(
        options.filename,
        "instance",
        analysis.instance?.lang ?? "ts",
      ),
      lang: analysis.instance?.lang ?? "ts",
      linguiConfig,
      translationMode: "extract",
      inputSourceMap: combined.map,
    });

    if (isExtractionCodeRelevant(transformedInstance.code)) {
      units.push({
        code: transformedInstance.code,
        map: transformedInstance.map,
      });
    }
  }

  return units;
}

function isExtractionCodeRelevant(code: string): boolean {
  return code.includes("/*i18n*/");
}
