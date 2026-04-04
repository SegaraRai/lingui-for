import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  runExtract,
  runTransform,
  type CliOptions,
} from "./examples/conformance/inspect.ts";

const PROJECT_ROOT = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_DIR = path.join(
  PROJECT_ROOT,
  "crates/lingui-analyzer/benches/fixtures",
);

const allFiles = await readdir(FIXTURE_DIR);
const sourceFiles = allFiles.filter((file) =>
  /^[^.]+\.(?:astro|svelte)$/.test(file),
);

const cleanMode = process.argv[2] === "clean" || process.argv[2] === "--clean";
if (cleanMode) {
  const cleanFiles = allFiles.filter((file) =>
    sourceFiles.some((source) => file.startsWith(source + ".")),
  );

  for (const file of cleanFiles) {
    const filepath = path.join(FIXTURE_DIR, file);
    await rm(filepath);
    console.log(`Removed artifact ${file}`);
  }

  process.exit(0);
}

for (const file of sourceFiles) {
  const framework = file.endsWith(".astro") ? "astro" : "svelte";
  const filepath = path.join(FIXTURE_DIR, file);
  const source = await readFile(filepath, "utf8");

  const options: CliOptions = {
    artifacts: true,
    artifactsDir: null,
    file: filepath,
    framework,
    extract: true,
    transform: true,
    whitespace: "auto",
  };

  const extracted = await runExtract(source, options);
  console.log(`Extracted ${extracted.length} messages from ${file}`);
  const transformed = await runTransform(source, options);
  console.log(`Transformed ${file} to ${transformed.length} characters`);
}
