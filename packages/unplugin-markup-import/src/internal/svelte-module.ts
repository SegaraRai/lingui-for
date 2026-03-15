import { parse as parseSvelte } from "svelte/compiler";

import {
  collectRelativeMarkupImports,
  createMarkupFacadeModule,
  rewriteMarkupImports,
} from "./markup-module.ts";
import type {
  MarkupFacadeModule,
  RewriteMarkupImport,
  RewriteMarkupImportsResult,
  ScriptRange,
} from "./types.ts";

const SVELTE_EXTENSION = ".svelte";

/**
 * Rewrites import and export specifiers inside `<script>` blocks of a Svelte
 * source file.
 *
 * This is a low-level helper that applies a caller-provided specifier mapping
 * without making any assumptions about bundler integration.
 */
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

/**
 * Collects direct relative `.svelte` imports referenced from instance and
 * module `<script>` blocks.
 *
 * The returned specifiers are left as-written in the source so callers can
 * resolve them relative to the current file as needed.
 */
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

/**
 * Builds the rewritten emitted `.svelte` source plus its companion facade
 * modules for a single Svelte file.
 *
 * Relative non-Svelte imports are redirected to a generated
 * `*.svelte.imports.mjs` facade so the original `.svelte` file can be shipped
 * alongside bundled JavaScript output.
 */
export function createSvelteFacadeModule(
  source: string,
  filename: string,
  relativePath: string,
): MarkupFacadeModule {
  return createMarkupFacadeModule(
    source,
    filename,
    relativePath,
    SVELTE_EXTENSION,
    collectScripts,
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
