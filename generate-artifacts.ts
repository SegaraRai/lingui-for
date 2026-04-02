import { readdir, readFile } from "node:fs/promises";
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

const FILES = (await readdir(FIXTURE_DIR)).filter((file) =>
  /^[^.]+\.(?:astro|svelte)$/.test(file),
);

for (const file of FILES) {
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
