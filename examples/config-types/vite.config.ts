import { defineConfig } from "vite-plus";

const projects = [
  "tsconfig.none.json",
  "tsconfig.astro-only.json",
  "tsconfig.svelte-only.json",
  "tsconfig.astro-config-svelte-extractor.json",
  "tsconfig.svelte-config-astro-extractor.json",
];

export default defineConfig({
  run: {
    tasks: {
      check: {
        command: projects.map((project) => `tsc -p ${project}`).join(" && "),
        dependsOn: ["lingui-for-astro#build", "lingui-for-svelte#build"],
        cache: false,
      },
    },
  },
});
