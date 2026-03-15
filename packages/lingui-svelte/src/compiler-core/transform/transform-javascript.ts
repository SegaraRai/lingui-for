import type { RawSourceMap } from "source-map";

import { normalizeLinguiConfig } from "../shared/config.ts";
import { MACRO_PACKAGE } from "../shared/constants.ts";
import { stripQuery } from "../shared/paths.ts";
import type {
  LinguiSvelteTransformOptions,
  ScriptLang,
} from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";

export function transformJavaScriptMacros(
  code: string,
  options: LinguiSvelteTransformOptions,
  extract = false,
): { code: string; map: RawSourceMap | null } | null {
  if (!code.includes(MACRO_PACKAGE)) {
    // does not seem to contain macros, skip transformation to save time
    return null;
  }

  const filename = stripQuery(options.filename);
  const transformed = transformProgram(code, {
    extract,
    filename,
    lang: getJavaScriptLang(filename),
    linguiConfig: normalizeLinguiConfig(options.linguiConfig),
    translationMode: extract ? "extract" : "raw",
  });

  return {
    code: transformed.code,
    map: transformed.map,
  };
}

function getJavaScriptLang(filename: string): ScriptLang {
  return filename.endsWith(".ts") || filename.endsWith(".tsx") ? "ts" : "js";
}
