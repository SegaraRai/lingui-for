import { defineConfig } from "@lingui-for/framework-core/config";
import "lingui-for-astro/extractor";
import "lingui-for-svelte/config";

defineConfig({
  locales: ["en"],
  framework: {
    svelte: {
      packages: ["custom-svelte-macro"],
      whitespace: "svelte",
    },
  },
});

defineConfig({
  locales: ["en"],
  framework: {
    astro: {
      packages: ["custom-astro-macro"],
      whitespace: "astro",
    },
  },
});
