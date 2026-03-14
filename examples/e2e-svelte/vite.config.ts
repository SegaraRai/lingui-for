import { sveltekit } from "@sveltejs/kit/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(projectRoot, "..", "..");

export default defineConfig(async () => {
  const pluginEntry = resolve(
    workspaceRoot,
    "packages",
    "lingui-svelte",
    "dist",
    "unplugin",
    "index.mjs",
  );
  const { linguiSvelte } = await import(pathToFileURL(pluginEntry).href);

  return {
    plugins: [linguiSvelte.vite(), sveltekit()],
  };
});
