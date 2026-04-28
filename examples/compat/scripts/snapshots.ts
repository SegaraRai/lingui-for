import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { snapshotsRoot } from "./paths.ts";
import type { CompatCase, CompatProject } from "./types.ts";

type SnapshotMismatch = {
  actualPath: string;
  snapshotPath: string;
};

export function verifyProjectSnapshots(
  projectRoot: string,
  compatCase: CompatCase,
  project: CompatProject,
  updateSnapshots: boolean,
): void {
  const snapshots = project.snapshots ?? [];
  if (snapshots.length === 0) {
    return;
  }

  const snapshotDir = path.join(
    snapshotsRoot,
    `${compatCase.name}_${path.basename(project.cwd)}`,
  );
  const mismatches: SnapshotMismatch[] = [];

  for (const snapshot of snapshots) {
    const actualPath = path.join(projectRoot, snapshot);
    const snapshotPath = path.join(snapshotDir, snapshot);
    assertSnapshotFile(actualPath, snapshotPath, updateSnapshots, mismatches);
  }

  if (mismatches.length > 0) {
    throw new Error(
      [
        `${compatCase.name}:${project.cwd} snapshot mismatch:`,
        ...mismatches.map(
          ({ actualPath, snapshotPath }) =>
            `  ${path.relative(process.cwd(), actualPath)} != ${path.relative(process.cwd(), snapshotPath)}`,
        ),
        "Run with -u or --update to update compatibility snapshots.",
      ].join("\n"),
    );
  }
}

function assertSnapshotFile(
  actualPath: string,
  snapshotPath: string,
  updateSnapshots: boolean,
  mismatches: SnapshotMismatch[],
): void {
  if (!existsSync(actualPath)) {
    throw new Error(`Snapshot source does not exist: ${actualPath}`);
  }

  const actual = normalizeSnapshot(readFileSync(actualPath, "utf8"));
  if (!existsSync(snapshotPath)) {
    writeSnapshot(snapshotPath, actual);
    console.log(`+ snapshot ${snapshotPath}`);
    return;
  }

  const expected = normalizeSnapshot(readFileSync(snapshotPath, "utf8"));
  if (actual === expected) {
    console.log(`✓ snapshot ${snapshotPath}`);
    return;
  }

  if (updateSnapshots) {
    writeSnapshot(snapshotPath, actual);
    console.log(`~ snapshot ${snapshotPath}`);
    return;
  }

  mismatches.push({ actualPath, snapshotPath });
}

function writeSnapshot(snapshotPath: string, content: string): void {
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, content);
}

function normalizeSnapshot(content: string): string {
  return content
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(
      /^"POT-Creation-Date: .+\\n"$/m,
      '"POT-Creation-Date: <normalized>\\n"',
    );
}
