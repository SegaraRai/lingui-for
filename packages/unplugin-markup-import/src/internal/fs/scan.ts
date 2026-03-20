import { readdirSync } from "node:fs";

import { joinPath, normalizePath } from "./paths.ts";

export function collectSourceFiles(
  rootDir: string,
  include: (filename: string) => boolean,
): string[] {
  const files: string[] = [];
  const entries = readdirSync(rootDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const entry of entries) {
    const filename = normalizePath(joinPath(rootDir, entry.name));

    if (entry.isDirectory()) {
      if (entry.name === ".unplugin-markup-import") {
        continue;
      }

      files.push(...collectSourceFiles(filename, include));
      continue;
    }

    if (include(filename)) {
      files.push(filename);
    }
  }

  return files;
}

export function relativePathFromSourceDir(
  sourceDir: string,
  filename: string,
): string {
  return normalizePath(filename).slice(normalizePath(sourceDir).length + 1);
}
