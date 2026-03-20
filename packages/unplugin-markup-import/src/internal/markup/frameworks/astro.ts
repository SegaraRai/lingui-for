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

const ASTRO_EXTENSION = ".astro";

export function rewriteAstroImports(
  source: string,
  filename: string,
  rewriteImport: RewriteMarkupImport,
): RewriteMarkupImportsResult {
  return rewriteMarkupImports(
    source,
    filename,
    ASTRO_EXTENSION,
    collectAstroScripts,
    rewriteImport,
  );
}

export function collectRelativeAstroImports(
  source: string,
  filename: string,
): readonly string[] {
  return collectRelativeMarkupImports(
    source,
    filename,
    ASTRO_EXTENSION,
    collectAstroScripts,
  );
}

export function collectRelativeAstroModuleImports(
  source: string,
  filename: string,
): readonly string[] {
  return collectRelativeImports(source, filename, collectAstroScripts);
}

export function collectAstroModuleSpecifiers(
  source: string,
  filename: string,
): readonly string[] {
  return collectModuleSpecifiers(source, filename, collectAstroScripts);
}

export function createAstroFacadeModule(
  source: string,
  filename: string,
  relativePath: string,
  resolveFacadeSourceSpecifier?: ResolveFacadeSourceSpecifier,
): MarkupFacadeModule {
  return createMarkupFacadeModule(
    source,
    filename,
    relativePath,
    ASTRO_EXTENSION,
    collectAstroScripts,
    resolveFacadeSourceSpecifier,
  );
}

function collectAstroScripts(source: string): readonly ScriptRange[] {
  const frontmatter = findFrontmatter(source);
  if (!frontmatter) {
    return [];
  }

  return [
    {
      content: source.slice(frontmatter.contentStart, frontmatter.contentEnd),
      contentStart: frontmatter.contentStart,
      kind: "frontmatter",
      lang: "ts",
    },
  ];
}

function findFrontmatter(
  source: string,
): { contentStart: number; contentEnd: number } | null {
  const bomOffset = source.startsWith("\uFEFF") ? 1 : 0;
  const leadingWhitespaceMatch = /^[\t \r\n]*/.exec(source.slice(bomOffset));
  const start = bomOffset + (leadingWhitespaceMatch?.[0].length ?? 0);

  if (!source.startsWith("---", start)) {
    return null;
  }

  const openingLineEnd = findLineEnd(source, start);
  if (openingLineEnd === -1) {
    return null;
  }

  const contentStart =
    source[openingLineEnd] === "\r" && source[openingLineEnd + 1] === "\n"
      ? openingLineEnd + 2
      : openingLineEnd + 1;

  let cursor = contentStart;
  while (cursor <= source.length) {
    const lineEnd = findLineEnd(source, cursor);
    const effectiveLineEnd = lineEnd === -1 ? source.length : lineEnd;
    const line = source.slice(cursor, effectiveLineEnd).trim();

    if (line === "---") {
      return {
        contentStart,
        contentEnd:
          cursor > contentStart &&
          source[cursor - 1] === "\n" &&
          source[cursor - 2] === "\r"
            ? cursor - 2
            : cursor > contentStart && source[cursor - 1] === "\n"
              ? cursor - 1
              : cursor,
      };
    }

    if (lineEnd === -1) {
      break;
    }

    cursor =
      source[lineEnd] === "\r" && source[lineEnd + 1] === "\n"
        ? lineEnd + 2
        : lineEnd + 1;
  }

  return null;
}

function findLineEnd(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "\n" || source[index] === "\r") {
      return index;
    }
  }

  return -1;
}
