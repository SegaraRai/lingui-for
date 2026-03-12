import { JS_TS_EXTENSIONS } from "./constants.ts";
import type { ScriptKind, ScriptLang } from "./types.ts";

export function stripQuery(id: string): string {
  const queryIndex = id.indexOf("?");
  return queryIndex === -1 ? id : id.slice(0, queryIndex);
}

function hasExtension(
  filename: string,
  extensions: readonly string[],
): boolean {
  return extensions.some((extension) => filename.endsWith(extension));
}

export function isTransformableScript(id: string): boolean {
  return hasExtension(stripQuery(id), JS_TS_EXTENSIONS);
}

export function createScriptFilename(
  filename: string,
  kind: ScriptKind,
  lang: ScriptLang,
): string {
  const base = stripQuery(filename).replace(/\.svelte$/, "");
  const suffix = kind === "module" ? ".module" : ".instance";
  return `${base}${suffix}.${lang}`;
}
