import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(rootDir, "..");
const source = resolve(packageDir, "src/runtime/Trans.svelte");
const destination = resolve(packageDir, "dist/runtime/Trans.svelte");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
