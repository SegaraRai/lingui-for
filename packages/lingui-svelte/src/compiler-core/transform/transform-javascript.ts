import type { RawSourceMap } from "source-map";

import { normalizeLinguiConfig } from "../shared/config.ts";
import { PACKAGE_MACRO } from "../shared/constants.ts";
import { getScriptLangFromFilename, stripQuery } from "../shared/paths.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";

/**
 * Transforms a plain JS/TS-family module that imports lingui-for-svelte macros.
 *
 * @param code Source code for a JS/TS-family file.
 * @param options Filename and optional Lingui config.
 * @param extract Whether the transform is being run for extraction instead of emitted code.
 * @returns Transformed code plus source map, or `null` when the file does not appear to import
 * the macro package at all.
 *
 * This is the JS/TS entry point used by both the unplugin and the extractor. It performs a
 * cheap package-name check to skip irrelevant files, determines parser language from the
 * filename, and then delegates to the shared Babel/Lingui transform.
 */
export function transformJavaScriptMacros(
  code: string,
  options: LinguiSvelteTransformOptions,
  extract = false,
): { code: string; map: RawSourceMap | null } | null {
  if (!code.includes(PACKAGE_MACRO)) {
    // does not seem to contain macros, skip transformation to save time
    return null;
  }

  const filename = stripQuery(options.filename);
  const transformed = transformProgram(code, {
    extract,
    filename,
    lang: getScriptLangFromFilename(filename),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: extract ? "extract" : "raw",
  });

  return {
    code: transformed.code,
    map: transformed.map,
  };
}
