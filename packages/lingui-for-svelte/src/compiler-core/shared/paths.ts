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
