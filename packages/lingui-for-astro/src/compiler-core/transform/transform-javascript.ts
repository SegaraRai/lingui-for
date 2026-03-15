import { normalizeJavaScriptLinguiConfig } from "../shared/config.ts";
import { PACKAGE_MACRO_ALIASES } from "../shared/constants.ts";
import { stripQuery } from "../shared/paths.ts";
import type {
  LinguiAstroTransformOptions,
  RawSourceMapLike,
} from "../shared/types.ts";
import { transformProgram } from "./babel-transform.ts";

export function transformJavaScriptMacros(
  code: string,
  options: LinguiAstroTransformOptions,
  extract = false,
): { code: string; map: RawSourceMapLike | null } | null {
  if (
    !PACKAGE_MACRO_ALIASES.some((packageName) => code.includes(packageName))
  ) {
    return null;
  }

  const filename = stripQuery(options.filename);
  const result = transformProgram(code, {
    extract,
    filename,
    linguiConfig: normalizeJavaScriptLinguiConfig(options.linguiConfig),
    translationMode: extract ? "extract" : "raw",
  });

  return {
    code: result.code,
    map: (result.map as RawSourceMapLike | null | undefined) ?? null,
  };
}
