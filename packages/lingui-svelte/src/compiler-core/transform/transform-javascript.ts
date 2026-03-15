import type { RawSourceMap } from "source-map";

import { normalizeLinguiConfig } from "../shared/config.ts";
import { PACKAGE_MACRO } from "../shared/constants.ts";
import { getScriptLangFromFilename, stripQuery } from "../shared/paths.ts";
import type { LinguiSvelteTransformOptions } from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";

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
