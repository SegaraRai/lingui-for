import { stripQuery } from "lingui-for-shared/compiler";

import type { ScriptKind, ScriptLang } from "./types.ts";

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
