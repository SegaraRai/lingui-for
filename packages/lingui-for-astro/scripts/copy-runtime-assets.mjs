import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFiles = [
  "RuntimeTrans.astro",
  "RenderTransNode.astro",
  "RenderTransNodes.astro",
];

await mkdir(resolve(rootDir, "dist/runtime"), { recursive: true });

for (const file of runtimeFiles) {
  await cp(
    resolve(rootDir, "src/runtime", file),
    resolve(rootDir, "dist/runtime", file),
  );
}
