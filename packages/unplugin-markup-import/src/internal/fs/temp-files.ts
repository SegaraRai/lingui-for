import { createHash } from "node:crypto";

import { basenamePath, joinPath } from "./paths.ts";

export function createTempFilePath(
  tempDir: string,
  originalFileName: string,
  content: string,
  extension: string,
): string {
  const orgFilename = basenamePath(originalFileName).replaceAll(".", "-");
  const contentHash = createHash("sha256")
    .update(originalFileName)
    .update("\0")
    .update(content)
    .digest("hex")
    .slice(0, 10);

  return joinPath(tempDir, `${orgFilename}-${contentHash}${extension}`);
}
