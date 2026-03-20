import { parse as parseSvelte } from "svelte/compiler";

import {
  collectModuleSpecifiers,
  collectRelativeImports,
  collectRelativeMarkupImports,
  createMarkupFacadeModule,
  rewriteMarkupImports,
} from "../facade.ts";
import type {
  MarkupFacadeModule,
  ResolveFacadeSourceSpecifier,
  RewriteMarkupImport,
  RewriteMarkupImportsResult,
  ScriptRange,
} from "../types.ts";

const SVELTE_EXTENSION = ".svelte";

export function rewriteSvelteImports(
  source: string,
  filename: string,
  rewriteImport: RewriteMarkupImport,
): RewriteMarkupImportsResult {
  return rewriteMarkupImports(
    source,
    filename,
    SVELTE_EXTENSION,
    collectScripts,
    rewriteImport,
  );
}

export function collectRelativeSvelteImports(
  source: string,
  filename: string,
): readonly string[] {
  return collectRelativeMarkupImports(
    source,
    filename,
    SVELTE_EXTENSION,
    collectScripts,
  );
}

export function collectRelativeSvelteModuleImports(
  source: string,
  filename: string,
): readonly string[] {
  return collectRelativeImports(source, filename, collectScripts);
}

export function collectSvelteModuleSpecifiers(
  source: string,
  filename: string,
): readonly string[] {
  return collectModuleSpecifiers(source, filename, collectScripts);
}

export function createSvelteFacadeModule(
  source: string,
  filename: string,
  relativePath: string,
  resolveFacadeSourceSpecifier?: ResolveFacadeSourceSpecifier,
): MarkupFacadeModule {
  return createMarkupFacadeModule(
    source,
    filename,
    relativePath,
    SVELTE_EXTENSION,
    collectScripts,
    resolveFacadeSourceSpecifier,
  );
}

function collectScripts(source: string, filename: string): ScriptRange[] {
  const ast = parseSvelte(source, { filename });
  const scripts: ScriptRange[] = [];

  if (ast.instance) {
    scripts.push(toScriptRange(source, ast.instance, "instance"));
  }

  if (ast.module) {
    scripts.push(toScriptRange(source, ast.module, "module"));
  }

  return scripts;
}

function toScriptRange(
  source: string,
  script: NonNullable<ReturnType<typeof parseSvelte>["instance"]>,
  kind: "instance" | "module",
): ScriptRange {
  const openEnd = source.indexOf(">", script.start) + 1;
  const closeStart = script.end - "</script>".length;
  const contentStart = openEnd + (source[openEnd] === "\n" ? 1 : 0);
  const content = source.slice(contentStart, closeStart);
  const openingTag = source.slice(script.start, openEnd);
  const langMatch = /\blang\s*=\s*["']([^"']+)["']/.exec(openingTag);
  const langValue = langMatch?.[1] ?? "";

  return {
    content,
    contentStart,
    kind,
    lang: langValue === "ts" ? "ts" : "js",
  };
}
