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
    scanFilter.include.some((pattern) =>
      candidates.some((candidate) => pathPosix.matchesGlob(candidate, pattern)),
    );
  if (!included) {
    return false;
  }

  return !scanFilter.exclude.some((pattern) =>
    candidates.some((candidate) => pathPosix.matchesGlob(candidate, pattern)),
  );
}
