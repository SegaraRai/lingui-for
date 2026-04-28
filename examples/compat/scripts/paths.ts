import path from "node:path";

export const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
export const compatRoot = path.join(repoRoot, "examples", "compat");
export const snapshotsRoot = path.join(compatRoot, "__snapshots__");
