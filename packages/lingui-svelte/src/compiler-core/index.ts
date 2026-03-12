import MagicString from "magic-string";

import { normalizeLinguiConfig } from "./config.ts";
import {
  createScriptFilename,
  isTransformableScript,
  stripQuery,
} from "./paths.ts";
import {
  buildCombinedProgram,
  splitSyntheticDeclarations,
  transformProgram,
} from "./program-transform.ts";
import { buildDirectProgramMap } from "./source-map.ts";
import { analyzeSvelte } from "./svelte-analysis.ts";
import type {
  ExtractionUnit,
  LinguiSvelteTransformOptions,
  ScriptLang,
  SvelteTransformResult,
} from "./types.ts";

function getJavaScriptLang(filename: string): ScriptLang {
  return filename.endsWith(".ts") || filename.endsWith(".tsx") ? "ts" : "js";
}

export { isTransformableScript };
export type { ExtractionUnit, LinguiSvelteTransformOptions };

export function transformJavaScriptMacros(
  code: string,
  options: LinguiSvelteTransformOptions,
  extract = false,
): { code: string; map: ReturnType<typeof transformProgram>["map"] } | null {
  if (!code.includes("lingui-svelte/macro")) {
    return null;
  }

  const filename = stripQuery(options.filename);
  const transformed = transformProgram(code, {
    extract,
    filename,
    lang: getJavaScriptLang(filename),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
  });

  return {
    code: transformed.code,
    map: transformed.map,
  };
}

export function transformSvelte(
  source: string,
  options: LinguiSvelteTransformOptions,
): SvelteTransformResult {
  const analysis = analyzeSvelte(source, options.filename);
  const linguiConfig = normalizeLinguiConfig(options.linguiConfig);
  const string = new MagicString(source);

  if (analysis.module) {
    const transformedModule = transformProgram(analysis.module.content, {
      extract: false,
      filename: createScriptFilename(
        options.filename,
        "module",
        analysis.module.lang,
      ),
      lang: analysis.module.lang,
      linguiConfig,
      inputSourceMap: buildDirectProgramMap(
        source,
        options.filename,
        analysis.module.contentStart,
        analysis.module.content,
      ),
    });

    string.overwrite(
      analysis.module.contentStart,
      analysis.module.contentEnd,
      transformedModule.code,
    );
  }

  if (analysis.instance || analysis.expressions.length > 0) {
    const combined = buildCombinedProgram(
      source,
      options.filename,
      analysis.instance,
      analysis.expressions,
    );
    const transformedInstance = transformProgram(combined.code, {
      extract: false,
      filename: createScriptFilename(
        options.filename,
        "instance",
        analysis.instance?.lang ?? "ts",
      ),
      lang: analysis.instance?.lang ?? "ts",
      linguiConfig,
      inputSourceMap: combined.map,
    });
    const split = splitSyntheticDeclarations(transformedInstance);

    analysis.expressions
      .slice()
      .sort((left, right) => right.start - left.start)
      .forEach((expression) => {
        const replacement = split.expressionReplacements.get(expression.index);
        if (replacement) {
          string.overwrite(expression.start, expression.end, replacement);
        }
      });

    if (analysis.instance) {
      string.overwrite(
        analysis.instance.contentStart,
        analysis.instance.contentEnd,
        split.scriptCode,
      );
    } else if (split.scriptCode.trim().length > 0) {
      const block = `<script>\n${split.scriptCode}\n</script>\n\n`;

      if (analysis.module) {
        string.appendLeft(
          analysis.module.end,
          `\n\n<script>\n${split.scriptCode}\n</script>`,
        );
      } else {
        string.prepend(block);
      }
    }
  }

  return {
    code: string.toString(),
    map: string.generateMap({
      file: stripQuery(options.filename),
      hires: true,
      includeContent: true,
      source: stripQuery(options.filename),
    }),
  };
}

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
      inputSourceMap: buildDirectProgramMap(
        source,
        options.filename,
        analysis.module.contentStart,
        analysis.module.content,
      ),
    });

    if (transformedModule.code.trim().length > 0) {
      units.push({
        code: transformedModule.code,
        map: transformedModule.map,
      });
    }
  }

  if (analysis.instance || analysis.expressions.length > 0) {
    const combined = buildCombinedProgram(
      source,
      options.filename,
      analysis.instance,
      analysis.expressions,
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
      inputSourceMap: combined.map,
    });

    if (transformedInstance.code.trim().length > 0) {
      units.push({
        code: transformedInstance.code,
        map: transformedInstance.map,
      });
    }
  }

  return units;
}
