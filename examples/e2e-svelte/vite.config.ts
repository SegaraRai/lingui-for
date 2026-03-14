import { sveltekit } from "@sveltejs/kit/vite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  const pluginEntry = resolve(
    process.cwd(),
    "..",
    "..",
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
