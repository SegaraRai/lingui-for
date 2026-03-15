import { JS_TS_EXTENSIONS } from "./constants.ts";
import type { ScriptKind, ScriptLang } from "./types.ts";

/**
 * Removes a query suffix from an import id or filename-like string.
 *
 * @param id Raw module id, which may include a query such as `?raw` or `?worker`.
 * @returns The same id without its query portion.
 *
 * This is used before extension checks and synthetic filename generation so Vite/Rollup-style
 * query parameters do not affect compiler-core decisions.
 */
export function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

/**
 * Checks whether a module id should be treated as a transformable JS/TS-family script.
 *
 * @param id Module id or filename to classify.
 * @returns `true` when the stripped id ends in one of the supported JS/TS extensions.
 *
 * The extractor uses this to decide whether a non-Svelte file should go through the shared
 * JavaScript macro transform before being handed to Lingui's extractor.
 */
export function isTransformableScript(id: string): boolean {
  return hasExtension(stripQuery(id), JS_TS_EXTENSIONS);
}

/**
 * Infers Babel parser language mode from a filename or module id.
 *
 * @param id Filename or module id whose extension determines parser behavior.
 * @returns `"ts"` for TypeScript-family extensions and `"js"` for JavaScript-family extensions.
 *
 * Query parameters are ignored before classification so ids like `file.mts?worker` still parse
 * with the TypeScript parser configuration.
 */
export function getScriptLangFromFilename(id: string): ScriptLang {
  const filename = stripQuery(id);
  return filename.endsWith(".ts") ||
    filename.endsWith(".tsx") ||
    filename.endsWith(".mts") ||
    filename.endsWith(".cts")
    ? "ts"
    : "js";
}

/**
 * Creates a synthetic filename for extracted or transformed script content from a `.svelte` file.
 *
 * @param filename Original `.svelte` filename or id.
 * @param kind Whether the synthetic file represents the instance script or module script.
 * @param lang Parser language assigned to the synthetic script.
 * @returns A stable synthetic filename such as `Component.instance.ts`.
 *
 * Synthetic filenames are used when building temporary JS/TS programs so Babel diagnostics,
 * Lingui metadata, and source maps can distinguish instance-script and module-script transforms.
 */
export function createScriptFilename(
  filename: string,
  kind: ScriptKind,
  lang: ScriptLang,
): string {
  const base = stripQuery(filename).replace(/\.svelte$/, "");
  const suffix = kind === "module" ? ".module" : ".instance";
  return `${base}${suffix}.${lang}`;
}

function hasExtension(
  filename: string,
  extensions: readonly string[],
): boolean {
  return extensions.some((extension) => filename.endsWith(extension));
}
