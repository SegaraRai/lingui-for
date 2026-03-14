import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(rootDir, "..");
const runtimeFiles = ["Trans.svelte", "RenderTransNodes.svelte"];
const runtimeDistDir = resolve(packageDir, "dist/runtime");

await mkdir(runtimeDistDir, { recursive: true });

for (const file of runtimeFiles) {
  await copyFile(
    resolve(packageDir, "src/runtime", file),
    resolve(runtimeDistDir, file),
  );
}
