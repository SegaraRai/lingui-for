import { posix as pathPosix } from "node:path";

import { normalizePath } from "./paths.ts";
import { relativePathFromSourceDir } from "./scan.ts";

export function normalizeGlobPatterns(
  patterns: string | readonly string[] | undefined,
): readonly string[] {
  if (!patterns) {
    return [];
  }

  return (Array.isArray(patterns) ? patterns : [patterns])
    .map((pattern) => normalizePath(pattern).trim())
    .filter(Boolean);
}

export function matchesScanFilter(
  sourceDir: string,
  filename: string,
  scanFilter: { include: readonly string[]; exclude: readonly string[] },
): boolean {
  const relativePath = relativePathFromSourceDir(sourceDir, filename);
  const candidates = [
    normalizePath(filename),
    relativePath,
    `./${relativePath}`,
  ];

  const included =
    scanFilter.include.length === 0 ||
    matchesGlobPatterns(candidates, scanFilter.include);
  if (!included) {
    return false;
  }

  return !matchesGlobPatterns(candidates, scanFilter.exclude);
}

export function matchesGlobPatterns(
  candidates: readonly string[],
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) =>
    candidates.some((candidate) => pathPosix.matchesGlob(candidate, pattern)),
  );
}
